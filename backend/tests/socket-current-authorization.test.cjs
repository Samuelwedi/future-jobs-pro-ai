'use strict';
// Production TS handlers, transpiled only in memory. All data, storage and
// network connections are synthetic/local; no app startup or provider calls.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const ts = require('typescript');
const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { Server } = require('socket.io');
const { PGlite } = require('@electric-sql/pglite');
const secret = 'synthetic-socket-regression-secret';
const agentSecret = 'synthetic-socket-agent-secret';
const source = name => fs.readFileSync(path.join(__dirname, '../src', name), 'utf8');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function eventually(fn) {
  for (let i = 0; i < 500; i++) { if (await fn()) return; await sleep(5); }
  assert.fail('Timed out waiting for local handler');
}
function statement(text, kind, name) {
  const sf = ts.createSourceFile('source.ts', text, ts.ScriptTarget.Latest, true);
  const found = sf.statements.find(s => kind === 'function'
    ? ts.isFunctionDeclaration(s) && s.name?.text === name
    : ts.isExpressionStatement(s) && ts.isCallExpression(s.expression)
      && s.expression.expression.getText(sf) === `router.${kind}` && s.expression.arguments[0]?.text === name);
  assert(found, `Production source contains ${kind} ${name}`);
  return found.getText(sf);
}
async function fixture() {
  const db = new PGlite(), clients = [], errors = [];
  const state = { complimentary: false, failAuthorization: false, stop: false, heldClients: 0, deletedFiles: 0, queries: [] };
  const pool = {
    async query(sql, params = []) {
      state.queries.push(sql);
      if (state.failAuthorization && /FROM users u|FROM chat_rooms cr|FROM support_tickets WHERE id =/.test(sql)) throw Error('Synthetic authorization DB failure');
      if (/FROM users u/.test(sql)) assert.equal(state.heldClients, 0, 'Release committed media client before recipient lookup');
      const result = await db.query(sql, params);
      return { ...result, rowCount: result.rows.length || result.affectedRows || 0 };
    },
    async connect() {
      state.heldClients++;
      let released = false;
      return { query: (sql, params) => pool.query(sql, params), release() { assert(!released); released = true; state.heldClients--; } };
    },
  };
  function load(text, imports = {}, globals = {}) {
    const module = { exports: {} };
    const js = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInNewContext(js, { module, exports: module.exports, require(name) {
      if (Object.hasOwn(imports, name)) return imports[name];
      throw Error('Unstubbed dependency: ' + name);
    }, console: { log() {}, warn() {}, error(...args) { errors.push(args.map(x => x?.message || String(x)).join(' ')); } }, process: { env: { JWT_SECRET: secret, SUPPORT_AGENT_JWT_SECRET: agentSecret } }, ...globals });
    return module.exports;
  }
  await db.exec(`
    CREATE TABLE companies(id text PRIMARY KEY,is_active boolean DEFAULT true,subscription_status text DEFAULT 'active',subscription_tier text DEFAULT 'pro',subscription_provider text,subscription_current_period_end timestamptz DEFAULT now()+interval '1 day',subscription_expires_at timestamptz);
    CREATE TABLE users(id text PRIMARY KEY,company_id text REFERENCES companies(id),role text DEFAULT 'employee',first_name text,last_name text,is_active boolean DEFAULT true,must_change_password boolean DEFAULT false,profile_pic text);
    CREATE TABLE chat_rooms(id text PRIMARY KEY,company_id text REFERENCES companies(id),updated_at timestamptz DEFAULT now());
    CREATE TABLE chat_room_members(room_id text REFERENCES chat_rooms(id),user_id text REFERENCES users(id),PRIMARY KEY(room_id,user_id));
    CREATE TABLE chat_attachments(id serial PRIMARY KEY,room_id text,uploader_id text,filename text,mime_type text,size_bytes integer,storage_public_id text);
    CREATE TABLE chat_messages(id serial PRIMARY KEY,sender_id text REFERENCES users(id),company_id text REFERENCES companies(id),message text,room_id text,attachment_id integer REFERENCES chat_attachments(id),created_at timestamptz DEFAULT now());
    CREATE TABLE platform_support_agents(id text PRIMARY KEY,email text,first_name text,last_name text,role text,is_active boolean DEFAULT true);
    CREATE TABLE support_tickets(id text PRIMARY KEY,company_id text,user_id text,assigned_agent_id text,status text DEFAULT 'open',accepted_at timestamptz,resolved_at timestamptz);
    CREATE TABLE support_attachments(id serial PRIMARY KEY,ticket_id text,filename text,mime_type text,size_bytes integer,storage_public_id text);
    CREATE TABLE platform_support_messages(id serial PRIMARY KEY,ticket_id text,customer_user_id text,support_agent_id text,sender_type text,sender_name text,message text,attachment_id integer,created_at timestamptz DEFAULT now());
  `);
  const auth = load(source('utils/auth.ts'), { jsonwebtoken: jwt });
  const trial = load(source('middleware/trialMiddleware.ts'), { '../services/complimentaryAccess': { hasComplimentaryCompanyAccess: async () => state.complimentary }, '../config/database': { pool }, '../utils/auth': auth });
  const socketAuth = load(source('services/socketAuthorization.ts'), { '../config/database': { pool }, '../middleware/trialMiddleware': trial });
  const chat = load(source('services/chatService.ts'), { '../config/database': { pool } });
  const app = express(); app.use(express.json()); app.use('/api', trial.subscriptionGate);
  const server = http.createServer(app), io = new Server(server); app.set('io', io);
  const index = source('index.ts');
  load(index.slice(index.indexOf('const activeSocketWork'), index.indexOf('const reportWorker')) + '\n'
    + index.slice(index.indexOf('// Customer JWTs'), index.indexOf('// After creating io:')),
  {}, { io, jwt, JWT_SECRET: secret, pool, ...trial, ...socketAuth, saveMessage: chat.saveMessage, shutdown: { isStopping: () => state.stop } });
  const cr = source('routes/chatRoutes.ts'), router = express.Router();
  router.use((req, _res, next) => { req.chatUser = auth.verifyToken(req).id; next(); });
  const storage = { uploadPrivateChatFile: async () => 'synthetic-file', removePrivateChatFile: async () => { state.deletedFiles++; } };
  load(statement(cr, 'function', 'roomAccess') + '\n' + statement(cr, 'post', '/message') + '\n' + statement(cr, 'post', '/room/:roomId/attachments'), {}, {
    router, pool, ...auth, ...socketAuth, ...storage, saveMessage: chat.saveMessage,
    fileUpload: multer({ storage: multer.memoryStorage() }), parseFile: p => p,
    safeFilename: x => x, chatFileType: () => 'text/plain',
  }); app.use('/api/chat', router);
  const sar = source('routes/supportAgentRoutes.ts'), support = express.Router();
  load(['secret', 'tokenFrom', 'authenticateAgent'].map(n => statement(sar, 'function', n)).join('\n') + '\n'
    + ['accept', 'reply', 'resolve'].map(n => statement(sar, 'post', `/tickets/:ticketId/${n}`)).join('\n'), {}, { router: support, pool, jwt, ...socketAuth });
  const media = load(source('services/supportMedia.ts'), { express, multer, 'node:stream/promises': require('node:stream/promises'), '../config/database': { pool }, './chatFiles': { CHAT_FILE_LIMIT: 1024, safeFilename: x => x, chatFileType: () => 'text/plain' }, './chatStorage': storage, './socketAuthorization': socketAuth });
  media.mountSupportMedia(support, async () => ({ id: 'agent1', name: 'Agent Fixture', type: 'agent' }));
  app.use('/api/support-agent', support);
  const sr = source('routes/supportRoutes.ts'), customer = express.Router();
  load(['customer', 'ownedTicket', 'fail'].map(n => statement(sr, 'function', n)).join('\n') + '\n' + statement(sr, 'post', '/tickets/:ticketId/messages'), {}, { router: customer, pool, ...auth, ...socketAuth });
  app.use('/api/support', customer);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const token = (id = 'alice', companyId = 'c1', extra = {}) => jwt.sign({ id, companyId, ...extra }, secret, { expiresIn: '1h' });
  async function connect(accessToken = token()) {
    const ws = new WebSocket(url.replace('http:', 'ws:') + '/socket.io/?EIO=4&transport=websocket');
    const c = { ws, events: [], packets: [], ack: 0 }; clients.push(c);
    await new Promise((resolve, reject) => {
      const fail = error => { clearTimeout(timer); ws.close(); reject(error); };
      const timer = setTimeout(() => fail(Error('Local connection timed out')), 5000);
      ws.addEventListener('message', e => {
        const p = String(e.data); c.packets.push(p);
        if (p[0] === '0') ws.send('40' + JSON.stringify({ token: accessToken }));
        else if (p === '2') ws.send('3');
        else if (p.startsWith('40')) { c.id = JSON.parse(p.slice(2)).sid; clearTimeout(timer); resolve(); }
        else if (p.startsWith('44')) { c.error = JSON.parse(p.slice(2)).message; fail(Error(c.error)); }
        else if (p.startsWith('42')) c.events.push(JSON.parse(p.slice(2)));
      });
      ws.addEventListener('error', () => fail(Error('Local WebSocket connection failed')));
      ws.addEventListener('close', () => { if (!c.id) fail(Error(c.error || 'Connection closed before authentication')); });
    });
    c.emit = (name, ...args) => ws.send('42' + JSON.stringify([name, ...args]));
    c.call = async (name, ...args) => {
      assert.equal(ws.readyState, WebSocket.OPEN, 'Socket must authenticate before an acknowledged action');
      const ack = ++c.ack; ws.send(`42${ack}` + JSON.stringify([name, ...args]));
      await eventually(() => c.packets.some(p => p.startsWith(`43${ack}[`)));
      return JSON.parse(c.packets.find(p => p.startsWith(`43${ack}[`)).slice(2 + String(ack).length))[0];
    };
    c.join = room => c.call('join-room', room);
    return c;
  }
  async function reset() {
    for (const c of clients.splice(0)) c.ws.close(); await sleep(20);
    state.complimentary = false; state.failAuthorization = false; state.stop = false; errors.length = 0;
    await db.exec(`TRUNCATE chat_messages,chat_attachments,chat_room_members,chat_rooms,platform_support_messages,support_attachments,support_tickets,platform_support_agents,users,companies RESTART IDENTITY CASCADE;
      INSERT INTO companies(id) VALUES('c1'),('c2');
      INSERT INTO users(id,company_id,first_name,last_name) VALUES('alice','c1','Alice','Fixture'),('bob','c1','Bob','Fixture'),('eve','c1','Eve','Fixture'),('mallory','c2','Mallory','Fixture');
      INSERT INTO chat_rooms(id,company_id) VALUES('room1','c1'),('room2','c2');
      INSERT INTO chat_room_members(room_id,user_id) VALUES('room1','alice'),('room1','bob'),('room2','mallory');
      INSERT INTO platform_support_agents(id,email,first_name,last_name,role) VALUES('agent1','agent@example.invalid','Agent','Fixture','agent');
      INSERT INTO support_tickets(id,company_id,user_id,assigned_agent_id) VALUES('ticket1','c1','alice','agent1');`);
  }
  async function post(route, accessToken = token(), message = 'synthetic', form) {
    const response = await fetch(url + route, { method: 'POST', headers: { Authorization: 'Bearer ' + accessToken, ...(!form && { 'Content-Type': 'application/json' }) }, body: form || JSON.stringify({ roomId: 'room1', message }) });
    return { status: response.status, body: await response.json() };
  }
  async function sendDenied(c, message) {
    const before = errors.length; c.emit('chat-message', { roomId: 'room1', message });
    await eventually(() => errors.length > before);
    assert.equal((await db.query('SELECT COUNT(*)::int n FROM chat_messages WHERE message=$1', [message])).rows[0].n, 0);
  }
  async function delivered(c, message) { await eventually(() => c.events.some(e => e[1]?.message === message)); }
  function form() { const body = new FormData(); body.append('file', new Blob(['synthetic attachment']), 'synthetic.txt'); return body; }
  return { db, io, pool, state, errors, token, connect, reset, post, sendDenied, delivered, form, socketAuth, agentToken: jwt.sign({ tokenType: 'platform_support_agent', agentId: 'agent1' }, agentSecret),
    async close() { for (const c of clients) c.ws.close(); await new Promise(resolve => io.close(resolve)); await db.close(); } };
}

