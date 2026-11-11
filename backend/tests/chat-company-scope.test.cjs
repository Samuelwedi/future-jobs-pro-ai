'use strict';
const {test, before, beforeEach, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const {PGlite} = require('@electric-sql/pglite');
const express = require('express');
const jwt = require('jsonwebtoken');

// The override supports a negative-control run against an unchanged local checkout.
// No emitted dist, application startup, credentials, external DB, or provider is used.
const root = process.env.CHAT_SCOPE_SOURCE_ROOT || path.resolve(__dirname, '..');
process.env.JWT_SECRET = 'isolated-company-chat-scope-test';
process.env.COMPLIMENTARY_TESTER_IDENTITY = '';
const uid = n => `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`;
const [company, other, member, sender, outsider, inactive, foreign, boss, manager, admin,
  support, legacy, ticket, attachment, missing] = Array.from({length: 15}, (_, i) => uid(i + 1));
const supportRoom = `support-ticket-${ticket}`;
let db, gated, isolated, historyReads = 0, beforeHistoryRead, storageReads = 0, providerCalls = 0;
const servers = [];
const deniedProvider = () => { providerCalls++; throw Error('External providers are forbidden'); };
const pool = {
  async query(sql, args) {
    if (/FROM chat_messages cm/.test(sql)) {
      historyReads++;
      const mutate = beforeHistoryRead;
      beforeHistoryRead = undefined;
      if (mutate) await mutate();
    }
    const result = await db.query(sql, args);
    return {rows: result.rows, rowCount: result.rows.length || result.affectedRows || 0};
  },
  connect() { throw Error('Read-only scope tests must not start a transaction'); },
};
const cache = new Map();
function load(relative) {
  const filename = path.join(root, 'src', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = {exports: {}};
  cache.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true},
  }).outputText;
  const scopedRequire = spec => {
    if (spec.endsWith('/config/database')) return {pool};
    if (spec.endsWith('/services/chatStorage')) return {
      uploadPrivateChatFile: deniedProvider,
      removePrivateChatFile: deniedProvider,
      readPrivateChatFile: async key => {
        assert.equal(key, 'synthetic-storage-key');
        storageReads++;
        return require('node:stream').Readable.from(Buffer.from('synthetic attachment bytes'));
      },
    };
    if (spec === 'cloudinary') return {v2: {uploader: {upload_stream: deniedProvider}}};
    if (spec.startsWith('.')) {
      const rel = path.relative(path.join(root, 'src'), path.resolve(path.dirname(filename), spec + '.ts'));
      assert.ok(['utils/auth.ts', 'middleware/trialMiddleware.ts', 'services/complimentaryAccess.ts',
        'services/chatHistory.ts', 'services/chatService.ts', 'services/chatFiles.ts', 'services/socketAuthorization.ts'].includes(rel), `Unexpected source import: ${spec}`);
      return load(rel);
    }
    assert.ok(['express', 'multer', 'jsonwebtoken', 'node:stream', 'node:stream/promises', 'node:path'].includes(spec),
      `Unexpected package import: ${spec}`);
    return require(spec);
  };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, {filename})(scopedRequire, module, module.exports);
  return module.exports;
}
async function start(withGate) {
  const app = express();
  if (withGate) app.use('/api', load('middleware/trialMiddleware.ts').subscriptionGate);
  app.use('/api/chat', load('routes/chatRoutes.ts').default);
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}
function token(actor, claims = {}) {
  return jwt.sign({id: actor, ...claims}, process.env.JWT_SECRET, {expiresIn: '5m'});
}
async function request(route, actor = member, options = {}) {
  const auth = options.token ?? (actor ? token(actor, options.claims) : null);
  return fetch((options.isolated ? isolated : gated) + '/api/chat' + route, {
    headers: auth ? {Authorization: `Bearer ${auth}`} : {},
  });
}
async function read(actor = member, requestedCompany = company, options) {
  const response = await request(`/company/${requestedCompany}`, actor, options);
  return {status: response.status, data: await response.json()};
}
async function seed() {
  historyReads = storageReads = providerCalls = 0;
  beforeHistoryRead = undefined;
  await db.exec('TRUNCATE chat_messages, chat_attachments, chat_room_members, chat_rooms, support_tickets, users, companies CASCADE');
  for (const id of [company, other]) {
    await db.query("INSERT INTO companies(id,subscription_status,subscription_tier) VALUES($1,'active','pro')", [id]);
  }
  for (const [id, c, role, active] of [
    [member, company, 'employee', true], [sender, company, 'employee', true],
    [outsider, company, 'employee', true], [inactive, company, 'employee', false],
    [foreign, other, 'employee', true], [boss, company, 'boss', true],
    [manager, company, 'manager', true], [admin, company, 'admin', true],
    [support, other, 'support_agent', true], [legacy, company, 'employee', null],
  ]) {
    await db.query(`INSERT INTO users(id,company_id,role,is_active,first_name,last_name,profile_pic)
      VALUES($1,$2,$3,$4,'Synthetic','Sender','https://example.invalid/synthetic-avatar.jpg')`, [id, c, role, active]);
  }
  for (const [room, c, group] of [['private-direct', company, false], ['private-group', company, true],
    ['foreign-room', other, false]]) {
    await db.query('INSERT INTO chat_rooms(id,company_id,is_group) VALUES($1,$2,$3)', [room, c, group]);
  }
  for (const room of ['private-direct', 'private-group']) {
    for (const user of [member, sender, inactive, legacy]) {
      await db.query('INSERT INTO chat_room_members VALUES($1,$2)', [room, user]);
    }
  }
  await db.query("INSERT INTO chat_room_members VALUES('foreign-room',$1)", [foreign]);
  await db.query('INSERT INTO support_tickets VALUES($1,$2,$3)', [ticket, company, member]);
  await db.query(`INSERT INTO chat_attachments(id,room_id,uploader_id,filename,mime_type,size_bytes,storage_public_id)
    VALUES($1,'private-direct',$2,'synthetic-private.pdf','application/pdf',123,'synthetic-storage-key')`, [attachment, sender]);
  const fixtures = [
    ['private-direct', 'PRIVATE DIRECT', company, sender, attachment],
    ['private-group', 'PRIVATE GROUP', company, sender, null],
    [supportRoom, 'PRIVATE SUPPORT', company, sender, null],
    [company, 'LEGACY COMPANY', company, sender, null],
    [null, 'LEGACY NULL', company, sender, null],
    ['orphan-room', 'ORPHAN', company, sender, null],
    ['', 'EMPTY ROOM', company, sender, null],
    ['foreign-room', 'FOREIGN', other, foreign, null],
  ];
  for (let i = 0; i < fixtures.length; i++) {
    const [room, message, c, user, a] = fixtures[i];
    await db.query(`INSERT INTO chat_messages(id,company_id,sender_id,room_id,message,attachment_id,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [uid(100 + i), c, user, room, message, a, `2026-01-01T00:00:0${i}Z`]);
  }
}
before(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE companies(id uuid PRIMARY KEY,is_active boolean DEFAULT true,subscription_status text,
    subscription_tier text,subscription_provider text,subscription_current_period_end timestamptz,subscription_expires_at timestamptz);
    CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,role text,is_active boolean DEFAULT true,first_name text,last_name text,profile_pic text);
    CREATE TABLE chat_rooms(id text PRIMARY KEY,company_id uuid,is_group boolean,name text,created_by uuid,updated_at timestamptz DEFAULT now());
    CREATE TABLE chat_room_members(room_id text,user_id uuid);
    CREATE TABLE chat_messages(id uuid PRIMARY KEY,company_id uuid,sender_id uuid,room_id text,message text NOT NULL,created_at timestamptz);
    CREATE TABLE support_tickets(id uuid PRIMARY KEY,company_id uuid,user_id uuid);`);
  await db.exec(fs.readFileSync(path.join(root, 'migrations/20261012_chat_media.sql'), 'utf8'));
  gated = await start(true);
  isolated = await start(false);
});
beforeEach(seed);
after(async () => {
  await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
  await db?.close();
  assert.equal(providerCalls, 0);
});

