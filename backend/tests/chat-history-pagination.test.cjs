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
const root = process.env.CHAT_HISTORY_SOURCE_ROOT || path.resolve(__dirname, '..');
process.env.JWT_SECRET = 'isolated-chat-history-test';
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
  process.env.COMPLIMENTARY_TESTER_IDENTITY = '';
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
    CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,role text,is_active boolean DEFAULT true,must_change_password boolean DEFAULT false,first_name text,last_name text,profile_pic text);
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

const cursor = id => Buffer.from(JSON.stringify({v: 1, id})).toString('base64url');
const ids = messages => messages.map(message => message.id);
async function history(alias, query = '', actor = member, room = 'private-direct', options) {
  const response = await request(`/${alias}/${room}${query}`, actor, options);
  return {status: response.status, data: await response.json()};
}
async function populate(size) {
  await db.exec('DELETE FROM chat_messages');
  await db.query(`INSERT INTO chat_messages(id,company_id,sender_id,room_id,message,attachment_id,created_at)
    SELECT ('00000000-0000-4000-a000-' || lpad(n::text,12,'0'))::uuid,$1,$2,'private-direct',
      'Synthetic ' || n, $3, '2026-03-01T00:00:00Z'::timestamptz + n * interval '1 second'
    FROM generate_series(1,$4::int) AS n`, [company, sender, attachment, size]);
}
async function collect(alias, query = '?limit=200') {
  let messages = [], page, count = 0;
  do {
    page = await history(alias, query);
    assert.equal(page.status, 200);
    assert.equal(typeof page.data.hasMore, 'boolean');
    assert.ok(++count <= 500, 'pagination must terminate');
    messages = page.data.messages.concat(messages);
    assert.equal(new Set(ids(messages)).size, messages.length, 'no duplicates between pages');
    if (page.data.hasMore) {
      assert.ok(page.data.messages.length > 0);
      assert.equal(page.data.nextCursor, cursor(page.data.messages[0].id));
      query = `?limit=${new URLSearchParams(query.slice(1)).get('limit') || 200}&before=${page.data.nextCursor}`;
    } else assert.equal(page.data.nextCursor, null);
  } while (page.data.hasMore);
  return messages;
}
for (const alias of ['room', 'messages']) {
  for (const size of [0, 1, 199, 200, 201, 450]) {
    test(`${alias}: legacy latest-200 shape and pagination exhaust all ${size} rows`, async () => {
      await populate(size);
      const legacyResult = await history(alias);
      assert.equal(legacyResult.status, 200);
      assert.deepEqual(Object.keys(legacyResult.data).sort(), ['messages', 'success']);
      assert.deepEqual(ids(legacyResult.data.messages), Array.from({length: Math.min(200, size)}, (_, i) => uid(Math.max(0, size-200)+i+1)));
      const all = await collect(alias);
      assert.deepEqual(ids(all), Array.from({length: size}, (_, i) => uid(i+1)));
      assert.ok(all.every(row => row.sender_name === 'Synthetic Sender' && row.attachment_name === 'synthetic-private.pdf'));
    });
  }

  test(`${alias}: limits 1, 3, 199, 200 and before-only requests use a sentinel without dropping the boundary`, async () => {
    await populate(201);
    for (const limit of [1, 3, 199, 200]) {
      const page = await history(alias, `?limit=${limit}`);
      assert.equal(page.status, 200);
      assert.equal(page.data.messages.length, limit);
      assert.equal(page.data.hasMore, true);
      const rest = await history(alias, `?before=${page.data.nextCursor}`);
      assert.equal(rest.status, 200);
      assert.equal(rest.data.messages.length, 201-limit);
      assert.equal(rest.data.nextCursor, null);
      assert.deepEqual(ids(rest.data.messages.concat(page.data.messages)), Array.from({length:201}, (_,i)=>uid(i+1)));
    }
    const exhausted = await history(alias, `?limit=1&before=${cursor(uid(1))}`);
    assert.deepEqual(exhausted.data, {success:true,messages:[],hasMore:false,nextCursor:null});
  });

  test(`${alias}: tied timestamps, sub-millisecond order and null-first legacy timestamps traverse exactly once`, async () => {
    await populate(0);
    const stamps = [null, '2026-03-01T00:00:00.000002Z', '2026-03-01T00:00:00.000001Z',
      '2026-03-01T00:00:00.000002Z', null, '2025-12-31T23:59:59.999999Z', null];
    for (let i=0;i<stamps.length;i++) await db.query(`INSERT INTO chat_messages(id,company_id,sender_id,room_id,message,created_at)
      VALUES($1,$2,$3,'private-direct','Synthetic precision',$4)`, [uid(100+i),company,sender,stamps[i]]);
    const expected = ids((await db.query('SELECT id FROM chat_messages ORDER BY created_at ASC NULLS LAST,id ASC')).rows);
    for (const limit of [1,2,3,4,200]) assert.deepEqual(ids(await collect(alias, `?limit=${limit}`)),expected);
    assert.deepEqual(ids((await history(alias)).data.messages), expected);
  });

  test(`${alias}: newer arrivals do not shift older pages and reconnect can walk a 450-row gap`, async () => {
    await populate(201);
    const retained = await history(alias, '?limit=200');
    await db.query(`INSERT INTO chat_messages(id,company_id,sender_id,room_id,message,created_at)
      SELECT ('00000000-0000-4000-a000-' || lpad(n::text,12,'0'))::uuid,$1,$2,'private-direct',
      'Synthetic reconnect ' || n, '2026-03-01T00:00:00Z'::timestamptz + n * interval '1 second'
      FROM generate_series(202,651) AS n`, [company,sender]);
    const older = await history(alias, '?before='+retained.data.nextCursor);
    assert.deepEqual(ids(older.data.messages),[uid(1)]);
    let next='', merged=retained.data.messages, pages=0, reached=false;
    const retainedIds = new Set(ids(merged));
    do {
      const fresh = await history(alias, '?limit=200'+(next?'&before='+next:''));
      assert.equal(fresh.status,200);
      reached = fresh.data.messages.some(row => retainedIds.has(row.id));
      merged = [...new Map(merged.concat(fresh.data.messages).map(row=>[row.id,row])).values()];
      next=fresh.data.nextCursor;pages++;
      assert.ok(pages<5);
    } while(!reached && next);
    assert.equal(pages,3);assert.equal(reached,true);
    assert.equal(new Set(ids(merged)).size,650);
    assert.ok(ids(merged).includes(uid(202)) && ids(merged).includes(uid(651)));
  });

  test(`${alias}: missing/deleted/other-room/company anchors have one non-disclosing invalid-cursor response`, async () => {
    const missingResult = await history(alias,'?before='+cursor(uid(9999)));
    assert.equal(missingResult.status,400);assert.equal(missingResult.data.code,'CHAT_CURSOR_INVALID');
    assert.equal(missingResult.data.refreshRequired,true);
    for (const id of [uid(101),uid(107)]) assert.deepEqual((await history(alias,'?before='+cursor(id))).data,missingResult.data);
    await db.query('UPDATE chat_messages SET company_id=$1 WHERE id=$2',[other,uid(100)]);
    assert.deepEqual((await history(alias,'?before='+cursor(uid(100)))).data,missingResult.data);
    await populate(3);
    const page = await history(alias,'?limit=1');
    await db.query('DELETE FROM chat_messages WHERE id=$1',[page.data.messages[0].id]);
    assert.deepEqual((await history(alias,'?before='+page.data.nextCursor)).data,missingResult.data);
    assert.equal((await history(alias,'?limit=1')).status,200,'explicit latest refresh remains possible');
  });

  test(`${alias}: query validation rejects repeated, unknown, nested, oversized and malformed inputs before reading messages`, async () => {
    const valid = cursor(uid(100));
    const invalidQueries = ['?limit=0','?limit=201','?limit=-1','?limit=01','?limit=1.0','?limit=1e2','?limit=',
      '?limit=1&limit=2','?limit[]=1','?limit[x]=1','?offset=1','?__proto__[limit]=1',
      '?before=','?before=x','?before='+valid+'&before='+valid,'?before[]='+valid,
      '?before='+valid+'=','?before='+Buffer.from(JSON.stringify({v:2,id:uid(100)})).toString('base64url'),
      '?before='+Buffer.from(JSON.stringify({v:1,id:uid(100),extra:true})).toString('base64url'),
      '?before='+('a'.repeat(129)), '?limit='+('1'.repeat(1000)), '?limit=1'+('&'.repeat(1100))];
    for(const query of invalidQueries) {
      const result=await history(alias,query);
      assert.equal(result.status,400,query.slice(0,120));assert.equal(result.data.messages,undefined);
    }
    assert.equal(historyReads,0);
  });

  test(`${alias}: active member, tenant and support role authorization is current at the SELECT`, async () => {
    for (const change of [
      () => db.query('DELETE FROM chat_room_members WHERE user_id=$1',[member]),
      () => db.query('UPDATE users SET is_active=false WHERE id=$1',[member]),
      () => db.query('UPDATE companies SET is_active=false WHERE id=$1',[company]),
      () => db.query('UPDATE chat_rooms SET company_id=$1 WHERE id=$2',[other,'private-direct']),
      async () => {
        await db.query('UPDATE users SET company_id=$1 WHERE id=$2',[other,member]);
        await db.query('UPDATE chat_rooms SET company_id=$1 WHERE id=$2',[other,'private-direct']);
        await db.query('UPDATE chat_messages SET company_id=$1 WHERE room_id=$2',[other,'private-direct']);
      },
    ]) {
      await seed();beforeHistoryRead=change;
      const result=await history(alias,'?limit=200',member,'private-direct',{claims:{companyId:company,role:'admin'}});
      assert.ok([401,403].includes(result.status));assert.equal(result.data.messages,undefined);
      assert.equal(historyReads,1);
    }
    // A pre-company-claim access token is still bound to the gate's initial company.
    await seed();beforeHistoryRead=async()=>{
      await db.query('UPDATE users SET company_id=$1 WHERE id=$2',[other,member]);
      await db.query('UPDATE chat_rooms SET company_id=$1 WHERE id=$2',[other,'private-direct']);
      await db.query('UPDATE chat_messages SET company_id=$1 WHERE room_id=$2',[other,'private-direct']);
    };
    assert.equal((await history(alias,'?limit=1')).status,401);
    for(const actor of [manager,admin,support]) {
      await seed();beforeHistoryRead=()=>db.query("UPDATE users SET role='employee' WHERE id=$1",[actor]);
      const result=await history(alias,'?limit=1',actor,supportRoom,{claims:{role:'admin'}});
      assert.equal(result.status,403);assert.equal(result.data.messages,undefined);
    }
  });

  test(`${alias}: entitlement, password and complimentary sponsor revocations are checked in the page statement`,async()=>{
    for(const [change,status] of [
      [()=>db.query("UPDATE companies SET subscription_status='canceled' WHERE id=$1",[company]),402],
      [()=>db.query("UPDATE companies SET subscription_current_period_end=now()-interval '1 second' WHERE id=$1",[company]),402],
      [()=>db.query('UPDATE users SET must_change_password=true WHERE id=$1',[member]),403],
      ...['infinity','-infinity','294276-01-01T00:00:00Z','275760-09-13T00:00:00.001Z'].map(end =>
        [()=>db.query('UPDATE companies SET subscription_current_period_end=$1 WHERE id=$2',[end,company]),402]),
    ]) {
      await seed();beforeHistoryRead=change;
      const result=await history(alias,'?limit=200');assert.equal(result.status,status);assert.equal(result.data.messages,undefined);
    }
    for(const change of [()=>db.query('UPDATE users SET is_active=false WHERE id=$1',[boss]),
      ()=>db.query("UPDATE users SET role='employee' WHERE id=$1",[boss]),
      ()=>db.query('UPDATE users SET company_id=$1 WHERE id=$2',[other,boss])]) {
      await seed();process.env.COMPLIMENTARY_TESTER_IDENTITY=`${boss}:${company}`;
      await db.query("UPDATE companies SET subscription_status='canceled' WHERE id=$1",[company]);
      assert.equal((await history(alias,'?limit=1')).status,200);
      beforeHistoryRead=change;
      const result=await history(alias,'?limit=1');assert.equal(result.status,402);assert.equal(result.data.messages,undefined);
    }
  });

  test(`${alias}: ordinary-room elevated roles are not members, and support authorization preserves the HTTP matrix`,async()=>{
    for(const actor of [outsider,boss,manager,admin,support,foreign]) assert.equal((await history(alias,'?limit=1',actor)).status,403);
    for(const actor of [member,boss,manager,admin,support]) {
      const result=await history(alias,'?limit=1',actor,supportRoom);assert.equal(result.status,200);
      assert.deepEqual(ids(result.data.messages),[uid(102)]);
    }
    for(const actor of [outsider,foreign]) assert.equal((await history(alias,'?limit=1',actor,supportRoom)).status,403);
    await db.query("UPDATE users SET role='manager' WHERE id=$1",[foreign]);
    assert.equal((await history(alias,'?limit=1',foreign,supportRoom)).status,403);
    await db.query("UPDATE users SET role='ADMIN' WHERE id=$1",[admin]);
    assert.equal((await history(alias,'?limit=1',admin,supportRoom)).status,403,'retain case-sensitive HTTP role semantics');
    // Ticket ownership, not tenant equality, grants the existing owner exception.
    await db.query('UPDATE support_tickets SET user_id=$1 WHERE id=$2',[foreign,ticket]);
    assert.equal((await history(alias,'?limit=1',foreign,supportRoom)).status,200);
    // HTTP chat does not inherit the socket support subscription/password exceptions.
    await db.query("UPDATE companies SET subscription_status='canceled' WHERE id=$1",[other]);
    assert.equal((await history(alias,'?limit=1',foreign,supportRoom)).status,402);
  });

  test(`${alias}: attachments, other-company message contamination and sentinel rows never leak metadata`,async()=>{
    await db.query('UPDATE chat_messages SET attachment_id=$1 WHERE id IN ($2,$3)',[attachment,uid(101),uid(107)]);
    const group=await history(alias,'?limit=1',member,'private-group');
    assert.equal(group.status,200);assert.equal(group.data.messages[0].attachment_name,null);
    assert.equal(group.data.messages[0].attachment_type,null);assert.equal(group.data.messages[0].attachment_size,null);
    const foreignResult=await history(alias,'?limit=1',foreign,'foreign-room');
    assert.equal(foreignResult.data.messages[0].attachment_name,null);
    await db.query(`INSERT INTO chat_messages(id,company_id,sender_id,room_id,message,created_at)
      VALUES($1,$2,$3,'private-direct','FOREIGN SECRET',now())`,[uid(999),other,foreign]);
    const page=await history(alias,'?limit=1');assert.deepEqual(ids(page.data.messages),[uid(100)]);
    assert.equal(page.data.hasMore,false);assert.equal(page.data.nextCursor,null);
    assert.equal(storageReads,0);assert.equal(providerCalls,0);
  });
}

