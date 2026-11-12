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
const root = process.env.CHAT_INBOX_SOURCE_ROOT || path.resolve(__dirname, '..');
process.env.JWT_SECRET = 'isolated-chat-inbox-test';
process.env.COMPLIMENTARY_TESTER_IDENTITY = '';
const uid = n => `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`;
const [company, other, member, sender, outsider, inactive, foreign, boss, manager, admin,
  support, legacy, ticket, attachment, missing] = Array.from({length: 15}, (_, i) => uid(i + 1));
const supportRoom = `support-ticket-${ticket}`;
let db, gated, isolated, inboxReads = 0, beforeInboxRead, providerCalls = 0;
const servers = [];
const deniedProvider = () => { providerCalls++; throw Error('External providers are forbidden'); };
const pool = {
  async query(sql, args) {
    if (/latest.last_message/.test(sql)) {
      inboxReads++;
      const mutate = beforeInboxRead;
      beforeInboxRead = undefined;
      if (mutate) await mutate();
    }
    const result = await db.query(sql, args);
    return {rows: result.rows, rowCount: result.rows.length || result.affectedRows || 0};
  },
  connect() { throw Error('Read-only inbox tests must not start a transaction'); },
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
      readPrivateChatFile: deniedProvider,
    };
    if (spec === 'cloudinary') return {v2: {uploader: {upload_stream: deniedProvider}}};
    if (spec.startsWith('.')) {
      const rel = path.relative(path.join(root, 'src'), path.resolve(path.dirname(filename), spec + '.ts'));
      assert.ok(['utils/auth.ts', 'middleware/trialMiddleware.ts', 'services/complimentaryAccess.ts',
        'services/chatViews.ts', 'services/chatTextReceipts.ts', 'services/chatHistory.ts', 'services/chatService.ts', 'services/chatFiles.ts', 'services/socketAuthorization.ts'].includes(rel), `Unexpected source import: ${spec}`);
      return load(rel);
    }
    assert.ok(['express', 'multer', 'jsonwebtoken', 'node:stream', 'node:stream/promises', 'node:path', 'node:crypto'].includes(spec),
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
  inboxReads = providerCalls = 0;
  beforeInboxRead = undefined;
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
    CREATE TABLE chat_rooms(id text PRIMARY KEY,company_id uuid,is_group boolean DEFAULT false,name text,created_by uuid,updated_at timestamptz DEFAULT now());
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

async function inbox(actor = member, options = {}, target = actor) {
  const response = await request(`/rooms/${target}`, actor, options);
  return {status: response.status, data: await response.json()};
}
async function addMessage(id, room, message, time, c = company, a = null) {
  await db.query(`INSERT INTO chat_messages(id,company_id,sender_id,room_id,message,created_at,attachment_id)
    VALUES($1,$2,$3,$4,$5,$6,$7)`, [uid(id), c, sender, room, message, time, a]);
}

test('inbox verifies real JWTs and rejects other-user listing before projection', async () => {
  for (const options of [{token: 'invalid'}, {token: jwt.sign({id: member}, process.env.JWT_SECRET, {expiresIn: -1})},
    {token: token(member, {purpose: 'password-reset'})}]) {
    assert.equal((await inbox(member, options)).status, 401);
  }
  assert.equal((await inbox(null, {}, member)).status, 401);
  assert.equal((await inbox(member, {}, sender)).status, 403);
  assert.equal(inboxReads, 0);
});

test('current membership alone controls inbox, including elevated roles and duplicate legacy membership', async () => {
  for (const actor of [outsider, boss, manager, admin, support]) {
    assert.deepEqual((await inbox(actor)).data, {success: true, rooms: []});
  }
  await db.query("INSERT INTO chat_room_members VALUES('private-direct',$1)", [member]);
  const result = await inbox();
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.rooms.map(r => r.id), ['private-group', 'private-direct']);
  const direct = result.data.rooms[1];
  assert.deepEqual(Object.keys(direct).sort(), ['id','name','is_group','avatar_url','other_user_avatar',
    'other_user_name','last_message','last_message_type','last_message_at'].sort());
  assert.equal(direct.other_user_name, 'Synthetic Sender');
  assert.equal(direct.other_user_avatar, 'https://example.invalid/synthetic-avatar.jpg');
  assert.equal(direct.last_message, 'PRIVATE DIRECT');
  assert.equal(direct.last_message_type, 'file');
  assert.equal(direct.last_message_at, '2026-01-01T00:00:00.000Z');
  await db.query('DELETE FROM chat_room_members WHERE user_id=$1', [member]);
  assert.deepEqual((await inbox()).data.rooms, []);
});

