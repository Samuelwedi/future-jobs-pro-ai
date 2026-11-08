const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const backend = path.resolve(__dirname, '..');
const root = path.resolve(backend, '..');

function atLeast(actual, minimum) {
  const version = actual.split('.').map(Number);
  const required = minimum.split('.').map(Number);
  assert.equal(version.length, 3, `Unexpected version: ${actual}`);
  assert.ok(version.every(Number.isInteger), `Expected a stable version: ${actual}`);
  for (let index = 0; index < 3; index += 1) {
    if (version[index] !== required[index]) return version[index] > required[index];
  }
  return true;
}

function assertLockedMinimum(scope, name, minimum) {
  const lock = JSON.parse(fs.readFileSync(path.join(root, scope, 'package-lock.json'), 'utf8'));
  const copies = Object.entries(lock.packages).filter(([entry]) =>
    entry === `node_modules/${name}` || entry.endsWith(`/node_modules/${name}`));
  assert.ok(copies.length > 0, `${scope}: missing ${name}`);
  for (const [entry, pkg] of copies) {
    assert.ok(atLeast(pkg.version, minimum), `${scope}/${entry}: ${pkg.version} must be >= ${minimum}`);
  }
}

test('backend lock and installed middleware include the request/response cleanup fixes', () => {
  for (const [name, minimum] of [['body-parser', '2.4.0'], ['compression', '1.8.2']]) {
    assertLockedMinimum('backend', name, minimum);
    const installed = require(path.join(backend, 'node_modules', name, 'package.json')).version;
    assert.ok(atLeast(installed, minimum), `Installed ${name} ${installed} must be >= ${minimum}`);
  }
});

test('web lock includes the three reviewed advisory fixes', () => {
  for (const [name, minimum] of [['follow-redirects', '1.16.2'], ['source-map-js', '1.2.2'], ['vite', '8.3.6']]) {
    assertLockedMinimum('web', name, minimum);
  }
});

test('backend runtime dependencies retain their reviewed security patch floors', () => {
  for (const [name, minimum] of [
    ['proxy-addr', '2.0.8'], ['multer', '2.5.0'], ['sharp', '0.35.5'],
    ['undici', '7.30.1'], ['follow-redirects', '1.16.2'],
    ['nodemailer', '10.1.4'], ['ip-address', '10.7.4'], ['zod', '4.6.6'],
  ]) {
    assertLockedMinimum('backend', name, minimum);
    const installed = require(path.join(backend, 'node_modules', name, 'package.json')).version;
    assert.ok(atLeast(installed, minimum), `Installed ${name} ${installed} must be >= ${minimum}`);
  }
});

test('proxy and address parsing reject untrusted mapped subnets and malformed zones', () => {
  const proxyaddr = require('proxy-addr');
  assert.equal(proxyaddr.compile(['::ffff:10.0.0.0/8'])('8.8.8.8'), false);
  const trusted = proxyaddr.compile(['10.0.0.0/8']);
  assert.equal(trusted('10.1.2.3'), true);
  assert.equal(trusted('8.8.8.8'), false);
  const { Address6 } = require('ip-address');
  assert.equal(Address6.isValid('2001:db8::1'), true);
  assert.equal(Address6.isValid('%'.repeat(10000) + '\u2028'), false);
});

test('Zod rejects oversized constrained arrays before accumulating per-element issues', () => {
  const { z } = require('zod');
  const schema = z.array(z.object({ amount: z.number().finite() })).max(20);
  assert.deepEqual(schema.parse([{ amount: 1 }]), [{ amount: 1 }]);
  const result = schema.safeParse(Array(10000).fill(null));
  assert.equal(result.success, false);
  assert.equal(result.error.issues.length, 1);
  assert.equal(result.error.issues[0].code, 'too_big');
});

test('Nodemailer keeps nested-comment addresses out of the composed envelope', async () => {
  // JSON transport only composes in memory: no SMTP connection or email send.
  const transport = require('nodemailer').createTransport({ jsonTransport: true });
  try {
    const result = await transport.sendMail({
      from: 'sender@example.test',
      to: 'Recipient (x(y) <hidden@example.test>) <expected@example.test>',
      subject: 'Local regression fixture',
      text: 'Not sent',
    });
    assert.deepEqual(result.envelope.to, ['expected@example.test']);
    assert.deepEqual(JSON.parse(result.message).to.map(entry => entry.address), ['expected@example.test']);
  } finally { transport.close(); }
});

test('Undici retains its HTTP client API using a network-disabled mock', async () => {
  const { MockAgent, fetch } = require('undici');
  const dispatcher = new MockAgent();
  dispatcher.disableNetConnect();
  dispatcher.get('https://dependency.example.test').intercept({ path: '/fixture' })
    .reply(200, { ok: true }, { headers: { 'content-type': 'application/json' } });
  try {
    const response = await fetch('https://dependency.example.test/fixture', { dispatcher });
    assert.deepEqual(await response.json(), { ok: true });
    dispatcher.assertNoPendingInterceptors();
  } finally { await dispatcher.close(); }
});