test('current socket authorization on production handlers and all content delivery paths', { timeout: 45000 }, async t => {
  const f = await fixture(); t.after(() => f.close());
  await t.test('legitimate members, multiple sockets, foreign tenants, roles and immutable metadata', async () => {
    await f.reset();
    const alice = await f.connect(), otherAlice = await f.connect(), bob = await f.connect(f.token('bob'));
    for (const c of [alice, otherAlice, bob]) assert.equal((await c.join('room1')).success, true);
    assert.equal((await alice.join('room2')).success, false);
    const outsider = await f.connect(f.token('eve')); assert.equal((await outsider.join('room1')).success, false);
    await assert.rejects(f.connect(f.token('alice', 'c2')), /current company/);
    for (const role of ['employee', 'boss', 'admin', 'support_agent']) {
      await f.db.query("UPDATE users SET role=$1 WHERE id='alice'", [role]);
      assert.equal((await alice.join('room1')).success, true);
      assert.equal((await alice.call('join-agent-dashboard')).success, false);
    }
    const result = await f.post('/api/chat/message', f.token('bob'), 'legitimate HTTP'); assert.equal(result.status, 200);
    for (const c of [alice, otherAlice, bob]) await f.delivered(c, 'legitimate HTTP');
    alice.emit('chat-message', { roomId: 'room1', message: 'legitimate socket' }); await f.delivered(bob, 'legitimate socket');
    const snapshots = await f.io.in('room-room1').fetchSockets();
    for (const s of snapshots) { assert.equal(s.handshake.auth.token, undefined); assert(!JSON.stringify(s.data).includes(f.token())); }
    assert.equal(Object.isFrozen(f.io.sockets.sockets.get(alice.id).data.authorization), true);
  });
  for (const [name, change, status] of [
    ['inactive user', "UPDATE users SET is_active=false WHERE id='alice'", 401],
    ['company move', "UPDATE users SET company_id='c2' WHERE id='alice'", 401],
    ['inactive company', "UPDATE companies SET is_active=false WHERE id='c1'", 401],
    ['cancelled entitlement', "UPDATE companies SET subscription_status='cancelled' WHERE id='c1'", 402],
    ['expired entitlement', "UPDATE companies SET subscription_current_period_end=now()-interval '1 second' WHERE id='c1'", 402],
    ['required password change', "UPDATE users SET must_change_password=true WHERE id='alice'", 403],
    ['membership removal', "DELETE FROM chat_room_members WHERE user_id='alice'", 403],
  ]) await t.test(name + ' denies join/send and retained-room delivery', async () => {
    await f.reset(); const c = await f.connect(); assert.equal((await c.join('room1')).success, true);
    await f.db.exec(change);
    assert.equal((await c.join('room1')).success, false); await f.sendDenied(c, name);
    assert.equal((await f.post('/api/chat/message', f.token(), name)).status, status);
    await f.socketAuth.emitAuthorizedRoom(f.io, 'room1', 'new-message', { message: 'must stay private' });
    await sleep(20); assert.equal(c.events.length, 0);
  });
  await t.test('natural JWT and entitlement deadlines and complimentary revocation', async () => {
    await f.reset();
    const expires = Math.floor(Date.now() / 1000) + 3;
    const c = await f.connect(jwt.sign({ id: 'alice', companyId: 'c1', exp: expires }, secret));
    assert.equal(c.error, undefined); assert.equal((await c.join('room1')).success, true); await sleep(Math.max(0, expires * 1000 - Date.now() + 20));
    assert.equal((await c.join('room1')).success, false); await f.sendDenied(c, 'expired JWT');
    await f.socketAuth.emitAuthorizedRoom(f.io, 'room1', 'new-message', { message: 'expired silence' }); assert.equal(c.events.length, 0);
    await f.reset();
    await f.db.exec("UPDATE companies SET subscription_current_period_end=now()+interval '1.5 second' WHERE id='c1'");
    const natural = await f.connect(); assert.equal((await natural.join('room1')).success, true); await sleep(1550);
    assert.equal((await natural.join('room1')).success, false); await f.sendDenied(natural, 'natural expiry');
    await f.reset(); f.state.complimentary = true;
    await f.db.exec("UPDATE companies SET subscription_status='inactive' WHERE id='c1'");
    const comp = await f.connect(); assert.equal((await comp.join('room1')).success, true);
    f.state.complimentary = false; assert.equal((await comp.join('room1')).success, false); await f.sendDenied(comp, 'complimentary revoked');
  });
  await t.test('retained sockets never receive text or attachments after removal; current sockets do', async () => {
    await f.reset(); const removed = await f.connect(), bob = await f.connect(f.token('bob'));
    await removed.join('room1'); await bob.join('room1'); await f.db.exec("DELETE FROM chat_room_members WHERE user_id='alice'");
    bob.emit('chat-message', { roomId: 'room1', message: 'socket private' }); await f.delivered(bob, 'socket private');
    assert.equal((await f.post('/api/chat/message', f.token('bob'), 'HTTP private')).status, 200); await f.delivered(bob, 'HTTP private');
    const file = await f.post('/api/chat/room/room1/attachments', f.token('bob'), '', f.form()); assert.equal(file.status, 201);
    await eventually(() => bob.events.some(e => e[1]?.attachment_name === 'synthetic.txt'));
    assert.equal(removed.events.length, 0); assert.equal(f.state.heldClients, 0);
  });
  await t.test('support owner exception survives unpaid/password-change state; other customers/roles stay excluded', async () => {
    await f.reset(); const owner = await f.connect(), other = await f.connect(f.token('bob'));
    await f.db.exec("UPDATE companies SET subscription_status='inactive' WHERE id='c1'; UPDATE users SET must_change_password=true,role='admin' WHERE id='alice'; UPDATE users SET role='support_agent' WHERE id='bob'");
    assert.equal((await owner.join('support-ticket-ticket1')).success, true);
    assert.equal((await other.join('support-ticket-ticket1')).success, false);
    assert.equal((await owner.call('join-agent-dashboard')).success, false);
    assert.equal((await f.post('/api/support-agent/tickets/ticket1/reply', f.agentToken, 'owner support')).status, 201); await f.delivered(owner, 'owner support');
    await f.db.exec("UPDATE users SET is_active=false WHERE id='alice'");
    assert.equal((await owner.join('support-ticket-ticket1')).success, false);
    assert.equal((await f.post('/api/support-agent/tickets/ticket1/reply', f.agentToken, 'revoked support')).status, 201);
    await sleep(20); assert(!owner.events.some(e => e[1]?.message === 'revoked support'));
  });
  await t.test('support media, presence, resolve and queue broadcasts each reauthorize recipients', async () => {
    await f.reset(); const owner = await f.connect(), other = await f.connect(f.token('bob'));
    await owner.join('support-ticket-ticket1');
    // Inject stale unauthorized subscriptions to exercise defense in depth.
    await f.io.sockets.sockets.get(other.id).join('room-support-ticket-ticket1');
    await f.io.sockets.sockets.get(other.id).join('platform-support-queue');
    assert.equal((await f.post('/api/support-agent/tickets/ticket1/accept', f.agentToken)).status, 200);
    assert.equal((await f.post('/api/support-agent/tickets/ticket1/attachments', f.agentToken, '', f.form())).status, 201);
    assert.equal((await f.post('/api/support/tickets/ticket1/messages', f.token(), 'customer queue')).status, 201);
    assert.equal((await f.post('/api/support-agent/tickets/ticket1/resolve', f.agentToken)).status, 200);
    await eventually(() => owner.events.some(e => e[0] === 'ticket-resolved'));
    assert(owner.events.some(e => e[0] === 'agent-joined')); assert(owner.events.some(e => e[1]?.attachment_name === 'synthetic.txt'));
    assert.equal(other.events.length, 0); assert.equal(f.state.heldClients, 0);
  });
  await t.test('DB and adapter failures fail closed without changing committed send/attachment success', async () => {
    await f.reset(); const c = await f.connect(); await c.join('room1'); await c.join('support-ticket-ticket1');
    f.state.failAuthorization = true;
    assert.equal((await c.join('room1')).success, false); await f.sendDenied(c, 'DB failed send');
    await f.socketAuth.emitAuthorizedRoom(f.io, 'room1', 'new-message', { message: 'DB failure private' }); assert.equal(c.events.length, 0);
    // Support reply uses its existing sender policy; recipient DB lookup fails.
    const reply = await f.post('/api/support-agent/tickets/ticket1/reply', f.agentToken, 'committed despite lookup failure'); assert.equal(reply.status, 201);
    f.state.failAuthorization = false;
    const original = f.io.in; f.io.in = () => ({ fetchSockets: async () => { throw Error('Synthetic adapter timeout'); } });
    try {
      assert.equal((await f.post('/api/chat/message', f.token(), 'committed despite adapter timeout')).status, 200);
      assert.equal((await f.post('/api/chat/room/room1/attachments', f.token(), '', f.form())).status, 201);
      assert.equal((await f.post('/api/support-agent/tickets/ticket1/attachments', f.agentToken, '', f.form())).status, 201);
      assert.equal(f.state.deletedFiles, 0); assert.equal(f.state.heldClients, 0);
    } finally { f.io.in = original; }
    assert.equal(c.events.length, 0);
  });
  await t.test('shutdown denies new actions and disconnect/reconnect retains no authority', async () => {
    await f.reset(); const c = await f.connect(); await c.join('room1'); f.state.stop = true;
    assert.equal((await c.join('room1')).success, false); assert.equal((await c.call('join-agent-dashboard')).success, false);
    c.emit('chat-message', { roomId: 'room1', message: 'shutdown must not persist' }); await sleep(20);
    assert.equal((await f.db.query('SELECT COUNT(*)::int n FROM chat_messages')).rows[0].n, 0);
    f.state.stop = false; c.ws.close(); await f.db.exec("UPDATE users SET is_active=false WHERE id='alice'");
    await assert.rejects(f.connect(), /not found/);
  });
});

test('every chat/support broadcaster uses authorized delivery and no unverified room fallback', () => {
  for (const name of ['index.ts', 'routes/chatRoutes.ts', 'routes/supportRoutes.ts', 'routes/supportAgentRoutes.ts', 'services/supportMedia.ts']) {
    assert(!/\.emit\(/.test(source(name)), name + ' must not broadcast directly');
  }
});
