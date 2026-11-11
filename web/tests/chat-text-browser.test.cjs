// Synthetic, loopback-only browser coverage of the real production IndexedDB,
// auth fencing, transport and queue modules. No app backend/provider is contacted.
// Set WEB_CHAT_PLAYWRIGHT_MODULE to an existing Playwright install if not local.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const ts = require('typescript');
let chromium;
try { ({ chromium } = require(process.env.WEB_CHAT_PLAYWRIGHT_MODULE || 'playwright')); } catch {}
const fake = process.env.WEB_CHAT_INDEXEDDB_MODULE ? require(process.env.WEB_CHAT_INDEXEDDB_MODULE) : null;
const browserTest = fake ? (name, fn) => test(`[synthetic IDB/VM, not browser] ${name}`, fn) : chromium ? test : test.skip;
const realBrowserTest = fake ? test.skip : browserTest;
const src = path.join(__dirname, '../src');
const names = ['authSession', 'api', 'chatSession', 'chatTextOutbox', 'chatTextTransport', 'chatTextQueue'];
const scripts = names.map(name => {
  const source = fs.readFileSync(path.join(src, 'services', `${name}.ts`), 'utf8').replaceAll('import.meta.env', '({})');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  return `factories[${JSON.stringify(name)}] = (exports, require) => {${js}\n};`;
}).join('\n');
function expression(file, name, effect = false) {
  const source = fs.readFileSync(path.join(src, file), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let node;
  function visit(n) {
    if (!effect && ts.isVariableDeclaration(n) && n.name.getText(ast) === name) node = n.initializer;
    if (effect && ts.isCallExpression(n) && n.expression.getText(ast) === 'useEffect') node ||= n.arguments[0];
    ts.forEachChild(n, visit);
  }
  visit(ast); assert.ok(node, name);
  return ts.transpileModule(`(${node.getText(ast)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText.replace(/;\s*$/, '');
}
const shellEffect = expression('components/ChatTextRecovery.tsx', '', true);
const handlerSources = Object.fromEntries(['persistIntent', 'sendMessage'].map(name => [name, expression('pages/Chat.tsx', name)]));
let server, origin, browser;
before(async () => {
  if (fake) { origin = 'http://synthetic.test'; browser = require('./helpers/chat-text-node-environment.cjs').createNodeBrowser(fake, scripts); return; }
  if (!chromium) return;
  server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<html><body><script>const factories={},modules={};${scripts}\nwindow.mod=name=>{name=name.replace('./','');if(!modules[name]){const exports={};modules[name]=exports;factories[name](exports,window.mod);}return modules[name];};</script></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.WEB_CHAT_CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });
async function pageFixture(t) {
  const context = await browser.newContext(); t.after(() => context.close());
  const page = await context.newPage(); await page.goto(origin);
  await initialize(page); return page;
}
async function initialize(page, login = true) {
  await page.evaluate(login => {
    const auth = mod('authSession'), out = mod('chatTextOutbox'), chat = mod('chatSession'), trans = mod('chatTextTransport'), queue = mod('chatTextQueue');
    const user = { id: '10000000-0000-4000-a000-000000000001', companyId: '20000000-0000-4000-a000-000000000001', role: 'employee' };
    if (login) auth.setAuthSession('synthetic-token', user);
    const owner = chat.readChatOwner(), scope = { actorId: user.id, companyId: user.companyId, roomId: 'room-a' };
    const F = window.F = { auth, out, chat, trans, queue, user, owner, scope, store: out.createIndexedTextStore(indexedDB, 'test-text-outbox'), current: true, focus: true, visible: true, online: true, calls: [], saved: [], errors: [], rows: [], time: Date.now() };
    Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => F.focus });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => F.visible ? 'visible' : 'hidden' });
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => F.online });
    F.authorization = () => trans.readTextAuthorization(owner);
    F.record = (text = 'hello', roomId = scope.roomId) => out.createTextRecord({ ...scope, roomId }, text, F.authorization());
    F.receipt = (r, replayed = false) => ({ success: true, request: { key: r.key, actorId: r.actorId, companyId: r.companyId, roomId: r.roomId, state: 'saved', replayed }, message: { id: '30000000-0000-4000-a000-000000000001', sender_id: r.actorId, company_id: r.companyId, room_id: r.roomId, message: r.text, attachment_id: null, attachment_name: null, attachment_type: null, attachment_size: null, created_at: '2026-11-11T12:00:00Z' } });
    F.reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    F.fetch = async (_url, init) => { const b = JSON.parse(init.body); return F.reply(200, F.receipt({ ...scope, roomId: b.roomId, key: b.requestKey, text: b.message })); };
    window.fetch = async (url, init) => { F.calls.push({ url, ...init }); return F.fetch(url, init); };
    F.options = () => ({ owner, roomId: scope.roomId, current: () => F.current && F.focus && F.visible,
      store: F.store, now: () => F.time, onRows: rows => F.rows = rows, onSaved: (receipt, localCommitted) => F.saved.push({ receipt, localCommitted }), onError: error => F.errors.push(error) });
    F.expect = (value, message) => { if (!value) throw Error(message || 'Assertion failed'); };
    F.poll = async predicate => { for (let n = 0; n < 150; n++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); } throw Error('Timed out waiting for local test event'); };
  }, login);
}
browserTest('real IndexedDB commits before resolve, reload preserves immutable key, sequence and payload', async t => {
  const page = await pageFixture(t);
  const before = await page.evaluate(async () => { const r = await F.store.enqueue(F.record('  hello 🌍  '), () => true); const rows = await F.out.createIndexedTextStore(indexedDB, 'test-text-outbox').list(F.scope); F.expect(rows.records.length === 1); return r; });
  await page.reload(); await initialize(page, false);
  const after = await page.evaluate(async () => (await F.store.list(F.scope)).records[0]);
  assert.deepEqual(after, before); assert.equal(after.text, 'hello 🌍'); assert.ok(after.sequence > 0); assert.equal(after.token, undefined);
});
realBrowserTest('browser process restart retains the committed record when browser storage is retained', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-text-restart-'));
  const launch = () => chromium.launchPersistentContext(dir, { executablePath: process.env.WEB_CHAT_CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  let context;
  try {
    context = await launch(); let page = await context.newPage(); await page.goto(origin); await initialize(page);
    const key = await page.evaluate(async () => (await F.store.enqueue(F.record(), () => true)).key);
    await context.close(); context = await launch(); page = await context.newPage(); await page.goto(origin); await initialize(page, false);
    assert.equal(await page.evaluate(async () => (await F.store.list(F.scope)).records[0].key), key);
  } finally { await context?.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
browserTest('two tabs serialize enqueue/claims and never overwrite payload or revive a saved request', async t => {
  const page = await pageFixture(t), second = await page.context().newPage(); await second.goto(origin); await initialize(second, false);
  const first = await page.evaluate(async () => { F.recordA = await F.store.enqueue(F.record('first'), () => true); await F.store.enqueue(F.record('second'), () => true); return F.recordA; });
  const [a, b] = await Promise.all([page, second].map(p => p.evaluate(() => F.store.claim(F.scope, F.authorization(), crypto.randomUUID(), Date.now(), () => true))));
  assert.equal([a, b].filter(Boolean).length, 1); const claim = a || b; assert.equal(claim.key, first.key);
  await page.evaluate(async claim => {
    let conflict = false; try { await F.store.enqueue({ ...claim, text: 'changed' }, () => true); } catch { conflict = true; }
    F.expect(conflict, 'immutable same-key payload must reject');
    await F.store.finish(claim, { state: 'saved', reason: '', nextAttempt: 0, receipt: F.receipt(claim) }, () => true);
    await F.store.finish(claim, { state: 'uncertain', reason: 'late failure', nextAttempt: 0 }, () => true);
    const replay = await F.store.enqueue(claim, () => true); F.expect(replay.state === 'saved');
    const next = await F.store.claim(F.scope, F.authorization(), 'next', Date.now(), () => true); F.expect(next.text === 'second');
  }, claim);
});
browserTest('expired claims replay the identical key; lost first save acknowledgement and duplicate tabs insert once', async t => {
  const page = await pageFixture(t);
  await page.evaluate(async () => {
    const r = await F.store.enqueue(F.record(), () => true); const original = await F.store.claim(F.scope, F.authorization(), 'old-tab', F.time, () => true);
    F.time += 90_001; const next = await F.store.claim(F.scope, F.authorization(), 'new-tab', F.time, () => true);
    F.expect(next.key === original.key); let inserts = 0; const receipts = new Map();
    F.fetch = async (_url, init) => { const b = JSON.parse(init.body); if (!receipts.has(b.requestKey)) { inserts++; receipts.set(b.requestKey, F.receipt(r)); throw Error('committed; reply lost'); } return F.reply(200, { ...receipts.get(b.requestKey), request: { ...receipts.get(b.requestKey).request, replayed: true } }); };
    const transport = F.trans.openTextTransport(F.owner, F.scope.roomId, () => true);
    F.expect((await transport.request(original, 'send')).kind === 'uncertain'); const result = await transport.request(next, 'send');
    F.expect(result.kind === 'saved' && result.receipt.request.replayed && inserts === 1);
    await F.store.finish(next, { state: 'saved', reason: '', nextAttempt: 0, receipt: result.receipt }, () => true);
    await F.store.finish(original, { state: 'uncertain', reason: 'late', nextAttempt: 0 }, () => true);
    F.expect((await F.store.list(F.scope)).records[0].state === 'saved');
    F.expect(F.calls.every(call => JSON.parse(call.body).requestKey === r.key));
  });
});
browserTest('transaction abort, quota failure and write-then-error retry preserve the same Send key', async t => {
  const page = await pageFixture(t);
  await page.evaluate(async () => {
    const r = F.record(); const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function(...args) { const result = original.apply(this, args); this.transaction.abort(); return result; };
    let aborted = false; try { await F.store.enqueue(r, () => true); } catch { aborted = true; }
    IDBObjectStore.prototype.add = original; F.expect(aborted && (await F.store.list(F.scope)).records.length === 0);
    IDBObjectStore.prototype.add = () => { throw new DOMException('synthetic quota', 'QuotaExceededError'); };
    let quota = false; try { await F.store.enqueue(r, () => true); } catch { quota = true; }
    IDBObjectStore.prototype.add = original; F.expect(quota && (await F.store.list(F.scope)).records.length === 0);
    try { await F.store.enqueue(r, () => true); throw Error('caller lost committed completion'); } catch {}
    const recovered = await F.store.enqueue(r, () => true); const rows = await F.store.list(F.scope);
    F.expect(rows.records.length === 1 && recovered.key === r.key && F.calls.length === 0);
  });
});
browserTest('per-room ordering, bounded backoff and automatic retry budget survive runner recreation', async t => {
  const page = await pageFixture(t);
  await page.evaluate(async () => {
    const first = await F.store.enqueue(F.record('one'), () => true); await F.store.enqueue(F.record('two'), () => true);
    F.fetch = async () => F.reply(503, { success: false, code: 'CHAT_REQUEST_UNCERTAIN' });
    for (let n = 0; n < 5; n++) { const queue = F.queue.createTextQueue(F.options()); await queue.tick(); queue.dispose(); await F.queue.createTextQueue(F.options()).tick(); F.time += 120_000; }
    F.expect(F.calls.length === 5, 'budget must persist across controllers');
    const rows = (await F.store.list(F.scope)).records; F.expect(rows[0].state === 'needs-review' && rows[1].attempts === 0);
    F.expect(F.calls.every(call => JSON.parse(call.body).requestKey === first.key));
  });
});
browserTest('owner runner processes pending room A even with room B/inbox open; blocked rooms do not starve peers', async t => {
  const page = await pageFixture(t);
  await page.evaluate(async () => {
    for (const room of ['room-a', 'room-b', 'room-c', 'room-d']) await F.store.enqueue(F.record(room, room), () => true);
    F.fetch = async (_url, init) => { const b = JSON.parse(init.body); return b.roomId === 'room-a' ? F.reply(403, { code: 'CHAT_REQUEST_OWNER_MISMATCH' }) : F.reply(200, F.receipt({ ...F.scope, key: b.requestKey, text: b.message, roomId: b.roomId })); };
    const recovery = F.queue.createOwnerTextRecovery(F.options()); await recovery.tick(); F.expect(F.calls.length === 3); await recovery.tick();
    const rows = await F.store.listOwner(F.scope); F.expect(rows.records.filter(r => r.state === 'saved').length === 3);
    F.expect(rows.records.find(r => r.roomId === 'room-a').state === 'needs-review');
  });
});
browserTest('offline to online recovery sends once, with immutable actor/company and no legacy transport', async t => {
  const page = await pageFixture(t);
  await page.evaluate(async () => {
    const r = await F.store.enqueue(F.record(), () => true), q = F.queue.createTextQueue(F.options()); F.online = false; await q.tick(); F.expect(!F.calls.length);
    F.online = true; await q.tick(); F.expect(F.calls.length === 1 && F.saved.length === 1);
    const call = F.calls[0], body = JSON.parse(call.body); F.expect(call.url.endsWith('/api/chat/message-requests'));
    F.expect(body.expectedActorId === r.actorId && body.expectedCompanyId === r.companyId && body.requestKey === r.key && body.message === r.text);
    F.expect((await F.store.list(F.scope)).records[0].state === 'saved');
  });
});
browserTest('typed missing status only allows exact-key retry; unavailable never recreates', async t => {
  const page = await pageFixture(t);
  await page.evaluate(async () => {
    const r = await F.store.enqueue(F.record(), () => true);
    F.fetch = async () => F.reply(404, { success: false, code: 'CHAT_REQUEST_NOT_FOUND', request: { key: r.key, ...F.scope, state: 'missing' } });
    const q = F.queue.createTextQueue(F.options()); await q.review(r, 'status');
    F.expect(F.calls[0].method === 'GET' && F.calls[0].url.includes('expectedActorId='));
    F.expect((await F.store.list(F.scope)).records[0].state === 'needs-review');
    F.fetch = async () => F.reply(410, { success: false, code: 'CHAT_REQUEST_UNAVAILABLE' }); await q.review(r, 'send');
    F.expect(JSON.parse(F.calls[1].body).requestKey === r.key);
    await q.review(r, 'send'); F.expect(F.calls.length === 2, '410 must prevent recreation');
    await q.review(r, 'status'); F.expect(F.calls.length === 3 && F.calls[2].method === 'GET');
  });
});
browserTest('unknown old-server404/400, conflict, owner mismatch and payment errors stop automatic writes without fallback or navigation', async t => {
  const page = await pageFixture(t);
  await page.evaluate(async () => {
    for (const [index, status] of [400, 401, 402, 403, 404, 409].entries()) {
      const room = `blocked-${index}`, r = await F.store.enqueue(F.record('test', room), () => true);
      F.fetch = async () => F.reply(status, { success: false, code: status === 403 ? 'CHAT_REQUEST_OWNER_MISMATCH' : 'legacy' });
      const q = F.queue.createTextQueue({ ...F.options(), roomId: room }); await q.tick(); await q.tick();
      const row = (await F.store.list({ ...F.scope, roomId: room })).records[0]; F.expect(row.state === 'needs-review' && row.key === r.key);
    }
    F.expect(F.calls.length === 6 && F.calls.every(call => call.url.endsWith('/api/chat/message-requests')));
    F.expect(localStorage.getItem('token') === 'synthetic-token' && location.pathname === '/');
  });
});
browserTest('full receipt tuple, original message identity/body and text-only kind are required for saved state', async t => {
  const page = await pageFixture(t);
  await page.evaluate(async () => {
    const r = F.record(), good = F.receipt(r); F.expect(F.out.validTextReceipt(good, r));
    const changes = [['request', 'key', 'different'], ['request', 'actorId', 'different'], ['request', 'companyId', 'different'], ['request', 'roomId', 'other'], ['request', 'state', 'missing'], ['request', 'replayed', undefined], ['message', 'id', ''], ['message', 'sender_id', 'other'], ['message', 'company_id', 'other'], ['message', 'room_id', 'other'], ['message', 'message', 'other'], ['message', 'attachment_id', 'file'], ['message', 'attachment_name', 'file'], ['message', 'attachment_type', 'image/png'], ['message', 'created_at', 'bad']];
    for (const [group, key, value] of changes) { const bad = structuredClone(good); bad[group][key] = value; F.expect(!F.out.validTextReceipt(bad, r), `${group}.${key}`); }
    await F.store.enqueue(r, () => true); F.fetch = async () => F.reply(200, { ...good, request: { ...good.request, roomId: 'other' } });
    await F.queue.createTextQueue(F.options()).tick(); F.expect(!F.saved.length && (await F.store.list(F.scope)).records[0].state === 'needs-review');
  });
});
browserTest('saved acknowledgement remains a success when local saved-state commit fails', async t => {
  const page = await pageFixture(t);
  await page.evaluate(async () => {
    const r = await F.store.enqueue(F.record(), () => true);
    const store = { ...F.store, finish: async () => { throw Error('quota'); } };
    await F.queue.createTextQueue({ ...F.options(), store }).tick();
    F.expect(F.saved.length === 1 && !F.saved[0].localCommitted && !F.errors.length);
    const row = (await F.store.list(F.scope)).records[0]; F.expect(row.key === r.key && row.state === 'sending');
    F.time += 90_001; await F.queue.createTextQueue(F.options()).tick();
    F.expect((await F.store.list(F.scope)).records[0].state === 'saved' && F.calls.every(c => JSON.parse(c.body).requestKey === r.key));
  });
});
browserTest('invalid or old unkeyed records are left untouched and cannot silently bypass a room head', async t => {
  const page = await pageFixture(t);
  await page.evaluate(async () => {
    await F.store.enqueue(F.record('valid'), () => true);
    await new Promise((resolve, reject) => { const r = indexedDB.open('test-text-outbox', 1); r.onsuccess = () => { const db = r.result, tx = db.transaction('texts', 'readwrite'); tx.objectStore('texts').add({ ...F.scope, text: 'old unkeyed' }); tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error); }; });
    await F.queue.createTextQueue(F.options()).tick(); const rows = await F.store.list(F.scope);
    F.expect(rows.records.length === 1 && rows.invalid === 1 && !F.calls.length);
  });
});
browserTest('auth token/account/company/role changes and same-tab ABA fence both headers and body completion', async t => {
  const page = await pageFixture(t);
  await page.evaluate(async () => {
    for (const change of ['token', 'actor', 'company', 'role', 'aba']) for (const phase of ['headers', 'body']) {
      F.auth.setAuthSession('synthetic-token', F.user); const owner = F.chat.readChatOwner(), r = F.out.createTextRecord(F.scope, 'hello', F.trans.readTextAuthorization(owner));
      let release; const pending = new Promise(resolve => release = resolve);
      F.fetch = async () => phase === 'headers' ? pending : { ok: true, json: () => pending };
      const transport = F.trans.openTextTransport(owner, F.scope.roomId, () => true), request = transport.request(r, 'send').then(() => false, e => e.code === 'CHAT_STALE');
      await Promise.resolve(); await Promise.resolve();
      const next = { ...F.user }; if (change === 'actor') next.id = '10000000-0000-4000-a000-000000000002'; if (change === 'company') next.companyId = '20000000-0000-4000-a000-000000000002'; if (change === 'role') next.role = 'manager';
      F.auth.setAuthSession('changed-token', next); if (change === 'aba') F.auth.setAuthSession('synthetic-token', F.user);
      release(phase === 'headers' ? F.reply(200, F.receipt(r)) : F.receipt(r)); F.expect(await request, `${change}/${phase}`);
    }
  });
});
browserTest('generation and role changes need explicit same-owner review; profile-only changes do not pause recovery', async t => {
  const page = await pageFixture(t);
  await page.evaluate(async () => {
    const r = await F.store.enqueue(F.record(), () => true); F.auth.updateAuthUser({ ...F.user, firstName: 'new name' });
    F.expect(F.authorization().generation === r.authorization.generation);
    F.auth.setAuthSession('renewed-token', F.user); F.owner = F.chat.readChatOwner();
    let options = { ...F.options(), owner: F.owner }; let q = F.queue.createTextQueue(options); await q.tick();
    F.expect(!F.calls.length && (await F.store.list(F.scope)).records[0].state === 'needs-review');
    await q.review(r, 'send'); F.expect(F.calls.length === 1 && (await F.store.list(F.scope)).records[0].state === 'saved');
  });
});
browserTest('cross-tab app-owned ABA fences stale responses before storage events are needed', async t => {
  const page = await pageFixture(t), other = await page.context().newPage(); await other.goto(origin); await initialize(other, false);
  await page.evaluate(async () => { const r = F.record(); F.fetch = () => new Promise(resolve => F.release = () => resolve(F.reply(200, F.receipt(r)))); F.request = F.trans.openTextTransport(F.owner, F.scope.roomId, () => true).request(r, 'send').then(() => false, e => e.code === 'CHAT_STALE'); });
  await other.evaluate(() => { F.auth.setAuthSession('other', { ...F.user, id: '10000000-0000-4000-a000-000000000002' }); F.auth.setAuthSession('synthetic-token', F.user); });
  assert.equal(await page.evaluate(async () => { F.release(); return F.request; }), true);
});
browserTest('app shell pauses hidden/pagehide, stays paused on focus until pageshow, and recovers across navigation', async t => {
  const page = await pageFixture(t);
  await page.evaluate(({ shellEffect }) => {
    Object.assign(window, { createOwnerTextRecovery: options => F.queue.createOwnerTextRecovery({ ...options, store: F.store }), captureAuthSession: F.auth.captureAuthSession,
      getAuthRevision: F.auth.getAuthRevision, readChatOwner: F.chat.readChatOwner, chatOwnerKey: F.chat.chatOwnerKey,
      setRows: rows => F.rows = rows, setError: error => F.errors.push(error) });
    F.intervals = []; window.setInterval = fn => { F.intervals.push(fn); return F.intervals.length; }; window.clearInterval = () => {};
    F.cleanup = (0, eval)(shellEffect)();
  }, { shellEffect });
  await page.evaluate(async () => {
    dispatchEvent(new Event('pagehide')); await F.store.enqueue(F.record('paused'), () => true);
    dispatchEvent(new Event('focus')); dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange')); F.intervals.forEach(fn => fn());
    await new Promise(r => setTimeout(r, 50)); F.expect(!F.calls.length, 'pagehide is sticky');
    history.pushState({}, '', '/chat/room-b'); dispatchEvent(new Event('pageshow')); await F.poll(() => F.calls.length === 1);
    F.expect(JSON.parse(F.calls[0].body).roomId === 'room-a'); await F.poll(async () => (await F.store.list(F.scope)).records[0].state === 'saved');
    F.visible = false; document.dispatchEvent(new Event('visibilitychange')); await F.store.enqueue(F.record('hidden'), () => true); F.intervals.forEach(fn => fn()); await new Promise(r => setTimeout(r, 50)); F.expect(F.calls.length === 1);
    F.visible = true; document.dispatchEvent(new Event('visibilitychange')); await F.poll(() => F.calls.length === 2); F.cleanup();
  });
});
browserTest('real Send handlers reserve once, preserve newer drafts, and reuse key after ambiguous enqueue', async t => {
  const page = await pageFixture(t);
  await page.evaluate(({ handlerSources }) => {
    Object.assign(window, { isSupport: false, pendingEnqueue: { current: null }, enqueueLock: { current: null }, draft: { current: { text: 'hello', revision: 1 } },
      acquireSession: () => ({ isCurrent: () => F.current }), isCurrent: () => F.current, user: F.owner, roomId: F.scope.roomId,
      createTextRecord: F.out.createTextRecord, readTextAuthorization: F.trans.readTextAuthorization, browserTextStore: () => F.store,
      setSending: value => F.sending = value, setQueueError: value => F.queueError = value, setSendStatus: value => F.status = value,
      changeInput: text => { draft.current = { text, revision: draft.current.revision + 1 }; }, setOutbox: rows => F.rows = rows,
    });
    window.persistIntent = (0, eval)(handlerSources.persistIntent); window.sendMessage = (0, eval)(handlerSources.sendMessage);
  }, { handlerSources });
  await page.evaluate(async () => {
    const enqueue = F.store.enqueue; let release;
    F.store.enqueue = async (...args) => { await new Promise(resolve => release = resolve); return enqueue(...args); };
    const first = sendMessage(), duplicate = sendMessage(); const key = pendingEnqueue.current.record.key;
    draft.current = { text: 'newer draft', revision: 2 }; release(); await Promise.all([first, duplicate]);
    F.expect(draft.current.text === 'newer draft' && (await F.store.list(F.scope)).records.length === 1 && !pendingEnqueue.current);
    F.store.enqueue = async (...args) => { await enqueue(...args); throw Error('lost caller acknowledgement'); };
    await sendMessage(); const uncertainKey = pendingEnqueue.current.record.key; F.expect(uncertainKey !== key && F.queueError.includes('Retry storing'));
    draft.current = { text: 'newest draft', revision: 3 }; await sendMessage(); F.expect(pendingEnqueue.current.record.key === uncertainKey);
    F.store.enqueue = enqueue; await persistIntent(pendingEnqueue.current);
    const rows = await F.store.list(F.scope); F.expect(rows.records.length === 2 && rows.records[1].key === uncertainKey && draft.current.text === 'newest draft');
  });
});

browserTest('durable timeout abort stays uncertain and never chooses another key or transport', async t => {
  const page = await pageFixture(t);
  await page.evaluate(async () => {
    const r = F.record(); const originalSet = window.setTimeout, originalClear = window.clearTimeout; let abort, cleared = 0;
    window.setTimeout = fn => { abort = fn; return 123; }; window.clearTimeout = () => { cleared++; };
    F.fetch = (_url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('synthetic timeout', 'AbortError'))));
    try {
      const pending = F.trans.openTextTransport(F.owner, F.scope.roomId, () => true).request(r, 'send'); abort();
      const result = await pending; F.expect(result.kind === 'uncertain' && F.calls.length === 1 && cleared === 1);
      F.expect(JSON.parse(F.calls[0].body).requestKey === r.key && F.calls[0].url.endsWith('/api/chat/message-requests'));
    } finally { window.setTimeout = originalSet; window.clearTimeout = originalClear; }
  });
});
browserTest('record validation rejects invalid Unicode, oversized raw input and support rooms before persistence', async t => {
  const page = await pageFixture(t);
  await page.evaluate(async () => {
    for (const text of ['', '   ', 'bad\0text', 'bad\ud800', 'bad\udc00', ' '.repeat(5000) + 'x']) {
      let rejected = false; try { F.record(text); } catch { rejected = true; } F.expect(rejected, 'invalid raw text accepted');
    }
    let support = false; try { F.record('hello', 'support-ticket-1'); } catch { support = true; } F.expect(support);
    F.expect((await F.store.list(F.scope)).records.length === 0 && !F.calls.length);
  });
});
browserTest('late status updates never recreate a missing local record or claim its local confirmation was stored', async t => {
  const page = await pageFixture(t);
  await page.evaluate(async () => {
    const r = await F.store.enqueue(F.record(), () => true), claim = await F.store.claim(F.scope, F.authorization(), 'claim', F.time, () => true);
    await new Promise((resolve, reject) => { const request = indexedDB.open('test-text-outbox', 1); request.onsuccess = () => { const db = request.result, tx = db.transaction('texts', 'readwrite'); tx.objectStore('texts').delete(r.sequence); tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error); }; });
    const committed = await F.store.finish(claim, { state: 'saved', reason: '', nextAttempt: 0, receipt: F.receipt(r) }, () => true);
    F.expect(committed === false && (await F.store.list(F.scope)).records.length === 0);
  });
});

browserTest('a contradictory later saved UUID cannot replace the canonical receipt or emit another saved message', async t => {
  const page = await pageFixture(t);
  await page.evaluate(async () => {
    const r = await F.store.enqueue(F.record(), () => true), first = await F.store.claim(F.scope, F.authorization(), 'first', F.time, () => true);
    F.time += 90_001; const later = await F.store.claim(F.scope, F.authorization(), 'later', F.time, () => true);
    await F.store.finish(first, { state: 'saved', reason: '', nextAttempt: 0, receipt: F.receipt(r) }, () => true);
    const contradiction = F.receipt(r, true); contradiction.message.id = '30000000-0000-4000-a000-000000000002';
    let code; try { await F.store.finish(later, { state: 'saved', reason: '', nextAttempt: 0, receipt: contradiction }, () => true); } catch (error) { code = error.code; }
    F.expect(code === F.out.TEXT_RECEIPT_CONFLICT, 'typed conflict must survive asynchronous IDB abort');
    let claimed = false; const store = { ...F.store, claim: async () => { if (claimed) return null; claimed = true; return later; } };
    F.fetch = async () => F.reply(200, contradiction);
    await F.queue.createTextQueue({ ...F.options(), store }).tick();
    const saved = (await F.store.list(F.scope)).records[0];
    F.expect(F.saved.length === 0 && F.errors.some(error => error.includes('conflicting')));
    F.expect(saved.state === 'saved' && saved.receipt.message.id === F.receipt(r).message.id && F.calls.length === 1);
  });
});