test('tenant fences exclude foreign membership, support rows, and newer mismatched message rows before LIMIT', async () => {
  await db.query("INSERT INTO chat_room_members VALUES('foreign-room',$1)", [member]);
  await db.query('INSERT INTO chat_rooms(id,company_id) VALUES($1,$2)', [supportRoom, company]);
  await db.query('INSERT INTO chat_room_members VALUES($1,$2)', [supportRoom, member]);
  for (let i = 0; i < 12; i++) {
    await addMessage(200 + i, 'private-direct', 'FOREIGN SECRET', '2026-11-01', other);
    await addMessage(300 + i, 'foreign-room', 'WRONG ROOM COMPANY', '2026-11-01');
  }
  const result = await inbox();
  assert.deepEqual(result.data.rooms.map(r => r.id), ['private-group', 'private-direct']);
  assert.equal(result.data.rooms[1].last_message, 'PRIVATE DIRECT');
  assert.deepEqual((await inbox(foreign)).data.rooms.map(r => r.id), ['foreign-room']);
});

test('inactive and missing users fail both actual gate and isolated route; null-active remains compatible', async () => {
  for (const actor of [inactive, missing]) {
    assert.equal((await inbox(actor)).status, 401);
    assert.equal((await inbox(actor, {isolated: true})).status, 404);
  }
  assert.equal(inboxReads, 0);
  assert.equal((await inbox(legacy)).data.rooms.length, 2);
});

test('moved actors use current DB company and membership, ignoring isolated-route stale JWT tenant/role claims', async () => {
  const stale = token(member, {companyId: company, role: 'admin'});
  await db.query('UPDATE users SET company_id=$1 WHERE id=$2', [other, member]);
  assert.deepEqual((await inbox(member, {isolated: true, token: stale})).data.rooms, []);
  await db.query("INSERT INTO chat_room_members VALUES('foreign-room',$1)", [member]);
  assert.deepEqual((await inbox(member, {isolated: true, token: stale})).data.rooms.map(r => r.id), ['foreign-room']);
  // The existing application gate separately rejects stale tenant claims.
  assert.equal((await inbox(member, {token: stale})).status, 401);
  assert.deepEqual((await inbox()).data.rooms.map(r => r.id), ['foreign-room']);
});

test('latest previews are Unicode-bounded, retain captions, classify media, and never expose storage metadata', async () => {
  const text = '😀'.repeat(180);
  await addMessage(400, 'private-group', text, '2026-03-01');
  assert.equal((await inbox()).data.rooms[0].last_message, '😀'.repeat(160));
  for (const [index, mime, kind, caption] of [[0,'image/png','image','Photo caption'],
    [1,'audio/mp4','audio',''], [2,'application/pdf','file','File caption']]) {
    const aid = uid(500 + index);
    await db.query(`INSERT INTO chat_attachments(id,room_id,uploader_id,filename,mime_type,size_bytes,storage_public_id)
      VALUES($1,'private-direct',$2,'SECRET-FILENAME',$3,123,'SECRET-STORAGE')`, [aid, sender, mime]);
    await addMessage(600 + index, 'private-direct', caption, `2026-04-0${index + 1}`, company, aid);
    const preview = (await inbox()).data.rooms[0];
    assert.equal(preview.last_message_type, kind);
    assert.equal(preview.last_message, caption);
    assert.ok(!JSON.stringify(preview).includes('SECRET'));
  }
  // A mismatched attachment association may not influence the projection.
  await addMessage(700, 'private-group', 'Safe text', '2026-05-01', company, attachment);
  assert.equal((await inbox()).data.rooms[0].last_message_type, 'text');
});

