const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const src = path.join(__dirname, '../src');
const filePath = id => path.join(src, id);
const source = readFileSync(filePath('services/attachmentDeviceExport.ts'), 'utf8');
const id = '923edcd9-af56-4100-a64c-892ea8cf3746';
const attachment = '/chat/attachments/' + id + '/content';

function fixture({ status = 200, mime = 'application/pdf', length = '4', body = ['DA', 'TA'], options } = {}) {
  const calls = [];
  let allowed = true;
  let cancel;
  const controller = new AbortController();
  class Directory {
    constructor(...parts) { this.name = parts.at(-1); }
    create() { calls.push(['folder']); }
    delete() { calls.push(['delete']); }
    list() { return []; }
  }
  class File {
    constructor(_folder, name) { this.uri = 'file:///cache/' + name; this.size = 0; }
    create() { calls.push(['file', this.uri]); }
    open() { return {
      writeBytes: value => { this.size += value.length; calls.push(['bytes', Buffer.from(value).toString()]); },
      close: () => calls.push(['close']),
    }; }
  }
  const headers = {
    'content-type': mime, 'content-length': '2', 'x-chat-attachment-bytes': length, 'content-disposition': "attachment; filename*=UTF-8''Safety%20Plan.pdf"
  };
  const sharing = {
    isAvailableAsync: async () => true, shareAsync: async (...args) => calls.push(['share', ...args]),
    ...options?.sharing
  };
  const mocks = {
    'expo/fetch': { fetch: async (url, init) => {
      calls.push(['fetch', url, init]); let i = 0;
      return { status, headers: { get: k => headers[k] || null },
        body: { getReader: () => ({
          read: async () => {
            if (options?.onRead) await options.onRead(i, () => { allowed = false; });
            return i >= body.length ? { done: true } : { done: false, value: Buffer.from(body[i++]) };
          },
          cancel: async () => { cancel = true; },
          releaseLock: () => calls.push(['release']),
        }) },
      }; } },
    'expo-file-system': { Directory, File, Paths: { cache: 'cache' } },
    'expo-sharing': sharing,
    './api': { API_URL: options?.origin ?? 'https://app.example.test/api', api: {
      getToken: async () => { if (options?.onToken) options.onToken(() => { allowed = false; }); return 'synthetic'; }
    } }
  };
  const ctx = { exports: {}, require: key => mocks[key], URL, AbortController };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: 1, target: 9 } }).outputText, ctx);
  return { calls, c: ctx.exports, cancelled: () => cancel,
    run: (route = attachment) => ctx.exports.exportAttachmentToDevice(route, 'backup.pdf', () => allowed,
      phase => { calls.push(['phase', phase]); options?.onPhase?.(phase, () => { allowed = false; }); }, 'Save file', controller.signal) };
}

test('chat PDF gets byte-identical cache copy with server filename and deliberate destination chooser', async () => {
  const f = fixture(); await f.run();
  assert.deepEqual(f.calls.filter(x => x[0] === 'bytes').map(x => x[1]), ['DA', 'TA']);
  assert.ok(f.calls.some(x => x[0] === 'share' && x[1] === 'file:///cache/Safety Plan.pdf' && x[2].mimeType === 'application/pdf'));
  const fetch = f.calls.find(x => x[0] === 'fetch');
  assert.equal(fetch[1], 'https://app.example.test/api' + attachment);
  assert.equal(fetch[2].redirect, 'error');
  assert.equal(fetch[2].credentials, 'omit');
  assert.equal(fetch[2].headers.Authorization, 'Bearer synthetic');
  assert.equal(f.calls.some(x => x[0] === 'delete'), false);
  assert.deepEqual(f.calls.filter(x => x[0] === 'phase').map(x => x[1]), ['downloading', 'downloading', 'downloading', 'opening']);
});

for (const mime of ['image/heic','video/mp4','audio/mp4']) {
  test(`ordinary chat ${mime} stages its validated bytes and MIME`, async () => {
    const f = fixture({ mime }); await f.run();
    assert.equal(f.calls.find(x => x[0] === 'share')[2].mimeType, mime);
  });
}