test('real JWT verification denies absent, invalid, expired, and non-access tokens before history SQL', async () => {
  for (const options of [null, {token: 'invalid'},
    {token: jwt.sign({id: member}, process.env.JWT_SECRET, {expiresIn: -1})},
    {token: token(member, {purpose: 'password-reset'})}]) {
    const result = await read(options ? member : null, company, options || undefined);
    assert.equal(result.status, 401);
    assert.equal(result.data.messages, undefined);
  }
  assert.equal(historyReads, 0);
});

test('same-company nonmembers, including elevated roles, see no text or attachment metadata', async () => {
  for (const actor of [outsider, boss, manager, admin]) {
    const result = await read(actor);
    assert.equal(result.status, 200);
    assert.deepEqual(result.data, {success: true, messages: []});
  }
  assert.equal(storageReads, 0);
});

test('current direct/group members keep the response shape, ordering, sender and attachment fields without duplicates', async () => {
  await db.query("INSERT INTO chat_room_members VALUES('private-direct',$1)", [member]);
  const result = await read();
  assert.equal(result.status, 200);
  assert.deepEqual(Object.keys(result.data).sort(), ['messages', 'success']);
  assert.equal(result.data.success, true);
  assert.deepEqual(result.data.messages.map(message => message.id), [uid(100), uid(101)]);
  const direct = result.data.messages[0];
  assert.equal(direct.message, 'PRIVATE DIRECT');
  assert.equal(direct.company_id, company);
  assert.equal(direct.sender_id, sender);
  assert.equal(direct.sender_name, 'Synthetic Sender');
  assert.equal(direct.sender_avatar, 'https://example.invalid/synthetic-avatar.jpg');
  assert.equal(direct.attachment_id, attachment);
  assert.equal(direct.attachment_name, 'synthetic-private.pdf');
  assert.equal(direct.attachment_type, 'application/pdf');
  assert.equal(direct.attachment_size, 123);
  assert.equal(result.data.messages[1].attachment_name, null);
  for (const endpoint of ['room', 'messages']) {
    const response = await request(`/${endpoint}/private-direct`);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).messages, [direct]);
  }
});