test('both aliases accept each other\'s cursors and authentication fails before history reads', async()=>{
  await populate(3);
  const first=await history('room','?limit=1');
  const next=await history('messages','?before='+first.data.nextCursor);
  assert.deepEqual(ids(next.data.messages),[uid(1),uid(2)]);
  historyReads=0;
  for(const alias of ['room','messages'])for(const options of [{token:'invalid'},
    {token:jwt.sign({id:member},process.env.JWT_SECRET,{expiresIn:-1})},
    {token:token(member,{purpose:'password-reset'})}, {token:token(member,{companyId:other})}]){
    const result=await history(alias,'?limit=1',member,'private-direct',options);assert.equal(result.status,401);
  }
  assert.equal(historyReads,0);
});


test('entitlement SQL matches the current HTTP helper at legacy, trial, expiry and JS date boundaries', async()=>{
  const {loadSubscriptionActor,hasCompanyEntitlement}=load('middleware/trialMiddleware.ts');
  for(const [status,end] of [['active',null],['trialing',null],['inactive',null],['ACTIVE',null],
    ['trialing','2099-01-01T00:00:00Z'],['active','2020-01-01T00:00:00Z'],
    ['active','infinity'],['active','-infinity'],['active','294276-01-01T00:00:00Z'],
    ['active','275760-09-13T00:00:00Z'],['active','275760-09-13T00:00:00.000001Z'],
    ['active','275760-09-13T00:00:00.001Z']]) {
    await db.query('UPDATE companies SET subscription_status=$1,subscription_current_period_end=$2 WHERE id=$3',[status,end,company]);
    const entitled=hasCompanyEntitlement(await loadSubscriptionActor(member));
    // Isolate the history handler to compare its statement with the actual gate helper.
    for(const alias of ['room','messages']){
      const result=await history(alias,'?limit=1',member,'private-direct',{isolated:true});
      assert.equal(result.status,entitled?200:402,JSON.stringify({status,end,entitled}));
    }
  }
});

