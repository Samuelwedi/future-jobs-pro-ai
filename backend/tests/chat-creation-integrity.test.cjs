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

// Source-only HTTP/SQL tests. PGlite is single-session: the mock pool serializes
// checked-out clients, not autocommit pool.query. This is NOT multi-session PG QA.
const root = process.env.CHAT_CREATION_SOURCE_ROOT || path.resolve(__dirname, '..');
process.env.JWT_SECRET = 'isolated-chat-creation-test';
process.env.COMPLIMENTARY_TESTER_IDENTITY = '';
const uid = n => `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`;
const [company, other, actor, recipient, third, foreign, inactive, missing, legacy,
  boss, manager, admin, support] = Array.from({length: 13}, (_, i) => uid(i + 1));
const pair = (a = actor, b = recipient) => [a, b].sort().join('-');
let db, gated, isolated, trace, beforeConnect, failMembership, poolFault, activeClients;
let clientQueue = Promise.resolve();
let phaseFailure, releasedClients, simultaneousLegacyRoomReads, conflictRoom;
const servers = [];
let providerCalls = 0;
const deniedProvider = () => { providerCalls++; throw Error('Provider calls forbidden'); };
async function query(sql, args, client) {
  trace.push({sql, args, client});
  if (poolFault && poolFault(sql)) throw Object.assign(Error('Synthetic SQL failure'), {code: '55P03'});
  if (/INSERT INTO chat_room_members/.test(sql) && failMembership) {
    failMembership = false;
    throw Error('Synthetic membership write failure');
  }
  if (phaseFailure === sql) throw Error('Synthetic ' + sql + ' failure before execution');
  if (sql === 'COMMIT' && phaseFailure === 'lost-commit') {
    await db.query(sql, args);
    throw Object.assign(Error('Synthetic lost COMMIT acknowledgment'), {code: '55P03'});
  }
  if (sql === 'ROLLBACK' && phaseFailure === 'lost-rollback') {
    await db.query(sql, args);
    throw Error('Synthetic lost ROLLBACK acknowledgment');
  }
  if (conflictRoom && /INSERT INTO chat_rooms/.test(sql)) {
    const fixture = conflictRoom;
    conflictRoom = undefined;
    await seedRoom(fixture);
  }
  const result = await db.query(sql, args);
  // Force both old autocommit requests to observe no room before either inserts.
  if (simultaneousLegacyRoomReads && /^SELECT id FROM chat_rooms/.test(sql)) {
    const barrier = simultaneousLegacyRoomReads;
    if (++barrier.count === 2) barrier.release();
    await barrier.ready;
  }
  return {rows: result.rows, rowCount: result.rows.length || result.affectedRows || 0};
}
const pool = {
  query(sql, args) { return query(sql, args, false); },
  async connect() {
    const hook = beforeConnect;
    beforeConnect = undefined;
    if (hook) await hook();
    const previous = clientQueue;
    let unlock;
    clientQueue = new Promise(resolve => { unlock = resolve; });
    await previous;
    activeClients++;
    let released = false;
    return {
      query(sql, args) { return query(sql, args, true); },
      release(discard) {
        releasedClients.push(Boolean(discard));
        assert.equal(released, false, 'client released twice');
        released = true;
        activeClients--;
        unlock();
      },
    };
  },
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
      uploadPrivateChatFile: deniedProvider, removePrivateChatFile: deniedProvider, readPrivateChatFile: deniedProvider,
    };
    if (spec === 'cloudinary') return {v2: {uploader: {upload_stream: deniedProvider}}};
    if (spec.startsWith('.')) {
      const rel = path.relative(path.join(root, 'src'), path.resolve(path.dirname(filename), spec + '.ts'));
      assert.ok(['utils/auth.ts', 'middleware/trialMiddleware.ts', 'services/complimentaryAccess.ts',
        'services/chatService.ts', 'services/chatFiles.ts', 'services/socketAuthorization.ts'].includes(rel), `Unexpected source import: ${spec}`);
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
  app.use(express.json());
  if (withGate) app.use('/api', load('middleware/trialMiddleware.ts').subscriptionGate);
  app.use('/api/chat', load('routes/chatRoutes.ts').default);
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}
function token(id, claims = {}) { return jwt.sign({id, ...claims}, process.env.JWT_SECRET, {expiresIn: '5m'}); }
async function post(kind, body, options = {}) {
  const auth = options.token ?? (options.actor === null ? null : token(options.actor || actor, options.claims));
  const response = await fetch((options.isolated ? isolated : gated) + '/api/chat/create-' + kind, {
    method: 'POST', headers: {'Content-Type': 'application/json', ...(auth ? {Authorization: `Bearer ${auth}`} : {})},
    body: JSON.stringify(body),
  });
  return {status: response.status, data: await response.json()};
}
const direct = (options, target = recipient) => post('direct', {userId2: target}, options);
const group = (options, members = [recipient]) => post('group', {name: ' Synthetic team ', memberIds: members}, options);
async function count(table) { return Number((await db.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n); }
async function members(room) {
  return (await db.query('SELECT user_id FROM chat_room_members WHERE room_id=$1 ORDER BY user_id', [room])).rows.map(x => x.user_id);
}
async function assertEmpty() { assert.equal(await count('chat_rooms'), 0); assert.equal(await count('chat_room_members'), 0); }
async function seedRoom({c = company, group = false, users = [actor, recipient]} = {}) {
  await db.query('INSERT INTO chat_rooms(id,company_id,is_group,name) VALUES($1,$2,$3,$4)', [pair(), c, group, 'Existing private history']);
  for (const user of users) await db.query('INSERT INTO chat_room_members(room_id,user_id) VALUES($1,$2)', [pair(), user]);
}
before(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE companies(id uuid PRIMARY KEY,is_active boolean DEFAULT true,subscription_status text,
    subscription_tier text,subscription_provider text,subscription_current_period_end timestamptz,subscription_expires_at timestamptz);
    CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,role text,is_active boolean DEFAULT true,first_name text,last_name text);
    CREATE TABLE chat_rooms(id varchar(255) PRIMARY KEY,company_id uuid NOT NULL,is_group boolean DEFAULT false,
      name varchar(255),created_by uuid,updated_at timestamptz DEFAULT now());
    CREATE TABLE chat_room_members(room_id varchar(255) REFERENCES chat_rooms(id) ON DELETE CASCADE,
      user_id uuid REFERENCES users(id) ON DELETE CASCADE,joined_at timestamptz DEFAULT now(),PRIMARY KEY(room_id,user_id));`);
  gated = await start(true); isolated = await start(false);
});
beforeEach(async () => {
  assert.equal(activeClients || 0, 0);
  trace = []; beforeConnect = undefined; failMembership = false; poolFault = undefined; activeClients = 0;
  phaseFailure = undefined; releasedClients = []; simultaneousLegacyRoomReads = undefined; conflictRoom = undefined;
  await db.exec('TRUNCATE chat_room_members, chat_rooms, users, companies CASCADE');
  for (const id of [company, other]) await db.query("INSERT INTO companies VALUES($1,true,'active','pro',null,null,null)", [id]);
  for (const [id, c, role, active] of [
    [actor, company, 'employee', true], [recipient, company, 'employee', true], [third, company, 'employee', true],
    [foreign, other, 'employee', true], [inactive, company, 'employee', false], [legacy, company, 'employee', null],
    [boss, company, 'boss', true], [manager, company, 'manager', true], [admin, company, 'admin', true],
    [support, company, 'support_agent', true],
  ]) await db.query("INSERT INTO users VALUES($1,$2,$3,$4,'Synthetic','User')", [id, c, role, active]);
});
after(async () => {
  await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
  await db?.close(); assert.equal(providerCalls, 0); assert.equal(activeClients, 0);
});

test('auth and the real subscription gate reject invalid or inactive actors before creation', async () => {
  for (const make of [direct, group]) {
    for (const options of [{actor: null}, {token: 'invalid'}, {token: token(actor, {purpose: 'password-reset'})},
      {token: jwt.sign({id: actor}, process.env.JWT_SECRET, {expiresIn: -1})}, {actor: inactive}, {actor: missing}]) {
      assert.equal((await make(options)).status, 401);
    }
  }
  await assertEmpty();
});

test('direct creation keeps deterministic ID/response, ignores spoofed userId1, and reuses without writes', async () => {
  const created = await post('direct', {userId1: foreign, userId2: recipient});
  assert.deepEqual(created, {status: 200, data: {success: true, roomId: pair()}});
  assert.deepEqual(await members(pair()), [actor, recipient].sort());
  const before = await db.query('SELECT * FROM chat_room_members ORDER BY user_id');
  assert.deepEqual(await direct({actor: recipient}, actor), created);
  assert.deepEqual((await db.query('SELECT * FROM chat_room_members ORDER BY user_id')).rows, before.rows);
  assert.equal(await count('chat_rooms'), 1);
});

test('membership write failure rolls back the direct room and a later explicit request can succeed', async () => {
  failMembership = true;
  assert.equal((await direct()).status, 500);
  await assertEmpty();
  assert.equal((await direct()).status, 200);
  assert.deepEqual(await members(pair()), [actor, recipient].sort());
});

test('a failed group membership write rolls back every row, and duplicate members remain deduplicated', async () => {
  failMembership = true;
  assert.equal((await group()).status, 500); await assertEmpty();
  const result = await post('group', {name: ' Synthetic team ', creatorId: foreign, memberIds: [recipient, actor, recipient, third]});
  assert.equal(result.status, 200); assert.deepEqual(Object.keys(result.data).sort(), ['roomId', 'success']);
  assert.match(result.data.roomId, /^group-/);
  assert.deepEqual(await members(result.data.roomId), [actor, recipient, third].sort());
  const room = (await db.query('SELECT * FROM chat_rooms')).rows[0];
  assert.equal(room.name, 'Synthetic team'); assert.equal(room.created_by, actor); assert.equal(room.company_id, company);
});

test('existing deterministic IDs fail closed for foreign, group, orphan, extra, removed, and mismatched members', async () => {
  for (const options of [{c: other}, {group: true}, {group: null}, {users: []}, {users: [actor]},
    {users: [recipient]}, {users: [actor, recipient, third]}, {users: [actor, third]}]) {
    await db.exec('TRUNCATE chat_room_members, chat_rooms CASCADE'); await seedRoom(options);
    const before = await db.query('SELECT * FROM chat_rooms');
    const originalMembers = await members(pair());
    const response = await direct({claims: {role: 'admin'}});
    assert.equal(response.status, 409, JSON.stringify(options));
    assert.equal(response.data.roomId, undefined);
    assert.deepEqual((await db.query('SELECT * FROM chat_rooms')).rows, before.rows);
    assert.deepEqual(await members(pair()), originalMembers, 'must never repair or regrant membership');
  }
});

test('inactive, foreign, missing, or unassigned recipients cannot be added to direct/group rooms', async () => {
  for (const make of [direct, group]) {
    for (const user of [inactive, foreign, missing]) {
      const result = make === direct ? await make({}, user) : await make({}, [user]);
      assert.ok([403, 404].includes(result.status), `${make.name} ${user}: ${result.status}`);
    }
  }
  await db.query('UPDATE users SET company_id=null WHERE id=$1', [recipient]);
  assert.equal((await direct()).status, 403); assert.equal((await group()).status, 403); await assertEmpty();
});

test('isolated routes also enforce active database actors while null-active legacy accounts remain eligible', async () => {
  for (const make of [direct, group]) {
    for (const id of [inactive, missing]) {
      const result = await make({actor: id, isolated: true});
      assert.ok([403, 404].includes(result.status));
    }
  }
  await assertEmpty();
  assert.equal((await direct({}, legacy)).status, 200);
  assert.equal((await group({actor: legacy})).status, 200);
});

test('normal and elevated DB roles have identical creation grants, stale role claims add no other members', async () => {
  for (const id of [actor, boss, manager, admin, support]) {
    const created = await group({actor: id, claims: {role: 'boss'}});
    assert.equal(created.status, 200);
    assert.deepEqual(await members(created.data.roomId), [id, recipient].sort());
  }
  assert.equal((await group({actor: boss}, [foreign])).status, 403);
});

test('valid tokens cannot reuse a legacy room after both users move companies', async () => {
  await seedRoom();
  await db.query('UPDATE users SET company_id=$1 WHERE id=ANY($2::uuid[])', [other, [actor, recipient]]);
  assert.equal((await direct({claims: {companyId: company}})).status, 401);
  assert.equal((await direct()).status, 409);
  assert.equal((await direct({isolated: true, claims: {companyId: company}})).status, 403);
  assert.equal((await db.query('SELECT company_id FROM chat_rooms')).rows[0].company_id, company);
});

test('eligibility changed before checkout is rechecked inside direct and group transactions', async () => {
  for (const make of [direct, group]) for (const [field, value, id] of [['is_active', false, recipient], ['company_id', other, recipient],
    ['is_active', false, actor], ['company_id', other, actor]]) {
    await db.query('UPDATE users SET company_id=$1,is_active=true WHERE id=ANY($2::uuid[])', [company, [actor, recipient]]);
    beforeConnect = () => db.query(`UPDATE users SET ${field}=$1 WHERE id=$2`, [value, id]);
    const result = await make();
    assert.equal(result.status, 403, `${make.name}/${field}/${id}`); await assertEmpty();
  }
});

test('moving both users after the app gate cannot create in an unchecked new tenant', async () => {
  for (const make of [direct, group]) {
    await db.query('UPDATE users SET company_id=$1 WHERE id=ANY($2::uuid[])', [company, [actor, recipient]]);
    beforeConnect = () => db.query('UPDATE users SET company_id=$1 WHERE id=ANY($2::uuid[])', [other, [actor, recipient]]);
    assert.equal((await make()).status, 403); await assertEmpty();
  }
});

test('malformed direct/group inputs are rejected as 400 before opening any transaction', async () => {
  for (const userId2 of [null, false, 12, {}, [], 'nope', '', actor, actor.toUpperCase(), ' '+recipient]) {
    trace = [];
    assert.equal((await post('direct', {userId2})).status, 400, JSON.stringify(userId2));
    assert.ok(!trace.some(x => x.client));
  }
  for (const body of [{}, {name: {}, memberIds: [recipient]}, {name: 'x', memberIds: 'bad'},
    {name: 'x', memberIds: []}, {name: ' '.repeat(3), memberIds: [recipient]},
    {name: 'x'.repeat(101), memberIds: [recipient]}, {name: 'bad\0name', memberIds: [recipient]}, {name: 'x', memberIds: [null]},
    {name: 'x', memberIds: [{}]}, {name: 'x', memberIds: [recipient, 'nope']},
    {name: 'x', memberIds: Array(101).fill(recipient)}]) {
    trace = [];
    assert.equal((await post('group', body)).status, 400, JSON.stringify(body));
    assert.ok(!trace.some(x => x.client));
  }
  await assertEmpty();
});

test('UUID case aliases cannot create distinct direct rooms or duplicate group members', async () => {
  assert.equal((await direct({}, recipient.toUpperCase())).data.roomId, pair());
  assert.equal((await direct()).data.roomId, pair());
  assert.equal(await count('chat_rooms'), 1);
  const created = await group({}, [recipient, recipient.toUpperCase()]);
  assert.equal(created.status, 200); assert.deepEqual(await members(created.data.roomId), [actor, recipient].sort());
});

test('overlapping reversed direct requests share one fully populated room (serialized-client simulation)', async () => {
  simultaneousLegacyRoomReads = {count: 0};
  simultaneousLegacyRoomReads.ready = new Promise(resolve => { simultaneousLegacyRoomReads.release = resolve; });
  const results = await Promise.all([direct(), direct({actor: recipient}, actor)]);
  for (const result of results) assert.deepEqual(result, {status: 200, data: {success: true, roomId: pair()}});
  assert.equal(await count('chat_rooms'), 1); assert.deepEqual(await members(pair()), [actor, recipient].sort());
});

test('transaction trace locks all participants in stable order before writes and protects reused membership', async () => {
  for (const make of [direct, group]) {
    trace = []; assert.equal((await make()).status, 200);
    const transaction = trace.filter(x => x.client);
    assert.equal(transaction[0]?.sql, 'BEGIN'); assert.equal(transaction.at(-1)?.sql, 'COMMIT');
    assert.ok(transaction.some(x => /SET LOCAL lock_timeout/.test(x.sql)));
    assert.ok(transaction.some(x => /SET LOCAL statement_timeout/.test(x.sql)));
    const lock = transaction.findIndex(x => /FROM users/.test(x.sql) && /ORDER BY id\s+FOR UPDATE/.test(x.sql));
    const write = transaction.findIndex(x => /INSERT INTO chat_rooms/.test(x.sql));
    assert.ok(lock >= 0 && lock < write, 'all current users must be locked before writes');
    assert.deepEqual(transaction[lock].args, [[actor, recipient].sort()]);
    assert.ok(!trace.some(x => !x.client && /INSERT INTO chat_/.test(x.sql)));
  }
  trace = []; assert.equal((await direct()).status, 200);
  assert.ok(trace.some(x => /FROM chat_rooms/.test(x.sql) && /FOR UPDATE/.test(x.sql)));
  assert.ok(trace.some(x => /FROM chat_room_members/.test(x.sql) && /FOR UPDATE/.test(x.sql)));
});

test('SQL lock failures roll back, release the client and perform no internal retry', async () => {
  for (const make of [direct, group]) {
    trace = []; poolFault = sql => /FROM users/.test(sql) && /FOR UPDATE/.test(sql);
    assert.equal((await make()).status, 503);
    poolFault = undefined;
    assert.equal(trace.filter(x => x.sql === 'BEGIN').length, 1);
    assert.equal(trace.filter(x => x.sql === 'ROLLBACK').length, 1);
    assert.equal(activeClients, 0); await assertEmpty();
  }
});

test('group creation intentionally has no durable retry identity', async () => {
  const first = await group(); const second = await group();
  assert.equal(first.status, 200); assert.equal(second.status, 200);
  assert.notEqual(first.data.roomId, second.data.roomId); assert.equal(await count('chat_rooms'), 2);
});


test('reversed and overlapping participant sets use exactly sorted canonical UUID locks', async () => {
  for (const [make, expected] of [
    [() => direct({actor: recipient}, actor), [actor, recipient]],
    [() => group({actor: third}, [recipient.toUpperCase(), actor, recipient, third]), [actor, recipient, third]],
  ]) {
    trace = []; assert.equal((await make()).status, 200);
    const lock = trace.find(x => /FROM users/.test(x.sql) && /ORDER BY id\s+FOR UPDATE/.test(x.sql));
    assert.deepEqual(lock.args, [expected.sort()]);
  }
});

test('a simulated unique-key winner is validated, never overwritten or granted memberships', async () => {
  for (const fixture of [{}, {c: other}, {users: [actor]}]) {
    await db.exec('TRUNCATE chat_room_members, chat_rooms CASCADE');
    conflictRoom = fixture;
    const result = await direct();
    assert.equal(result.status, fixture.c || fixture.users ? 409 : 200);
    if (result.status === 409) assert.equal(result.data.roomId, undefined);
    // The injected winner is part of this test connection, so rollback removes
    // it too. Real committed competing rows would remain untouched.
    assert.ok(!trace.some(x => /UPDATE chat_rooms|DELETE FROM chat_room_members/.test(x.sql)));
  }
});

test('connection acquisition and BEGIN failures do not create data or leak checked-out clients', async () => {
  for (const make of [direct, group]) {
    beforeConnect = () => { throw Error('Synthetic checkout failure'); };
    trace = []; assert.equal((await make()).status, 500);
    assert.ok(!trace.some(x => x.client)); assert.equal(activeClients, 0); await assertEmpty();
    phaseFailure = 'BEGIN'; trace = [];
    assert.equal((await make()).status, 500); phaseFailure = undefined;
    assert.equal(activeClients, 0); await assertEmpty();
    assert.equal(trace.filter(x => x.sql === 'BEGIN').length, 1);
  }
});

test('failure before COMMIT rolls back, discards the uncertain client, and does not retry', async () => {
  for (const make of [direct, group]) {
    phaseFailure = 'COMMIT'; trace = []; releasedClients = [];
    assert.equal((await make()).status, 500); phaseFailure = undefined;
    await assertEmpty(); assert.deepEqual(releasedClients, [true]);
    assert.equal(trace.filter(x => x.sql === 'COMMIT').length, 1);
    assert.equal(trace.filter(x => x.sql === 'BEGIN').length, 1);
  }
});

test('lost COMMIT acknowledgment is an unknown outcome: persist once, discard, never auto-retry', async () => {
  for (const make of [direct, group]) {
    await db.exec('TRUNCATE chat_room_members, chat_rooms CASCADE');
    phaseFailure = 'lost-commit'; trace = []; releasedClients = [];
    const result = await make(); phaseFailure = undefined;
    assert.equal(result.status, 500); assert.equal(result.data.roomId, undefined);
    assert.equal(await count('chat_rooms'), 1); assert.equal(await count('chat_room_members'), 2);
    assert.deepEqual(releasedClients, [true]);
    assert.equal(trace.filter(x => x.sql === 'COMMIT').length, 1);
    assert.equal(trace.filter(x => x.sql === 'BEGIN').length, 1);
  }
});

test('rollback failure discards the connection without hiding the original failure or retrying', async () => {
  for (const make of [direct, group]) {
    phaseFailure = 'lost-rollback'; failMembership = true; trace = []; releasedClients = [];
    assert.equal((await make()).status, 500); phaseFailure = undefined;
    assert.deepEqual(releasedClients, [true]); await assertEmpty();
    assert.equal(trace.filter(x => x.sql === 'BEGIN').length, 1);
    assert.equal(activeClients, 0);
  }
});
