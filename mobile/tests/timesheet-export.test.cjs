const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/screens/TimesheetScreen.tsx'), 'utf8');
const ast = ts.createSourceFile('TimesheetScreen.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const cacheSource = fs.readFileSync(path.join(__dirname, '../src/services/timesheetExportCache.ts'), 'utf8');
const now = 1794398400000, day = 24 * 60 * 60 * 1000;
const filename = (time, suffix = 'abc', format = 'pdf') => `timesheet_2026-11-02_2026-11-08_${time}_${suffix}.${format}`;
const directory = 'file:///cache/timesheet-exports/';
function handler(name, context) {
  let expression;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) expression = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(expression, name);
  return vm.runInNewContext(ts.transpileModule('result = ' + expression.getText(ast), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
}
function fixture() {
  const calls = { shared: [], deleted: [], errors: [], dialogs: [], downloads: [], reads: [], directories: [], exporting: [] };
  const c = {
    calls, exportLock: { current: null }, exportEpoch: { current: 1 }, exportFocused: { current: true }, exportMounted: { current: true },
    setExporting: value => calls.exporting.push(value), exportScope: 'scope', currentExportScope: { current: 'scope' },
    selectedUserId: 'employee', user: { id: 'employee', companyId: 'company' }, weekStart: '2026-11-02', weekEnd: '2026-11-08',
    API_URL: 'https://example.test/api', t: s => s, sessionRevision: 1, token: 'token', tokenReads: 0, Platform: { OS: 'android' },
    Math, Date: class extends Date { static now() { return now; } }, Error,
  };
  c.api = {
    captureSessionGuard: () => { const revision = c.sessionRevision, token = c.token; return () => !!token && revision === c.sessionRevision && token === c.token; },
    getToken: async () => { c.tokenReads++; return c.token; },
  };
  let renderedUser, renderedGuard;
  c.useMemo = (factory, [user]) => {
    if (user !== renderedUser) { renderedUser = user; renderedGuard = factory(); }
    return renderedGuard;
  };
  c.render = () => { c.isRenderedSessionCurrent = handler('isRenderedSessionCurrent', c); };
  c.render();
  c.FileSystem = {
    cacheDirectory: 'file:///cache/',
    makeDirectoryAsync: async (...args) => { calls.directories.push(args); },
    readDirectoryAsync: async dir => { calls.reads.push(dir); return []; },
    getInfoAsync: async () => ({ exists: true, isDirectory: false, modificationTime: (now - 2 * day) / 1000 }),
    downloadAsync: async (...args) => { calls.downloads.push(args); return { status: 200, headers: { 'Content-Type': args[0].endsWith('format=csv') ? 'text/csv; charset=utf-8' : 'application/pdf' } }; },
    deleteAsync: async uri => { calls.deleted.push(uri); },
  };
  c.Sharing = { isAvailableAsync: async () => true, shareAsync: async (uri, options) => { calls.shared.push({ uri, options }); } };
  c.Alert = { alert: (...args) => (args[0] === 'Export timesheet' ? calls.dialogs : calls.errors).push(args) };
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(cacheSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText,
    { module, exports: module.exports, require: name => { assert.equal(name, 'expo-file-system/legacy'); return c.FileSystem; }, Date: c.Date });
  c.prepareTimesheetExportDirectory = module.exports.prepareTimesheetExportDirectory;
  const run = handler('handleExport', c);
  c.handleExport = (...args) => { c.pendingExport = run(...args); return c.pendingExport; };
  c.chooseExport = handler('chooseExport', c);
  return c;
}
function pick(c, format = 'PDF') {
  c.chooseExport();
  c.calls.dialogs.at(-1)[2].find(button => button.text === format).onPress();
}
async function settle(c) { await c.pendingExport; await new Promise(resolve => setImmediate(resolve)); }
async function run(c, format) { pick(c, format); await settle(c); }

for (const format of ['CSV', 'PDF']) test(`${format} keeps the authenticated binary download and retains the file after chooser completion`, async () => {
  const c = fixture();
  await run(c, format);
  assert.equal(c.calls.downloads.length, 1);
  const [url, uri, options] = c.calls.downloads[0];
  assert.equal(url, `https://example.test/api/time-entries/export?userId=employee&start=2026-11-02&end=2026-11-08&format=${format.toLowerCase()}`);
  assert.match(uri, new RegExp(`^file:///cache/timesheet-exports/timesheet_2026-11-02_2026-11-08_${now}_[a-z0-9]+\\.${format.toLowerCase()}$`));
  assert.equal(options.headers.Authorization, 'Bearer token');
  assert.equal(c.calls.shared.length, 1);
  assert.equal(c.calls.shared[0].uri, uri);
  assert.equal(c.calls.shared[0].options.mimeType, format === 'PDF' ? 'application/pdf' : 'text/csv');
  assert.equal(c.calls.shared[0].options.UTI, format === 'PDF' ? 'com.adobe.pdf' : 'public.comma-separated-values-text');
  assert.deepEqual(c.calls.deleted, []);
  assert.equal(c.exportLock.current, null);
  assert.deepEqual(c.calls.exporting, [true, false]);
});

test('download status/type failures and partial download rejection remove only the generated pre-handoff file', async () => {
  for (const result of [{ status: 403, headers: {} }, { status: 200, headers: { 'content-type': 'text/html' } }, { status: 200, headers: {} }, null]) {
    const c = fixture();
    c.FileSystem.downloadAsync = async (...args) => { c.calls.downloads.push(args); if (!result) throw Error('interrupted download'); return result; };
    await run(c);
    assert.equal(c.calls.shared.length, 0);
    assert.deepEqual(c.calls.deleted, [c.calls.downloads[0][1]]);
    assert.equal(c.calls.errors.length, 1);
    assert.equal(c.exportLock.current, null);
  }
});

test('a native chooser rejection, cancellation, or scope change after handoff never deletes the handed-off URI', async () => {
  for (const outcome of ['reject', 'cancel', 'changed']) {
    const c = fixture();
    c.Sharing.shareAsync = async (uri, options) => {
      c.calls.shared.push({ uri, options });
      if (outcome === 'reject') throw Error('uncertain native result');
      if (outcome === 'changed') { c.exportFocused.current = false; c.sessionRevision++; throw Error('late failure'); }
    };
    await run(c);
    assert.equal(c.calls.shared.length, 1);
    assert.deepEqual(c.calls.deleted, []);
    assert.equal(c.calls.errors.length, outcome === 'reject' ? 1 : 0);
    assert.equal(c.exportLock.current, null);
  }
});

test('unavailable storage/sharing and web perform no download, upload, or native share', async () => {
  for (const kind of ['storage', 'sharing', 'web', 'directory']) {
    const c = fixture();
    if (kind === 'storage') c.FileSystem.cacheDirectory = null;
    if (kind === 'sharing') c.Sharing.isAvailableAsync = async () => false;
    if (kind === 'web') c.Platform.OS = 'web';
    if (kind === 'directory') c.FileSystem.makeDirectoryAsync = async () => { throw Error('storage failed'); };
    await run(c);
    assert.equal(c.calls.downloads.length, 0);
    assert.equal(c.calls.shared.length, 0);
    assert.deepEqual(c.calls.deleted, []);
    assert.equal(c.calls.errors.length, 1);
    assert.equal(c.exportLock.current, null);
  }
});

const changes = {
  scope: c => { c.currentExportScope.current = 'another-account-or-range'; },
  revision: c => { c.sessionRevision++; }, // same token, new authentication revision
  token: c => { c.token = 'new-token'; },
  blur: c => { c.exportFocused.current = false; c.exportEpoch.current++; },
  unmount: c => { c.exportMounted.current = false; c.exportEpoch.current++; },
  returnToScope: c => { c.exportEpoch.current += 2; },
};
for (const boundary of ['token', 'available', 'directory', 'listing', 'metadata', 'prune', 'download', 'finalToken']) {
  test(`stale scope/session/focus at ${boundary} blocks further download/share and stale errors`, async () => {
    for (const change of Object.values(changes)) {
      const c = fixture();
      if (boundary === 'token' || boundary === 'finalToken') c.api.getToken = async () => { if (++c.tokenReads === (boundary === 'token' ? 1 : 2)) change(c); return 'token'; };
      if (boundary === 'available') c.Sharing.isAvailableAsync = async () => { change(c); return false; };
      if (boundary === 'directory') c.FileSystem.makeDirectoryAsync = async () => { change(c); };
      if (boundary === 'listing') c.FileSystem.readDirectoryAsync = async () => { change(c); return [filename(now - 2 * day)]; };
      if (boundary === 'metadata' || boundary === 'prune') {
        c.FileSystem.readDirectoryAsync = async () => [filename(now - 2 * day)];
        if (boundary === 'metadata') c.FileSystem.getInfoAsync = async () => { change(c); return { exists: true, isDirectory: false, modificationTime: 0 }; };
        else c.FileSystem.deleteAsync = async uri => { c.calls.deleted.push(uri); change(c); };
      }
      if (boundary === 'download') c.FileSystem.downloadAsync = async (...args) => {
        c.calls.downloads.push(args); change(c);
        return new Proxy({}, { get() { assert.fail('Stale download metadata must not be read'); } });
      };
      await run(c);
      assert.equal(c.calls.shared.length, 0);
      assert.equal(c.calls.errors.length, 0);
      assert.equal(c.calls.downloads.length, ['download', 'finalToken'].includes(boundary) ? 1 : 0);
      if (c.calls.downloads.length) assert.deepEqual(c.calls.deleted, [c.calls.downloads[0][1]]);
      assert.equal(c.exportLock.current, null);
      if (!c.exportMounted.current) assert.deepEqual(c.calls.exporting, [true]);
    }
  });
}

test('format selection captures the session before awaiting anything and rejects already-stale or unauthenticated UI', () => {
  for (const change of [c => { c.token = null; }, c => { c.exportFocused.current = false; }, c => { c.exportMounted.current = false; }, changes.scope]) {
    const c = fixture(); change(c); c.chooseExport();
    assert.equal(c.calls.dialogs.length, 0);
    assert.equal(c.tokenReads, 0);
    assert.equal(c.exportLock.current, null);
  }
});

test('old format callbacks cannot begin an export after session/scope/focus changes', async () => {
  for (const change of Object.values(changes)) {
    const c = fixture(); c.chooseExport(); change(c);
    c.calls.dialogs[0][2][1].onPress(); await settle(c);
    assert.equal(c.tokenReads, 0);
    assert.equal(c.calls.downloads.length, 0);
    assert.equal(c.calls.errors.length, 0);
    assert.equal(c.exportLock.current, null);
  }
});

test('replacement authentication before chooser opening cannot attach a new session to the old rendered user', async () => {
  for (const newToken of ['token', 'replacement-token']) {
    const c = fixture();
    c.token = newToken; c.sessionRevision++;
    c.chooseExport();
    assert.equal(c.calls.dialogs.length, 0);
    assert.equal(c.tokenReads, 0);
    // Unrelated state changes must reuse the old user-associated guard.
    c.render(); c.chooseExport();
    assert.equal(c.calls.dialogs.length, 0);
    assert.equal(c.calls.downloads.length, 0);
    // AuthContext finally publishes the user for the installed session.
    c.user = { id: 'replacement-employee', companyId: 'replacement-company' };
    c.selectedUserId = c.user.id;
    c.exportScope = c.currentExportScope.current = 'replacement-scope';
    c.exportEpoch.current++; c.render();
    await run(c);
    assert.equal(c.calls.shared.length, 1);
    assert.match(c.calls.downloads[0][0], /userId=replacement-employee&/);
    assert.equal(c.calls.downloads[0][2].headers.Authorization, `Bearer ${newToken}`);
  }
});

test('one synchronous lock spans format choice and native share, including duplicate callbacks/dismissal', async () => {
  const c = fixture(); let finish;
  c.Sharing.shareAsync = async (uri, options) => { c.calls.shared.push({ uri, options }); await new Promise(resolve => { finish = resolve; }); };
  c.chooseExport(); c.chooseExport();
  assert.equal(c.calls.dialogs.length, 1);
  const dialog = c.calls.dialogs[0];
  dialog[2][1].onPress(); dialog[2][0].onPress(); dialog[3].onDismiss(); c.chooseExport();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(c.calls.downloads.length, 1);
  assert.equal(c.calls.shared.length, 1);
  assert.notEqual(c.exportLock.current, null);
  finish(); await settle(c);
  assert.equal(c.exportLock.current, null);
  assert.deepEqual(c.calls.deleted, []);
});

test('cancel/dismiss releases the chooser lock, but callbacks from that dialog cannot affect its replacement', async () => {
  for (const cancel of [dialog => dialog[2][2].onPress(), dialog => dialog[3].onDismiss()]) {
    const c = fixture(); c.chooseExport(); const old = c.calls.dialogs[0]; cancel(old);
    assert.equal(c.exportLock.current, null);
    c.chooseExport(); const replacement = c.exportLock.current;
    old[2][0].onPress(); cancel(old); await settle(c);
    assert.equal(c.exportLock.current, replacement);
    assert.equal(c.calls.downloads.length, 0);
    c.calls.dialogs[1][2][1].onPress(); await settle(c);
    assert.equal(c.calls.shared.length, 1);
    assert.equal(c.exportLock.current, null);
  }
});

test('failed cleanup does not leave the export lock stuck', async () => {
  const c = fixture();
  c.FileSystem.downloadAsync = async () => { throw Error('partial'); };
  c.FileSystem.deleteAsync = async () => { throw Error('cleanup unavailable'); };
  await run(c);
  assert.equal(c.exportLock.current, null);
  assert.equal(c.calls.errors.length, 1);
});

test('pruning only removes old generated CSV/PDF files within the dedicated cache directory', async () => {
  const c = fixture();
  const oldPdf = filename(now - 2 * day), oldCsv = filename(now - 2 * day, 'def', 'csv');
  const updated = filename(now - 3 * day, 'updated'), folder = filename(now - 3 * day, 'folder');
  const unreadable = filename(now - 3 * day, 'unreadable');
  c.FileSystem.readDirectoryAsync = async dir => {
    assert.equal(dir, directory);
    return [oldPdf, oldCsv, filename(now - day), filename(now), filename(now + day), updated, folder, unreadable,
      'original.pdf', 'recording.m4a', 'schedule_0000000000000_a.ics', '../' + oldPdf, oldPdf + '/child', oldPdf + '.bak', 'timesheet_bad.pdf'];
  };
  c.FileSystem.getInfoAsync = async uri => {
    if (uri.endsWith(unreadable)) throw Error('cannot inspect');
    return { exists: true, isDirectory: uri.endsWith(folder), modificationTime: (uri.endsWith(updated) ? now : now - 2 * day) / 1000 };
  };
  await run(c);
  assert.deepEqual(c.calls.deleted, [directory + oldPdf, directory + oldCsv]);
  assert.equal(c.calls.shared.length, 1);
  assert.equal(c.calls.errors.length, 0);
});

test('cache listing/pruning errors are best effort and do not suppress a valid export', async () => {
  for (const error of ['listing', 'delete']) {
    const c = fixture();
    c.FileSystem.readDirectoryAsync = async () => { if (error === 'listing') throw Error('listing'); return [filename(now - 2 * day)]; };
    c.FileSystem.deleteAsync = async () => { throw Error('delete'); };
    await run(c);
    assert.equal(c.calls.shared.length, 1);
    assert.equal(c.calls.errors.length, 0);
  }
});

test('focus lifecycle invalidates prior export generations, including blur followed by refocus', () => {
  let focus;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useFocusEffect') focus = node.arguments[0].arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(focus);
  const c = fixture();
  const setup = vm.runInNewContext(ts.transpileModule('result = ' + focus.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, c);
  c.exportFocused.current = false;
  const cleanup = setup(); assert.equal(c.exportFocused.current, true);
  const epoch = c.exportEpoch.current;
  cleanup(); assert.equal(c.exportFocused.current, false); assert.equal(c.exportEpoch.current, epoch + 1);
  setup(); assert.equal(c.exportFocused.current, true); assert.equal(c.exportEpoch.current, epoch + 1);
  assert.match(source, /if \(currentExportScope\.current !== exportScope\) exportEpoch\.current \+= 1/);
});