test('support ticket ownership/company changes and deletion are rechecked without exposing history',async()=>{
  for(const alias of ['room','messages'])for(const [actor,change] of [
    [member,()=>db.query('UPDATE support_tickets SET user_id=$1 WHERE id=$2',[outsider,ticket])],
    [manager,()=>db.query('UPDATE support_tickets SET company_id=$1 WHERE id=$2',[other,ticket])],
    [admin,()=>db.query('DELETE FROM support_tickets WHERE id=$1',[ticket])],
  ]){
    await seed();beforeHistoryRead=change;
    const result=await history(alias,'?limit=1',actor,supportRoom);
    assert.equal(result.status,403);assert.equal(result.data.messages,undefined);
  }
});

test('legacy null-active users and memberships remain valid; duplicate memberships never duplicate messages',async()=>{
  await db.query("INSERT INTO chat_room_members VALUES('private-direct',$1)",[member]);
  for(const alias of ['room','messages']){
    assert.deepEqual(ids((await history(alias,'?limit=1',legacy)).data.messages),[uid(100)]);
    const page=await history(alias,'?limit=1');
    assert.deepEqual(ids(page.data.messages),[uid(100)]);assert.equal(page.data.hasMore,false);
    assert.equal((await history(alias,'?limit=1',inactive)).status,401);
    assert.equal((await history(alias,'?limit=1',missing)).status,401);
  }
});