test('foreign users and mismatched message/room companies cannot cross the aggregate tenant boundary', async () => {
  assert.equal((await read(foreign)).status, 403);
  assert.equal((await read(member, other)).status, 403);
  assert.equal((await read(foreign, company, {claims: {companyId: company}})).status, 401);
  // A lingering cross-company membership must not authorize either mismatch direction.
  await db.query("INSERT INTO chat_room_members VALUES('foreign-room',$1)", [member]);
  await db.query(`INSERT INTO chat_messages(id,company_id,sender_id,room_id,message,created_at)
    VALUES($1,$2,$3,'foreign-room','WRONG ROOM COMPANY',now()),
          ($4,$5,$3,'private-direct','WRONG MESSAGE COMPANY',now())`, [uid(200), company, sender, uid(201), other]);
  assert.deepEqual((await read()).data.messages.map(message => message.id), [uid(100), uid(101)]);
  assert.deepEqual((await read(foreign, other)).data.messages.map(message => message.id), [uid(107)]);
});

test('inactive and missing actors are denied by the actual gate and by the isolated route; legacy null-active members retain access', async () => {
  for (const actor of [inactive, missing]) {
    assert.equal((await read(actor)).status, 401);
    const raw = await read(actor, company, {isolated: true});
    assert.equal(raw.status, 404);
    assert.equal(raw.data.messages, undefined);
  }
  assert.equal(historyReads, 0);
  assert.deepEqual((await read(legacy)).data.messages.map(message => message.id), [uid(100), uid(101)]);
  await db.query('UPDATE companies SET is_active=false WHERE id=$1', [company]);
  assert.equal((await read(member)).status, 401);
});

test('a moved user is authorized only by current DB company and membership, never stale JWT tenant or role claims', async () => {
  const staleToken = token(member, {companyId: company, role: 'admin'});
  await db.query('UPDATE users SET company_id=$1 WHERE id=$2', [other, member]);
  await db.query("INSERT INTO chat_room_members VALUES('foreign-room',$1)", [member]);
  assert.equal((await read(member, company, {token: staleToken})).status, 401);
  assert.equal((await read(member)).status, 403);
  assert.equal((await read(member, company, {isolated: true, token: staleToken})).status, 403);
  for (const options of [{}, {isolated: true, token: staleToken}]) {
    const current = await read(member, other, options);
    assert.equal(current.status, 200);
    assert.deepEqual(current.data.messages.map(message => message.id), [uid(107)]);
  }
});

test('membership grants and removals apply on the next request with the same valid JWT', async () => {
  const options = {token: token(outsider)};
  assert.deepEqual((await read(outsider, company, options)).data.messages, []);
  await db.query("INSERT INTO chat_room_members VALUES('private-direct',$1)", [outsider]);
  assert.deepEqual((await read(outsider, company, options)).data.messages.map(message => message.id), [uid(100)]);
  await db.query('DELETE FROM chat_room_members WHERE user_id=$1', [outsider]);
  assert.deepEqual((await read(outsider, company, options)).data.messages, []);
  assert.equal((await request('/messages/private-direct', outsider, options)).status, 403);
});