test('preview and room ordering are deterministic, ignore updated_at for messaged rooms, and retain empty rooms', async () => {
  await db.query("UPDATE chat_rooms SET updated_at='2099-01-01' WHERE id='private-direct'");
  await db.query(`INSERT INTO chat_rooms(id,company_id,updated_at) VALUES
    ('empty-a',$1,'2026-02-01'),('empty-b',$1,'2026-02-01'),('empty-new',$1,'2099-02-01')`, [company]);
  for (const room of ['empty-a','empty-b','empty-new']) await db.query('INSERT INTO chat_room_members VALUES($1,$2)', [room, member]);
  await addMessage(802, 'private-direct', 'Tie winner', '2026-06-01');
  await addMessage(801, 'private-direct', 'Tie loser', '2026-06-01');
  await addMessage(803, 'private-group', 'Same time', '2026-06-01');
  await addMessage(804, 'private-direct', 'Unknown time', null);
  for (let i = 0; i < 2; i++) {
    const rooms = (await inbox()).data.rooms;
    assert.deepEqual(rooms.map(r => r.id), ['private-direct','private-group','empty-new','empty-a','empty-b']);
    assert.equal(rooms[0].last_message, 'Tie winner');
    for (const empty of rooms.slice(2)) {
      assert.equal(empty.last_message, null);
      assert.equal(empty.last_message_type, null);
      assert.equal(empty.last_message_at, null);
    }
  }
});

test('peer display fields cannot reveal a lingering foreign or inactive member', async () => {
  await db.query("UPDATE users SET company_id=$1,first_name='SECRET' WHERE id=$2", [other, sender]);
  await db.query('DELETE FROM chat_room_members WHERE user_id=$1', [legacy]);
  const rooms = (await inbox()).data.rooms;
  assert.ok(rooms.every(r => r.other_user_name === 'Chat' && r.other_user_avatar === null));
});

test('projection rechecks authorization when membership, activity, or tenant changes after lookup', async () => {
  for (const change of [
    () => db.query('DELETE FROM chat_room_members WHERE user_id=$1', [member]),
    () => db.query('UPDATE users SET is_active=false WHERE id=$1', [member]),
    () => db.query('UPDATE users SET company_id=$1 WHERE id=$2', [other, member]),
    () => db.query('UPDATE chat_rooms SET company_id=$1', [other]),
    () => db.query('DELETE FROM users WHERE id=$1', [member]),
  ]) {
    await seed();
    beforeInboxRead = change;
    const result = await inbox();
    assert.equal(result.status, 200);
    assert.deepEqual(result.data.rooms, []);
    assert.equal(inboxReads, 1);
  }
});


test('legacy null group flags retain direct-room semantics and omitted flags default to false', async () => {
  await db.query("UPDATE chat_rooms SET is_group=NULL WHERE id='private-direct'");
  await db.query("INSERT INTO chat_rooms(id,company_id) VALUES('default-direct',$1)", [company]);
  await db.query("INSERT INTO chat_room_members VALUES('default-direct',$1)", [member]);
  const result = await inbox();
  assert.equal(result.status, 200);
  for (const id of ['private-direct', 'default-direct']) {
    assert.equal(result.data.rooms.find(room => room.id === id).is_group, false);
  }
  assert.equal(result.data.rooms.find(room => room.id === 'private-group').is_group, true);
});


test('latest preview skips newer null or missing senders before LIMIT, matching room-history visibility', async () => {
  await addMessage(900, 'private-direct', 'Readable latest', '2026-07-01T00:00:00Z');
  await db.query(`INSERT INTO chat_messages(id,company_id,sender_id,room_id,message,created_at)
    VALUES($1,$2,NULL,'private-direct','NULL SENDER','2026-08-01'),
          ($3,$2,$4,'private-direct','MISSING SENDER','2026-09-01')`,
    [uid(901), company, uid(902), missing]);
  const room = (await inbox()).data.rooms.find(r => r.id === 'private-direct');
  assert.equal(room.last_message, 'Readable latest');
  assert.equal(room.last_message_at, '2026-07-01T00:00:00.000Z');
  const history = await request('/room/private-direct');
  const messages = (await history.json()).messages;
  assert.equal(messages.at(-1).message, room.last_message);
  assert.ok(messages.every(message => !message.message.includes('SENDER')));
  // History keeps rows from senders who subsequently move or become inactive.
  await db.query('UPDATE users SET company_id=$1,is_active=false WHERE id=$2', [other, sender]);
  assert.equal((await inbox()).data.rooms.find(r => r.id === 'private-direct').last_message, 'Readable latest');
});