test('no-query legacy requests share the same final membership, identity and entitlement fences',async()=>{
  for(const alias of ['room','messages'])for(const [change,status] of [
    [()=>db.query('DELETE FROM chat_room_members WHERE user_id=$1',[member]),403],
    [()=>db.query('UPDATE users SET is_active=false WHERE id=$1',[member]),401],
    [()=>db.query("UPDATE companies SET subscription_status='canceled' WHERE id=$1",[company]),402],
  ]) {
    await seed();beforeHistoryRead=change;
    const result=await history(alias);assert.equal(result.status,status);assert.equal(result.data.messages,undefined);
  }
});

test('legacy expiry fallback, current expiry precedence and complimentary password rules match the gate',async()=>{
  for(const alias of ['room','messages']) {
    await seed();
    await db.query("UPDATE companies SET subscription_expires_at='2020-01-01' WHERE id=$1",[company]);
    assert.equal((await history(alias,'?limit=1',member,'private-direct',{isolated:true})).status,402);
    await db.query("UPDATE companies SET subscription_current_period_end='2099-01-01' WHERE id=$1",[company]);
    assert.equal((await history(alias,'?limit=1',member,'private-direct',{isolated:true})).status,200);
    await db.query("UPDATE companies SET subscription_status='canceled' WHERE id=$1",[company]);
    await db.query("UPDATE users SET role='OWNER' WHERE id=$1",[boss]);
    process.env.COMPLIMENTARY_TESTER_IDENTITY=`${boss}:${company}`;
    assert.equal((await history(alias,'?limit=1')).status,200);
    beforeHistoryRead=()=>db.query('UPDATE users SET must_change_password=true WHERE id=$1',[member]);
    const denied=await history(alias,'?limit=1');assert.equal(denied.status,403);assert.equal(denied.data.code,'PASSWORD_CHANGE_REQUIRED');
  }
});