test('support remains outside the aggregate even with room membership, while existing support room authorization is preserved', async () => {
  // Defense against a support-prefixed room record accidentally being treated as ordinary chat.
  await db.query('INSERT INTO chat_rooms(id,company_id,is_group) VALUES($1,$2,false)', [supportRoom, company]);
  for (const actor of [member, outsider, boss, manager, admin]) {
    await db.query('INSERT INTO chat_room_members VALUES($1,$2)', [supportRoom, actor]);
    const result = await read(actor);
    assert.equal(result.status, 200);
    assert.ok(result.data.messages.every(message => message.room_id !== supportRoom));
  }
  for (const endpoint of ['room', 'messages']) {
    for (const actor of [member, boss, manager, admin, support]) {
      const response = await request(`/${endpoint}/${supportRoom}`, actor);
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).messages.map(message => message.id), [uid(102)]);
    }
    assert.equal((await request(`/${endpoint}/${supportRoom}`, outsider)).status, 403);
  }
});

test('null, empty, orphan and historical company-ID messages fail closed without a real current room membership', async () => {
  assert.deepEqual((await read()).data.messages.map(message => message.id), [uid(100), uid(101)]);
  await db.query('INSERT INTO chat_rooms(id,company_id,is_group) VALUES($1,$2,true)', [company, company]);
  assert.deepEqual((await read()).data.messages.map(message => message.id), [uid(100), uid(101)]);
  await db.query('INSERT INTO chat_room_members VALUES($1,$2)', [company, member]);
  assert.deepEqual((await read()).data.messages.map(message => message.id), [uid(100), uid(101), uid(103)]);
  assert.deepEqual((await read(outsider)).data.messages, []);
});

test('the latest 200 authorized rows are filtered before the limit and returned in timestamp/id order with metadata', async () => {
  await db.query("INSERT INTO chat_rooms(id,company_id,is_group) VALUES('unjoined-group',$1,true)", [company]);
  // Insert in reverse ID order with timestamp ties to verify the secondary ordering.
  for (let i = 205; i > 0; i--) {
    await db.query(`INSERT INTO chat_messages(id,company_id,sender_id,room_id,message,attachment_id,created_at)
      VALUES($1,$2,$3,'private-direct',$4,$5,$6)`, [uid(1000 + i), company, sender,
      `VISIBLE ${i}`, attachment, new Date(Date.UTC(2026, 1, 1, 0, 0, Math.floor(i / 2))).toISOString()]);
  }
  // More than 200 newer private rows must neither leak nor crowd out visible history.
  for (let i = 1; i <= 240; i++) {
    await db.query(`INSERT INTO chat_messages(id,company_id,sender_id,room_id,message,created_at)
      VALUES($1,$2,$3,$4,'HIDDEN NEWER', $5)`, [uid(2000 + i), company, sender,
      i % 2 ? 'unjoined-group' : supportRoom, new Date(Date.UTC(2026, 2, 1, 0, 0, i)).toISOString()]);
  }
  const result = await read();
  assert.equal(result.status, 200);
  assert.equal(result.data.messages.length, 200);
  assert.deepEqual(result.data.messages.map(message => message.id), Array.from({length: 200}, (_, i) => uid(1006 + i)));
  assert.ok(result.data.messages.every(message => message.attachment_id === attachment
    && message.attachment_name === 'synthetic-private.pdf' && message.attachment_size === 123));
  assert.deepEqual((await read(outsider)).data.messages, []);
});

test('the history SQL rechecks membership, active state and company if they change after the initial actor lookup', async () => {
  for (const change of [
    () => db.query('DELETE FROM chat_room_members WHERE user_id=$1', [member]),
    () => db.query('UPDATE users SET is_active=false WHERE id=$1', [member]),
    () => db.query('UPDATE users SET company_id=$1 WHERE id=$2', [other, member]),
    () => db.query('UPDATE chat_rooms SET company_id=$1', [other]),
  ]) {
    await seed();
    beforeHistoryRead = change;
    const result = await read();
    assert.equal(result.status, 200);
    assert.deepEqual(result.data.messages, []);
    assert.equal(historyReads, 1);
  }
});

test('room histories and attachment downloads keep denying nonmembers and preserve legitimate member access', async () => {
  for (const actor of [outsider, foreign]) {
    for (const room of ['private-direct', 'private-group']) {
      for (const endpoint of ['room', 'messages']) {
        assert.equal((await request(`/${endpoint}/${room}`, actor)).status, 403);
      }
    }
    assert.equal((await request(`/attachments/${attachment}/content`, actor)).status, 403);
  }
  assert.equal(storageReads, 0);
  const download = await request(`/attachments/${attachment}/content`);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('cache-control'), 'private, no-store');
  assert.equal(await download.text(), 'synthetic attachment bytes');
  assert.equal(storageReads, 1);
  await db.query('DELETE FROM chat_room_members WHERE user_id=$1', [member]);
  assert.equal((await request(`/attachments/${attachment}/content`)).status, 403);
  assert.equal(storageReads, 1);
});