// Only package middleware is imported. Never boot the application, access its
// database, or call providers. A subprocess contains any uncaught decoder error.
const prelude = `
  const assert = require('node:assert/strict');
  const http = require('node:http');
  const zlib = require('node:zlib');
  const express = require('express');
  const { once } = require('node:events');
  const streams = [];
  function observeFactory(name) {
    const descriptor = Object.getOwnPropertyDescriptor(zlib, name);
    Object.defineProperty(zlib, name, { ...descriptor, value: function (...args) {
      const stream = descriptor.value.apply(this, args);
      streams.push(stream);
      return stream;
    } });
  }
  async function listen(app) {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    return server;
  }
  async function stop(server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  function request(server, options, body) {
    return new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: server.address().port, ...options }, res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('error', reject);
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      });
      req.on('error', reject);
      req.end(body);
    });
  }
`;

function runIsolated(source) {
  const result = spawnSync(process.execPath, ['-e', `${prelude}
    (async () => { ${source} })().catch(error => { console.error(error); process.exitCode = 1; });
  `], { cwd: backend, encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `Isolated middleware check failed (${result.signal || 'exit'}):\n${result.stdout}\n${result.stderr}`);
}

test('body parsing destroys decoders before handlers run and survives malformed compressed bodies', () => {
  runIsolated(`
    for (const name of ['createGunzip', 'createInflate', 'createBrotliDecompress']) observeFactory(name);
    const app = express();
    app.use('/json', express.json({ limit: '2mb' }));
    app.use('/form', express.urlencoded({ extended: true, limit: '2mb' }));
    app.use('/raw', express.raw({ type: 'application/octet-stream', limit: '2mb' }));
    app.post(['/json', '/form', '/raw'], (req, res) => res.json({
      body: Buffer.isBuffer(req.body) ? req.body.toString() : req.body,
      decoderDestroyed: streams.at(-1).destroyed
    }));
    app.get('/health', (_req, res) => res.send('ok'));
    app.use((err, _req, res, _next) => res.status(err.status || 500).send('rejected'));
    const server = await listen(app);
    try {
      const encodings = [['gzip', zlib.gzipSync], ['deflate', zlib.deflateSync], ['br', zlib.brotliCompressSync]];
      const inputs = [
        ['/json', 'application/json', '{"ok":true}', { ok: true }],
        ['/form', 'application/x-www-form-urlencoded', 'ok=yes', { ok: 'yes' }],
        ['/raw', 'application/octet-stream', 'raw payload', 'raw payload']
      ];
      for (const [encoding, compress] of encodings) {
        for (const [url, type, input, expected] of inputs) {
          const response = await request(server, {
            path: url, method: 'POST', headers: { 'content-type': type, 'content-encoding': encoding }
          }, compress(Buffer.from(input)));
          assert.equal(response.status, 200);
          const decoded = JSON.parse(response.body);
          assert.deepEqual(decoded.body, expected);
          assert.equal(decoded.decoderDestroyed, true, encoding + ' decoder must be destroyed before application handling');
        }
        const malformed = Buffer.concat([compress(Buffer.from('{"ok":true}')), Buffer.from('invalid trailing bytes')]);
        const response = await request(server, {
          path: '/json', method: 'POST', headers: { 'content-type': 'application/json', 'content-encoding': encoding }
        }, malformed);
        assert.ok([200, 400].includes(response.status), 'Trailing data must be safely consumed or rejected');
        await new Promise(resolve => setTimeout(resolve, 20));
        assert.equal((await request(server, { path: '/health' })).body.toString(), 'ok');
        assert.ok(streams.every(stream => stream.destroyed), 'No decoder should remain open');
      }
    } finally { await stop(server); }
  `);
});

test('compression releases its native stream after a client abort and preserves normal responses', () => {
  runIsolated(`
    observeFactory('createGzip');
    const compression = require('compression');
    const app = express();
    app.use(compression({ threshold: 0 }));
    app.get('/complete', (_req, res) => res.type('text').send('complete payload'));
    let closed;
    const closedPromise = new Promise(resolve => { closed = resolve; });
    app.get('/abort', (_req, res) => {
      res.type('text');
      res.on('close', closed);
      res.write('pending payload '.repeat(1024));
      res.flush();
      // Intentionally leave the response open until the client disconnects.
    });
    const server = await listen(app);
    try {
      const complete = await request(server, { path: '/complete', headers: { 'accept-encoding': 'gzip' } });
      assert.equal(complete.headers['content-encoding'], 'gzip');
      assert.equal(zlib.gunzipSync(complete.body).toString(), 'complete payload');
      await new Promise((resolve, reject) => {
        const req = http.get({ host: '127.0.0.1', port: server.address().port, path: '/abort', headers: { 'accept-encoding': 'gzip' } }, res => {
          assert.equal(res.headers['content-encoding'], 'gzip');
          res.once('data', () => { res.destroy(); resolve(); });
          res.on('error', error => { if (error.code !== 'ECONNRESET') reject(error); });
        });
        req.on('error', reject);
      });
      await closedPromise;
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(streams.length, 2);
      assert.ok(streams.every(stream => stream.destroyed), 'All compression streams must be destroyed');
      assert.ok(streams.every(stream => stream._handle === null), 'All native zlib handles must be released');
      assert.equal((await request(server, { path: '/complete' })).status, 200);
    } finally { await stop(server); }
  `);
});

test('Multer survives a pending asynchronous filter after another upload is rejected', () => {
  runIsolated(`
    const multer = require('multer');
    const app = express();
    let pendingCompleted = false;
    const upload = multer({ storage: multer.memoryStorage(), fileFilter: (_req, file, done) => {
      if (file.fieldname === 'slow') setTimeout(() => { pendingCompleted = true; done(null, true); }, 40);
      else done(new Error('Rejected regression fixture'));
    } });
    app.post('/upload', upload.any(), (_req, res) => res.send('accepted'));
    app.get('/health', (_req, res) => res.send('ok'));
    app.use((_err, _req, res, _next) => res.status(400).send('rejected'));
    const server = await listen(app);
    try {
      const boundary = 'local-security-regression';
      const part = name => '--' + boundary + '\\r\\nContent-Disposition: form-data; name="' + name + '"; filename="fixture.txt"\\r\\nContent-Type: text/plain\\r\\n\\r\\nfixture\\r\\n';
      const body = Buffer.from(part('slow') + part('rejected') + '--' + boundary + '--\\r\\n');
      const response = await request(server, { path: '/upload', method: 'POST', headers: {
        'content-type': 'multipart/form-data; boundary=' + boundary, 'content-length': body.length
      } }, body);
      assert.equal(response.status, 400);
      await new Promise(resolve => setTimeout(resolve, 80));
      assert.equal(pendingCompleted, true);
      assert.equal((await request(server, { path: '/health' })).body.toString(), 'ok');
    } finally { await stop(server); }
  `);
});

test('redirects strip array-form and cross-realm custom credential headers', () => {
  runIsolated(`
    const redirects = require('follow-redirects');
    const vm = require('node:vm');
    const target = await listen((_req, res) => res.end(JSON.stringify(_req.headers)));
    const source = await listen((_req, res) => {
      res.writeHead(302, { location: 'http://127.0.0.1:' + target.address().port + '/capture' }); res.end();
    });
    try {
      const received = await new Promise((resolve, reject) => {
        const req = redirects.http.get({ hostname: '127.0.0.1', port: source.address().port, path: '/',
          headers: ['Authorization', 'Bearer synthetic', 'Cookie', 'fixture=synthetic', 'X-API|Key', 'synthetic', 'X-Harmless', 'retained'],
          sensitiveHeaders: vm.runInNewContext("['X-API|Key']")
        }, res => {
          const chunks = []; res.on('data', chunk => chunks.push(chunk));
          res.on('end', () => resolve(JSON.parse(Buffer.concat(chunks)))); res.on('error', reject);
        });
        req.on('error', reject);
      });
      assert.equal(received.authorization, undefined);
      assert.equal(received.cookie, undefined);
      assert.equal(received['x-api|key'], undefined);
      assert.equal(received['x-harmless'], 'retained');
    } finally { await stop(source); await stop(target); }
  `);
});

test('patched Sharp renders SVG and runs local photo checks without a model provider', () => {
  runIsolated(`
    process.env.OPENAI_API_KEY = '';
    const sharp = require('sharp');
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const version = sharp.versions.rsvg.split('.').map(Number);
    assert.ok(version[0] > 2 || (version[0] === 2 && (version[1] > 63 || (version[1] === 63 && version[2] >= 2))), 'Patched librsvg is required');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-security-photo-'));
    try {
      const photo = path.join(directory, 'fixture.png');
      await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#708090"/></svg>')).png().toFile(photo);
      const { analyzePhotoCompliance } = require('./dist/services/photoComplianceService');
      const result = await analyzePhotoCompliance(photo);
      assert.equal(result.metadata.width, 1280);
      assert.equal(result.metadata.height, 720);
      assert.equal(result.metadata.format, 'png');
      assert.equal(result.aiAnalyzed, false);
      assert.match(result.verificationHash, /^[a-f0-9]{64}$/);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  `);
});