test('no export action for external URLs, support, project album or task evidence', async () => {
  const f = fixture();
  for (const route of ['https://app.example.test' + attachment, attachment + '?a=b',
    '/support/attachments/'+id+'/content', '/media/project/'+id+'/download/photo/'+id,
    '/tasks/'+id+'/evidence/'+id+'/content','/chat/attachments/not-a-uuid/content']) {
    assert.equal(f.c.canOfferChatFileExport(route), false); await f.run(route);
  }
  assert.equal(f.calls.length, 0);
});

for (const opts of [{ status: 401 },{ status: 206 },{ mime:'text/html' },{ mime:'image/svg+xml' },{ mime:'application/problem+json' },{ length:'5' },{ length:'1' },{ length:null },{ length:'0' },{ length:'1e2' },{ length:'26214401' },{ length:'4.0' },{ length:'4,4' }])
test('no chooser for unavailable, unsafe, or partial file: '+JSON.stringify(opts), async () => {
  const f = fixture(opts); await assert.rejects(f.run());
  assert.equal(f.calls.some(x => x[0]==='share'), false);
  assert.equal(f.cancelled(), true);
  if (f.calls.some(x => x[0]==='file')) assert.ok(f.calls.some(x => x[0]==='delete'));
});

test('owner loss before token lookup finishes prevents network', async () => {
  const f = fixture({ options:{onToken: revoke => revoke()} });
  await assert.rejects(f.run(), /view changed/);
  assert.equal(f.calls.some(x => x[0]==='fetch'), false);
});

test('interrupted or retired transfer deletes unpresented cache and never opens chooser', async () => {
  const f = fixture({ options:{onRead: async (i, revoke) => { if (i === 1) revoke(); }} });
  await assert.rejects(f.run(), /view changed/);
  assert.ok(f.calls.some(x => x[0]==='delete'));
  assert.equal(f.calls.some(x => x[0]==='share'), false);
});

test('non-HTTPS API origin cannot receive token', async () => {
  const f = fixture({ options:{origin:'http://app.example.test'} });
  await assert.rejects(f.run(), /origin/); assert.deepEqual(f.calls, []);
});

test('suggested filenames keep unicode and suffix, strip path/control, and safely fall back', () => {
  const f = fixture();
  assert.equal(f.c.exportFilename("attachment; filename*=UTF-8''Projet%20%C3%A9t%C3%A9.mp4",'old.mov'), 'Projet été.mp4');
  assert.equal(f.c.exportFilename('inline; filename="../../report.pdf"', 'backup.pdf'), 'report.pdf');
  assert.equal(f.c.exportFilename("attachment; filename*=UTF-8''%GG", 'backup.pdf'), 'backup.pdf');
  assert.equal(f.c.exportFilename(null, 'x'.repeat(170)+'.m4a').slice(-4), '.m4a');
});

test('ordinary chat offers a dedicated control without exporting evidence through the new path', () => {
  const component = readFileSync(filePath('components/MediaAttachment.tsx'), 'utf8');
  assert.match(component, /canOfferChatFileExport\(path\)&&<SaveMediaFile/);
  assert.match(readFileSync(filePath('screens/ChatScreen.tsx'), 'utf8'), /<MediaAttachment sessionCurrent=\{isCurrent\}/);
});

test('save UI is stateful, accessible, restrained on Android', () => {
  const button = readFileSync(filePath('components/SaveMediaFile.tsx'), 'utf8');
  assert.match(button, /android \? 'Open or share file…' : 'Save to Files…'/);
  assert.match(button, /accessibilityLabel=.*Open or share \{name\}/);
  assert.match(button, /accessibilityState=\{\{ busy: !!phase, disabled: !!phase \}\}/);
  assert.match(button, /accessibilityRole="alert".*Tap again to retry/);
  assert.match(button, /minHeight: 44/);
  assert.match(button, /operation\.current\.abort\(\)/);
  assert.match(button, /Download cancelled/);
});

test('ownership loss in opening phase never hands private data to another app', async () => {
  const f = fixture({ options: { onPhase: (phase, revoke) => { if (phase === 'opening') revoke(); } } });
  await assert.rejects(f.run(), /view changed/);
  assert.equal(f.calls.some(x => x[0] === 'share'), false);
  assert.ok(f.calls.some(x => x[0] === 'delete'));
});
