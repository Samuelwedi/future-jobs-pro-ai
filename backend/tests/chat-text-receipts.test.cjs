'use strict';
// Source-only HTTP and real local Socket.IO tests. PGlite is single-session:
// this synthetic pool serializes transactions AND autocommit queries. Overlap
// tests prove API retry behavior, not multi-session PostgreSQL lock semantics.
const {test, before, beforeEach, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const ts = require('typescript');
const express = require('express');
const jwt = require('jsonwebtoken');
const {Server} = require('socket.io');
const {PGlite} = require('@electric-sql/pglite');
const root = path.resolve(__dirname, '..');
const uid = n => `00000000-0000-4000-a000-${String(n).padStart(12,'0')}`;
const [company,other,alice,bob,eve,mallory,sponsor] = Array.from({length:7},(_,i)=>uid(i+1));
const secret = 'synthetic-text-receipt-tests';
process.env.JWT_SECRET=secret;
process.env.COMPLIMENTARY_TESTER_IDENTITY='';
let db,server,io,url,services,cache,queue=Promise.resolve(),trace=[],released=[],held=0;
let beforeConnect,afterQuery,fault,stop=false,providerCalls=0,rejectNested=false;
const sockets=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function eventually(fn) { for(let i=0;i<1000;i++) {if(await fn()) return;await sleep(5);} assert.fail('Local handler timed out'); }
async function lock() {const previous=queue;let release;queue=new Promise(r=>release=r);await previous;return release;}
async function query(sql,args,client) {
  trace.push({sql,args,client});
  if(fault && fault(sql)) throw Object.assign(Error('Injected SQL failure'),{code:'55P03'});
  const result=await db.query(sql,args);
  if(afterQuery) await afterQuery(sql,args);
  return {rows:result.rows,rowCount:result.rows.length||result.affectedRows||0};
}
const pool={
  async query(sql,args) {if(rejectNested)assert.equal(held,0,'No pool query while the only client is checked out');const unlock=await lock();try{return await query(sql,args,false);}finally{unlock();}},
  async connect() {
    const unlock=await lock();
    const hook=beforeConnect;beforeConnect=undefined;if(hook) {try {await hook();} catch(error) {unlock();throw error;}}
    held++;let done=false;
    return {query:(sql,args)=>query(sql,args,true),release(discard){assert(!done);done=true;held--;released.push(Boolean(discard));unlock();}};
  },
};
function load(relative) {
  if(cache.has(relative)) return cache.get(relative).exports;
  const filename=path.join(root,'src',relative),module={exports:{}};cache.set(relative,module);
  const js=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
  function scopedRequire(spec) {
    if(spec.endsWith('/config/database'))return{pool};
    if(spec.endsWith('/services/chatStorage'))return new Proxy({}, {get:()=>()=>{providerCalls++;throw Error('Provider forbidden');}});
    if(spec==='cloudinary')return {v2:{uploader:{upload_stream(){providerCalls++;throw Error('Provider forbidden');}}}};
    if(spec.startsWith('.'))return load(path.relative(path.join(root,'src'),path.resolve(path.dirname(filename),spec+'.ts')));
    assert(['express','multer','jsonwebtoken','node:crypto','node:stream','node:stream/promises','node:path'].includes(spec),spec);
    return require(spec);
  }
  vm.runInThisContext(`(function(require,module,exports){${js}\n})`,{filename})(scopedRequire,module,module.exports);
  return module.exports;
}
const token=(id=alice,claims={companyId:company})=>jwt.sign({id,...claims},secret,{expiresIn:'1h'});
function body(key='request-0001',message=' Hello ',roomId='direct') {return{roomId,message,requestKey:key,expectedCompanyId:company,expectedActorId:alice};}
async function post(input=body(),accessToken=token(),route='/message-requests',base=url) {
  const r=await fetch(base+'/api/chat'+route,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+accessToken},body:JSON.stringify(input)});
  return {status:r.status,data:await r.json()};
}
async function status(key='request-0001',room='direct',accessToken=token(),c=company,expectedActor=alice) {
  const r=await fetch(url+`/api/chat/room/${encodeURIComponent(room)}/requests/${encodeURIComponent(key)}?expectedCompanyId=${c}&expectedActorId=${expectedActor}`,{headers:{Authorization:'Bearer '+accessToken}});
  assert.equal(r.headers.get('cache-control'),'no-store');
  return {status:r.status,data:await r.json()};
}
async function count(table) {return (await db.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n;}
async function connect(accessToken=token(),base=url) {
  const ws=new WebSocket(base.replace('http:','ws:')+'/socket.io/?EIO=4&transport=websocket');
  const c={ws,events:[],packets:[],ack:0};sockets.push(c);
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{ws.close();reject(Error('Socket connection timed out'));},5000);
    ws.addEventListener('message',event=>{
      const p=String(event.data);c.packets.push(p);
      if(p[0]==='0')ws.send('40'+JSON.stringify({token:accessToken}));
      else if(p==='2')ws.send('3');
      else if(p.startsWith('40')){c.id=JSON.parse(p.slice(2)).sid;clearTimeout(timer);resolve();}
      else if(p.startsWith('44')){clearTimeout(timer);reject(Error(JSON.parse(p.slice(2)).message));}
      else if(p.startsWith('42'))c.events.push(JSON.parse(p.slice(2)));
    });
    ws.addEventListener('error',()=>{clearTimeout(timer);reject(Error('Socket failed'));});
  });
  c.call=async(name,...args)=>{const ack=++c.ack;ws.send(`42${ack}`+JSON.stringify([name,...args]));await eventually(()=>c.packets.some(p=>p.startsWith(`43${ack}[`)));return JSON.parse(c.packets.find(p=>p.startsWith(`43${ack}[`)).slice(2+String(ack).length))[0];};
  c.emit=(name,...args)=>ws.send('42'+JSON.stringify([name,...args]));
  c.join=room=>c.call('join-room',room);
  return c;
}
before(async()=>{
  db=new PGlite();cache=new Map();
  await db.exec(`CREATE TABLE companies(id uuid PRIMARY KEY,is_active boolean DEFAULT true,subscription_status text DEFAULT 'active',subscription_tier text DEFAULT 'pro',subscription_provider text,subscription_current_period_end timestamptz,subscription_expires_at timestamptz);
    CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid REFERENCES companies(id),role text DEFAULT 'employee',first_name text DEFAULT 'Synthetic',last_name text DEFAULT 'Sender',is_active boolean DEFAULT true,must_change_password boolean DEFAULT false,profile_pic text DEFAULT 'https://example.invalid/avatar');
    CREATE TABLE chat_rooms(id text PRIMARY KEY,company_id uuid REFERENCES companies(id),is_group boolean DEFAULT false,updated_at timestamptz DEFAULT now());
    CREATE TABLE chat_room_members(room_id text REFERENCES chat_rooms(id) ON DELETE CASCADE,user_id uuid REFERENCES users(id),PRIMARY KEY(room_id,user_id));
    CREATE TABLE chat_attachments(id uuid PRIMARY KEY,room_id text,filename text,mime_type text,size_bytes integer);
    CREATE TABLE chat_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),sender_id uuid REFERENCES users(id),company_id uuid REFERENCES companies(id),message text,room_id text,attachment_id uuid,created_at timestamptz DEFAULT now());
    CREATE TABLE support_tickets(id text PRIMARY KEY,company_id uuid,user_id uuid);`);
  await require('../scripts/migrate-chat-text-requests.cjs').migrate(db);
  const trial=load('middleware/trialMiddleware.ts'),socketAuth=load('services/socketAuthorization.ts');
  services=load('services/chatTextReceipts.ts');
  const app=express();app.use(express.json());app.use('/api',trial.subscriptionGate);
  server=http.createServer(app);io=new Server(server);app.set('io',io);
  app.use('/api/chat',load('routes/chatRoutes.ts').default);
  const index=fs.readFileSync(path.join(root,'src/index.ts'),'utf8');
  const slice=index.slice(index.indexOf('const activeSocketWork'),index.indexOf('const reportWorker'))+'\n'+index.slice(index.indexOf('// Customer JWTs'),index.indexOf('// After creating io:'));
  const js=ts.transpileModule(slice,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(js,{io,jwt,JWT_SECRET:secret,pool,...trial,...socketAuth,...services,saveMessage:load('services/chatService.ts').saveMessage,shutdown:{isStopping:()=>stop},console:{log(){},error(){},warn(){}},process,Buffer});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));url=`http://127.0.0.1:${server.address().port}`;
});
beforeEach(async()=>{
  for(const c of sockets.splice(0))c.ws.close();await sleep(10);await queue;
  fault=beforeConnect=afterQuery=undefined;stop=false;rejectNested=false;trace=[];released=[];providerCalls=0;process.env.COMPLIMENTARY_TESTER_IDENTITY='';
  await db.exec(`TRUNCATE chat_text_requests,chat_messages,chat_attachments,chat_room_members,chat_rooms,support_tickets,users,companies CASCADE;
    INSERT INTO companies(id) VALUES('${company}'),('${other}');
    INSERT INTO users(id,company_id) VALUES('${alice}','${company}'),('${bob}','${company}'),('${eve}','${company}'),('${mallory}','${other}'),('${sponsor}','${company}');
    INSERT INTO chat_rooms(id,company_id,is_group) VALUES('direct','${company}',false),('group','${company}',true),('foreign','${other}',false);
    INSERT INTO chat_room_members VALUES('direct','${alice}'),('direct','${bob}'),('group','${alice}'),('group','${bob}'),('foreign','${mallory}');
    INSERT INTO support_tickets VALUES('ticket1','${company}','${alice}');`);
});
after(async()=>{for(const c of sockets)c.ws.close();if(io)await new Promise(resolve=>io.close(resolve));if(db)await db.close();});

test('new, sequential replay and status retain full private identity and public message shape',async()=>{
  const sent=await post();assert.equal(sent.status,200);
  assert.deepEqual(sent.data.request,{key:'request-0001',actorId:alice,companyId:company,roomId:'direct',state:'saved',replayed:false});
  assert.equal(sent.data.message.message,'Hello');assert.equal(sent.data.message.sender_name,'Synthetic Sender');
  assert.equal(sent.data.message.sender_avatar,'https://example.invalid/avatar');assert.equal(sent.data.message.attachment_name,null);
  const replay=await post(body('request-0001','Hello'));
  assert.equal(replay.status,200);assert.equal(replay.data.request.replayed,true);assert.deepEqual(replay.data.message,sent.data.message);
  assert.deepEqual((await status()).data,replay.data);assert.equal(await count('chat_messages'),1);assert.equal(await count('chat_text_requests'),1);
  const missing=await status('request-missing');assert.equal(missing.status,404);assert.deepEqual(missing.data.request,{key:'request-missing',actorId:alice,companyId:company,roomId:'direct',state:'missing'});
  assert(trace.some(q=>q.client&&/FOR SHARE OF u,c/.test(q.sql)));assert(trace.some(q=>q.client&&/FOR UPDATE/.test(q.sql)));
  assert(trace.filter(q=>/chat_text_requests|INSERT INTO chat_messages|UPDATE chat_rooms/.test(q.sql)).every(q=>q.client));
  assert.equal(providerCalls,0);assert.equal(held,0);
});
test('real HTTP/socket cross-transport concurrent retries save and broadcast exactly once',async()=>{
  const a=await connect(),b=await connect(token(bob));await a.join('direct');await b.join('direct');
  const requests=[post(),a.call('chat-text-request',body()),post(),a.call('chat-text-request',body())];
  const results=await Promise.all(requests);const data=results.map(x=>x.data||x);
  assert(data.every(x=>x.success));assert.equal(new Set(data.map(x=>x.message.id)).size,1);assert.equal(data.filter(x=>!x.request.replayed).length,1);
  await eventually(()=>b.events.length===1);await sleep(30);assert.equal(a.events.length,1);assert.equal(b.events.length,1);
  const payload=b.events[0][1];assert.equal(payload.request,undefined);assert(!JSON.stringify(payload).includes('request-0001'));assert(!('payload_hash' in payload));
  assert.equal(await count('chat_messages'),1);assert.equal(await count('chat_text_requests'),1);
  const socketFirst=await a.call('chat-text-request',body('socket-first'));const viaHttp=await post(body('socket-first'));
  assert.equal(viaHttp.data.message.id,socketFirst.message.id);assert(viaHttp.data.request.replayed);
  const history=await fetch(url+'/api/chat/room/direct',{headers:{Authorization:'Bearer '+token(bob)}});
  const historyText=await history.text();assert(!historyText.includes('request-0001'));assert(!historyText.includes('payload_hash'));assert(!historyText.includes('request_key'));
});
test('text and room conflicts, intentional identical text, actor and company key isolation',async()=>{
  const sent=await post();assert.equal((await post(body('request-0001','Different'))).status,409);
  assert.equal((await post(body('request-0001','Hello','group'))).status,409);
  assert.equal((await status('request-0001','group')).status,404);
  const another=await post(body('request-0002'));assert.notEqual(another.data.message.id,sent.data.message.id);
  const byBob=await post({...body(),expectedActorId:bob},token(bob));assert.equal(byBob.status,200);assert.notEqual(byBob.data.message.id,sent.data.message.id);
  const foreign=await post({...body(),roomId:'foreign',expectedCompanyId:other,expectedActorId:mallory},token(mallory,{companyId:other}));assert.equal(foreign.status,200);
  assert.equal((await status('request-0001','direct',token(eve),company,eve)).status,403);
  assert.equal(await count('chat_text_requests'),4);
});
test('strict keyed validation and trim-only canonicalization never silently downgrade',async()=>{
  for(const value of [null,0,{},[],true,'','short',' spaces-key','nul\0-key','trailing-key\n','trailing-key\r','a'.repeat(129)])assert.equal((await post({...body(),requestKey:value})).status,400);
  for(const field of ['roomId','message','expectedCompanyId','expectedActorId'])for(const value of [null,0,{},[],true,'','\0','\ud800'])assert.equal((await post({...body(),[field]:value})).status,400,field+String(value));
  assert.equal((await post({...body(),roomId:'a'.repeat(256)})).status,400);assert.equal((await post(body('request-0001','a'.repeat(5001)))).status,400);
  assert.equal((await post({...body(),attachmentId:uid(99)})).status,400);
  assert.equal((await post(body('request-0001',' \u00e9\n'))).status,200);
  assert.equal((await post(body('request-0001','e\u0301'))).status,409);
  assert.equal((await post(body('emoji-key','🛠️'))).status,200);assert.equal((await post(body('emoji-key','🛠️'))).data.request.replayed,true);
  assert.equal(await count('chat_messages'),2);
});
for(const [name,change,expected] of [
  ['actor revoked',`UPDATE users SET is_active=false WHERE id='${alice}'`,401],
  ['company revoked',`UPDATE companies SET is_active=false WHERE id='${company}'`,401],
  ['transferred actor',`UPDATE users SET company_id='${other}' WHERE id='${alice}'`,401],
  ['password changed',`UPDATE users SET must_change_password=true WHERE id='${alice}'`,403],
  ['subscription cancelled',`UPDATE companies SET subscription_status='inactive' WHERE id='${company}'`,402],
  ['entitlement expired',`UPDATE companies SET subscription_current_period_end=now()-interval '1 second' WHERE id='${company}'`,402],
  ['membership removed',`DELETE FROM chat_room_members WHERE user_id='${alice}'`,403],
  ['room moved',`UPDATE chat_rooms SET company_id='${other}' WHERE id='direct'`,403],
  ['room deleted',"DELETE FROM chat_rooms WHERE id='direct'",403],
])test(name+' between gate and transaction denies create/replay/status',async()=>{
  for(const mode of ['create','replay','status']) {
    // Snapshot and roll back mutations after each exercise using explicit repair.
    if(mode!=='create')assert.equal((await post()).status,200);
    beforeConnect=()=>db.exec(change);
    const result=mode==='status'?await status():await post();assert.equal(result.status,expected,name+' '+mode);assert.equal(result.data.request,undefined);
    // Restore only fixture rows, preserving schema and live pool object.
    await db.exec(`DELETE FROM chat_text_requests;DELETE FROM chat_messages;DELETE FROM chat_room_members;DELETE FROM chat_rooms;
      UPDATE users SET is_active=true,must_change_password=false,company_id='${company}' WHERE id='${alice}';
      UPDATE companies SET is_active=true,subscription_status='active',subscription_current_period_end=NULL WHERE id='${company}';
      INSERT INTO chat_rooms(id,company_id) VALUES('direct','${company}'),('group','${company}'),('foreign','${other}');
      INSERT INTO chat_room_members VALUES('direct','${alice}'),('direct','${bob}'),('group','${alice}'),('group','${bob}'),('foreign','${mallory}');`);
  }
});
test('request-start, JWT and expected company are independent constraints for HTTP and sockets',async()=>{
  assert.equal((await post({...body(),expectedCompanyId:other})).status,401);
  assert.equal((await post(body(),token(alice,{companyId:other}))).status,401);
  const c=await connect(token(alice,{}));
  await db.exec(`UPDATE users SET company_id='${other}' WHERE id='${alice}';INSERT INTO chat_room_members VALUES('foreign','${alice}')`);
  const moved={...body(),roomId:'foreign',expectedCompanyId:other};
  const result=await c.call('chat-text-request',moved);assert.equal(result.success,false);assert.equal(result.code,'AUTHENTICATION_REQUIRED');
  assert.equal((await post(body(),token(alice,{}))).status,401);
  assert.equal((await post(moved,token(alice,{}))).status,200);
  await db.exec(`UPDATE users SET company_id='${company}' WHERE id='${alice}'`);
  beforeConnect=()=>db.exec(`UPDATE users SET company_id='${other}' WHERE id='${alice}'`);
  assert.equal((await post(moved,token(alice,{}))).status,401,'gate company cannot be replaced by expected company');
});
test('actual committed save then lost COMMIT acknowledgement recovers once without compensating',async()=>{
  const peer=await connect(token(bob));await peer.join('direct');
  afterQuery=async sql=>{if(sql==='COMMIT'){afterQuery=undefined;throw Error('Lost COMMIT acknowledgement after actual commit');}};
  const uncertain=await post();assert.equal(uncertain.status,503);assert.equal(uncertain.data.code,'CHAT_REQUEST_UNCERTAIN');assert.equal(released.at(-1),true);
  assert.equal(await count('chat_messages'),1);assert.equal(await count('chat_text_requests'),1);assert(!trace.some(q=>q.sql==='ROLLBACK'));
  assert.equal((await status()).status,200);const recovered=await post();assert.equal(recovered.status,200);assert(recovered.data.request.replayed);await sleep(20);assert.equal(peer.events.length,0,'uncertain first attempt does not claim a notification, replay never emits');
});
for(const pattern of [/INSERT INTO chat_text_requests/,/INSERT INTO chat_messages/,/UPDATE chat_rooms/,/FROM chat_messages cm/])test('transaction rollback after injected '+pattern,async()=>{
  const before=(await db.query("SELECT updated_at FROM chat_rooms WHERE id='direct'")).rows[0].updated_at;
  fault=sql=>pattern.test(sql);const failed=await post();assert.equal(failed.status,503);fault=undefined;
  assert.equal(await count('chat_messages'),0);assert.equal(await count('chat_text_requests'),0);
  assert.deepEqual((await db.query("SELECT updated_at FROM chat_rooms WHERE id='direct'")).rows[0].updated_at,before);
  assert.equal((await post()).status,200);
});
test('expiry after lock/read waits is checked before commit for create, replay and status',async()=>{
  for(const mode of ['create','replay','status']) {
    if(mode!=='create')assert.equal((await post(body(mode+'-expiry'))).status,200);
    const expiry=Math.floor(Date.now()/1000)+2;
    afterQuery=async sql=>{if(/FROM chat_messages cm/.test(sql)){afterQuery=undefined;await sleep(Math.max(0,expiry*1000-Date.now()+10));}};
    const access=jwt.sign({id:alice,companyId:company,exp:expiry},secret);
    const input=body(mode+'-expiry');
    const result=mode==='status'?await status(mode+'-expiry','direct',access):await post(input,access);
    assert.equal(result.status,401,mode);assert.equal(result.data.request,undefined);
  }
  afterQuery=async sql=>{if(/FROM chat_messages cm/.test(sql)){afterQuery=undefined;await sleep(250);}};
  await db.exec(`UPDATE companies SET subscription_current_period_end=now()+interval '0.15 second' WHERE id='${company}'`);
  assert.equal((await post(body('natural-expiry'))).status,402);
});
test('complimentary sponsor must remain active boss/owner; finite entitlement parity',async()=>{
  process.env.COMPLIMENTARY_TESTER_IDENTITY=`${sponsor}:${company}`;
  await db.exec(`UPDATE users SET role='boss' WHERE id='${sponsor}';UPDATE companies SET subscription_status='inactive' WHERE id='${company}'`);
  assert.equal((await post()).status,200);
  beforeConnect=()=>db.exec(`UPDATE users SET role='employee' WHERE id='${sponsor}'`);
  assert.equal((await post()).status,402);
  process.env.COMPLIMENTARY_TESTER_IDENTITY='';
  for(const end of ["'infinity'","'-infinity'","'275761-01-01'","now()-interval '1 second'"]) {
    await db.exec(`UPDATE companies SET subscription_status='active',subscription_current_period_end=NULL WHERE id='${company}'`);
    beforeConnect=()=>db.exec(`UPDATE companies SET subscription_current_period_end=${end} WHERE id='${company}'`);
    assert.equal((await post()).status,402,end);
  }
});
for(const [name,mutation] of [
  ['deleted',"DELETE FROM chat_messages"],['text changed',"UPDATE chat_messages SET message='tampered'"],
  ['room changed',"UPDATE chat_messages SET room_id='group'"],['company changed',`UPDATE chat_messages SET company_id='${other}'`],
  ['sender changed',`UPDATE chat_messages SET sender_id='${bob}'`],['attachment added',`UPDATE chat_messages SET attachment_id='${uid(99)}'`],
])test('saved message '+name+' returns tombstone and never recreates',async()=>{
  const sent=await post();assert.equal(sent.status,200);await db.exec(mutation);
  for(const result of [await post(),await status()]) {assert.equal(result.status,410);assert.equal(result.data.message.includes('no longer available'),true);assert.deepEqual(result.data.request,{key:'request-0001',actorId:alice,companyId:company,roomId:'direct',state:'unavailable'});}
  assert.equal(await count('chat_text_requests'),1);assert.equal(await count('chat_messages'),name==='deleted'?0:1);
});
test('room deletion/recreation retains key tombstone and current room authorization',async()=>{
  await post();await db.exec("DELETE FROM chat_messages;DELETE FROM chat_rooms WHERE id='direct'");assert.equal((await status()).status,403);
  assert.equal(await count('chat_text_requests'),1);
  await db.exec(`INSERT INTO chat_rooms(id,company_id) VALUES('direct','${company}');INSERT INTO chat_room_members VALUES('direct','${alice}')`);
  assert.equal((await post()).status,410);assert.equal(await count('chat_messages'),0);
});
test('stale recipients denied, sender acknowledgement private, adapter failure still saved',async()=>{
  const sender=await connect(),peer=await connect(token(bob));await sender.join('direct');await peer.join('direct');
  await db.exec(`DELETE FROM chat_room_members WHERE user_id='${bob}'`);
  const ack=await sender.call('chat-text-request',body());assert(ack.success);await eventually(()=>sender.events.length===1);assert.equal(peer.events.length,0);
  const fetchSockets=io.in.bind(io);io.in=()=>({fetchSockets:async()=>{assert.equal(held,0);throw Error('Synthetic adapter down');}});
  try {const result=await post(body('adapter-down'));assert.equal(result.status,200);assert.equal(result.data.request.state,'saved');}
  finally{io.in=fetchSockets;}
  assert.equal(await count('chat_messages'),2);
});
test('schema absence fails keyed closed while unkeyed HTTP/socket/support retain legacy behavior',async()=>{
  await db.exec('ALTER TABLE chat_text_requests RENAME TO hidden_receipts');
  try {
    assert.equal((await post()).data.code,'CHAT_REQUEST_SCHEMA_UNAVAILABLE');assert.equal((await status()).data.code,'CHAT_REQUEST_SCHEMA_UNAVAILABLE');
    const c=await connect();await c.join('direct');assert.equal((await c.call('chat-text-request',body())).code,'CHAT_REQUEST_SCHEMA_UNAVAILABLE');
    assert.equal((await post({roomId:'direct',message:'legacy HTTP'},token(),'/message')).status,200);
    c.emit('chat-message',{roomId:'direct',message:'legacy socket'});await eventually(async()=>await count('chat_messages')===2);
    assert.equal((await post({...body(),roomId:'support-ticket-ticket1'})).data.code,'CHAT_REQUEST_SUPPORT_UNSUPPORTED');
    assert.equal((await c.call('chat-text-request',{...body(),roomId:'support-ticket-ticket1'})).code,'CHAT_REQUEST_SUPPORT_UNSUPPORTED');
    await db.exec(`UPDATE users SET role='support_agent' WHERE id='${bob}'`);
    assert.equal((await post({roomId:'support-ticket-ticket1',message:'legacy paid HTTP agent'},token(bob),'/message')).status,200);
    const nonOwner=await connect(token(bob));assert.equal((await nonOwner.join('support-ticket-ticket1')).success,false);
    await db.exec(`UPDATE companies SET subscription_status='inactive' WHERE id='${company}';UPDATE users SET must_change_password=true WHERE id='${alice}'`);
    assert.equal((await c.join('support-ticket-ticket1')).success,true);
    c.emit('chat-message',{roomId:'support-ticket-ticket1',message:'legacy unpaid owner'});await eventually(async()=>await count('chat_messages')===4);
    assert.equal((await post({roomId:'support-ticket-ticket1',message:'gated HTTP'},token(),'/message')).status,403);
    assert.equal((await c.call('join-agent-dashboard')).success,false);
  }finally {await db.exec('ALTER TABLE hidden_receipts RENAME TO chat_text_requests');}
});

test('pool size one never nests pool lookups and releases before recipient fan-out', {timeout:5000}, async()=>{
  const peer=await connect(token(bob));await peer.join('direct');rejectNested=true;
  const result=await post();assert.equal(result.status,200);await eventually(()=>peer.events.length===1);
  assert.equal(held,0);assert.equal((await post()).status,200);assert.equal((await status()).status,200);
  assert(released.every(discard=>discard===false));
});

test('keyed socket create/replay rechecks current actor, password, entitlement and membership',async()=>{
  const c=await connect();assert((await c.call('chat-text-request',body())).success);
  for(const [change,code] of [
    [`UPDATE users SET is_active=false WHERE id='${alice}'`,'AUTHENTICATION_REQUIRED'],
    [`UPDATE companies SET is_active=false WHERE id='${company}'`,'AUTHENTICATION_REQUIRED'],
    [`UPDATE users SET must_change_password=true WHERE id='${alice}'`,'PASSWORD_CHANGE_REQUIRED'],
    [`UPDATE companies SET subscription_status='inactive' WHERE id='${company}'`,'SUBSCRIPTION_REQUIRED'],
    [`DELETE FROM chat_room_members WHERE user_id='${alice}'`,'CHAT_ACCESS_DENIED'],
  ]) {
    await db.exec(change);
    for(const key of ['request-0001','not-saved-key']) {
      const reply=await c.call('chat-text-request',body(key));assert.equal(reply.code,code);assert.equal(reply.request,undefined);
    }
    await db.exec(`UPDATE users SET is_active=true,must_change_password=false WHERE id='${alice}';
      UPDATE companies SET is_active=true,subscription_status='active' WHERE id='${company}';
      INSERT INTO chat_room_members VALUES('direct','${alice}') ON CONFLICT DO NOTHING`);
  }
  assert.equal(await count('chat_messages'),1);assert.equal(await count('chat_text_requests'),1);
});

test('deadlock/lock-timeout/statement-timeout rollback permits only same-key retry',async()=>{
  for(const code of ['40P01','55P03','57014']) {
    afterQuery=async sql=>{if(/INSERT INTO chat_messages/.test(sql)){afterQuery=undefined;throw Object.assign(Error('Injected '+code),{code});}};
    const result=await post(body('fault-'+code));assert.equal(result.status,503);assert.equal(result.data.code,'CHAT_REQUEST_RETRY');
    assert.equal((await status('fault-'+code)).status,404);assert.equal((await post(body('fault-'+code))).status,200);
  }
  assert.equal(await count('chat_messages'),3);assert.equal(await count('chat_text_requests'),3);
});

test('failed BEGIN and failed ROLLBACK discard connections without leaking a claimed key',async()=>{
  fault=sql=>sql==='BEGIN';assert.equal((await post()).status,503);assert.equal(released.at(-1),true);fault=undefined;
  afterQuery=async sql=>{if(/INSERT INTO chat_messages/.test(sql)||sql==='ROLLBACK')throw Error('Injected rollback acknowledgement failure');};
  assert.equal((await post()).status,503);assert.equal(released.at(-1),true);afterQuery=undefined;
  assert.equal(await count('chat_messages'),0);assert.equal(await count('chat_text_requests'),0);assert.equal((await post()).status,200);
});

test('status rejects missing, repeated and unexpected query fields before any receipt lookup',async()=>{
  const before=trace.filter(x=>x.sql.includes('FROM chat_text_requests')).length;
  for(const query of ['',`expectedCompanyId=${company}`,`expectedActorId=${alice}`,`expectedCompanyId=${company}&expectedActorId=${alice}&expectedCompanyId=${company}`,`expectedCompanyId=${company}&expectedActorId=${alice}&expectedActorId=${alice}`,`expectedCompanyId=${company}&expectedActorId=${alice}&other=1`,`expectedCompanyId[foo]=${company}&expectedActorId=${alice}`,`expectedCompanyId=${company}&expectedActorId[foo]=${alice}`]) {
    const response=await fetch(url+'/api/chat/room/direct/requests/request-0001?'+query,{headers:{Authorization:'Bearer '+token()}});
    assert.equal(response.status,400);
  }
  assert.equal(trace.filter(x=>x.sql.includes('FROM chat_text_requests')).length,before);
});

test('durable transports require keys; upgraded legacy transports reject keyed misuse without writing',async()=>{
  const c=await connect();
  for(const input of [{roomId:'direct',message:'missing key'}, {...body(),requestKey:null}]) {
    assert.equal((await post(input)).status,400);assert.equal((await c.call('chat-text-request',input)).code,'CHAT_REQUEST_INVALID');
  }
  assert.equal((await post(body(),token(),'/message')).data.code,'CHAT_REQUEST_ENDPOINT_REQUIRED');
  assert.equal((await c.call('chat-message',body())).code,'CHAT_REQUEST_ENDPOINT_REQUIRED');
  assert.equal(await count('chat_messages'),0);assert.equal(await count('chat_text_requests'),0);
});

test('untouched old-source HTTP/socket replicas cannot write through the distinct durable transports',async()=>{
  const old=require('./fixtures/chat-text-legacy-b004025.json');
  assert.equal(old.commit,'b004025db9658e21a9d0c8903fe9de56a4922103');
  const app=express(),router=express.Router();app.use(express.json());app.use('/api',load('middleware/trialMiddleware.ts').subscriptionGate);
  const oldServer=http.createServer(app),oldIO=new Server(oldServer);app.set('io',oldIO);
  const globals={pool,...load('utils/auth.ts'),...load('middleware/trialMiddleware.ts'),...load('services/socketAuthorization.ts'),
    saveMessage:load('services/chatService.ts').saveMessage,router,io:oldIO,jwt,JWT_SECRET:secret,
    shutdown:{isStopping:()=>false},console:{log(){},error(){},warn(){}},process,Buffer};
  for(const source of [old.http,old.socket])vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{...globals,exports:{}});
  app.use('/api/chat',router);app.use((_req,res)=>res.status(404).json({success:false,message:'API endpoint not found'}));
  await new Promise(resolve=>oldServer.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${oldServer.address().port}`;
  let c;
  try {
    assert.equal((await post({roomId:'direct',message:'old unkeyed HTTP works'},token(),'/message',base)).status,200);
    c=await connect(token(),base);c.emit('chat-message',{roomId:'direct',message:'old unkeyed socket works'});
    await eventually(async()=>await count('chat_messages')===2);await db.exec('DELETE FROM chat_messages');
    assert.equal((await post(body(),token(),'/message-requests',base)).status,404);
c.ws.send('42999'+JSON.stringify(['chat-text-request',body()]));
    // Ordered round trip proves the unknown event packet was processed, not a
    // sleeping network fixture. Old Socket.IO has no handler and sends no ACK.
    assert.equal((await c.join('direct')).success,true);await sleep(20);
    assert(!c.packets.some(p=>p.startsWith('43999[')));assert.equal(await count('chat_messages'),0);assert.equal(await count('chat_text_requests'),0);
    // Recover the identical immutable request on a new replica: exactly one save.
    assert.equal((await post()).status,200);assert.equal((await post()).data.request.replayed,true);assert.equal(await count('chat_messages'),1);
    // Demonstrate the old bug the new names avoid: legacy ignores the key and
    // inserts twice. This is a negative control, never a fallback recommendation.
    await post(body('wrong-old-path'),token(),'/message',base);
    c.emit('chat-message',body('wrong-old-path'));await eventually(async()=>await count('chat_messages')===3);
    assert.equal(await count('chat_text_requests'),1);
  } finally {if(c)c.ws.close();await new Promise(resolve=>oldIO.close(resolve));}
});

test('expectedActorId rejects another same-company token on HTTP/socket/status without write or disclosure',async()=>{
  const bobSocket=await connect(token(bob));await bobSocket.join('direct');
  const denied=result=>{assert.equal(result.success,false);assert.equal(result.code,'CHAT_REQUEST_OWNER_MISMATCH');assert.equal(result.request,undefined);assert.equal(typeof result.message,'string');};
  for(const stage of ['missing','saved','unavailable']) {
    if(stage==='saved')assert.equal((await post()).status,200);
    if(stage==='unavailable')await db.exec('DELETE FROM chat_messages');
    const beforeMessages=await count('chat_messages'),beforeReceipts=await count('chat_text_requests');
    await bobSocket.join('direct'); // Ordered round trip drains any earlier legitimate notification.
    const traceStart=trace.length,eventCount=bobSocket.events.length;
    // The persisted Alice record keeps its original owner even if a stale client
    // accidentally selects Bob's current HTTP token or connection.
    const http=await post(body(),token(bob));assert.equal(http.status,403);denied(http.data);
    denied(await bobSocket.call('chat-text-request',body()));
    const recovered=await status('request-0001','direct',token(bob));assert.equal(recovered.status,403);denied(recovered.data);
    assert.equal(await count('chat_messages'),beforeMessages);assert.equal(await count('chat_text_requests'),beforeReceipts);
    assert(!trace.slice(traceStart).some(q=>/chat_text_requests|INSERT INTO chat_messages|UPDATE chat_rooms/.test(q.sql)));
    assert.equal(bobSocket.events.length,eventCount);
  }
});

test('expected actor is only a constraint and correct owners retain independent replay/status',async()=>{
  assert.equal((await post({...body(),expectedActorId:bob})).status,403,'Alice token cannot act as expected Bob');
  const aliceSaved=await post();assert.equal(aliceSaved.status,200);
  const bobInput={...body(),expectedActorId:bob},bobSocket=await connect(token(bob));
  const bobSaved=await bobSocket.call('chat-text-request',bobInput);assert.equal(bobSaved.success,true);assert.equal(bobSaved.request.actorId,bob);
  assert.notEqual(bobSaved.message.id,aliceSaved.data.message.id);
  const replay=await post(bobInput,token(bob));assert.equal(replay.status,200);assert.equal(replay.data.request.replayed,true);assert.equal(replay.data.message.id,bobSaved.message.id);
  const bobStatus=await status('request-0001','direct',token(bob),company,bob);assert.equal(bobStatus.status,200);assert.equal(bobStatus.data.message.id,bobSaved.message.id);
  assert.equal((await status()).data.message.id,aliceSaved.data.message.id);assert.equal(await count('chat_messages'),2);
});

test('expected actor rejects missing, non-string, noncanonical, oversized and malformed values before receipt access',async()=>{
  const c=await connect(),before=trace.length;
  for(const value of [undefined,null,0,true,{},[],alice+'\n',' '+alice,alice+' ',alice.toUpperCase(),'a'.repeat(37),'not-a-uuid','\0','\ud800']) {
    const input={...body(),expectedActorId:value};
    assert.equal((await post(input)).status,400,String(value));assert.equal((await c.call('chat-text-request',input)).code,'CHAT_REQUEST_INVALID');
  }
  for(const value of ['',alice+'\n',' '+alice,alice.toUpperCase(),'not-a-uuid','\0']) {
    const response=await fetch(url+`/api/chat/room/direct/requests/request-0001?expectedCompanyId=${company}&expectedActorId=${encodeURIComponent(value)}`,{headers:{Authorization:'Bearer '+token()}});
    assert.equal(response.status,400);
  }
  assert(!trace.slice(before).some(q=>q.client));assert.equal(await count('chat_messages'),0);assert.equal(await count('chat_text_requests'),0);
});

test('pre-constraint receipt rows and fingerprints replay unchanged for the correct expected actor',async()=>{
  const originalId=uid(99),text='Previously committed text';
  const hash=require('node:crypto').createHash('sha256').update(JSON.stringify(['chat-text',1,'direct',text]),'utf8').digest('hex');
  await db.query('INSERT INTO chat_messages(id,sender_id,company_id,message,room_id) VALUES($1,$2,$3,$4,$5)',[originalId,alice,company,text,'direct']);
  await db.query('INSERT INTO chat_text_requests(company_id,actor_id,request_key,room_id,fingerprint_version,payload_hash,original_message_id) VALUES($1,$2,$3,$4,1,$5,$6)',[company,alice,'original-key','direct',hash,originalId]);
  const snapshot=(await db.query('SELECT * FROM chat_text_requests')).rows;
  const c=await connect();await c.join('direct');
  const replay=await post(body('original-key',text));assert.equal(replay.status,200);assert.equal(replay.data.request.replayed,true);assert.equal(replay.data.message.id,originalId);
  assert.equal((await status('original-key')).data.message.id,originalId);
  assert.equal((await c.call('chat-text-request',body('original-key',text))).message.id,originalId);
  assert.equal(c.events.length,0);assert.deepEqual((await db.query('SELECT * FROM chat_text_requests')).rows,snapshot);assert.equal(await count('chat_messages'),1);
});

test('owner mismatch is distinct from genuine authentication failure and payload conflict',async()=>{
  const wrongOwner=await post(body(),token(bob));assert.equal(wrongOwner.status,403);assert.equal(wrongOwner.data.code,'CHAT_REQUEST_OWNER_MISMATCH');
  assert.deepEqual(wrongOwner.data,{success:false,code:'CHAT_REQUEST_OWNER_MISMATCH',message:'This request does not match the signed-in account.'});
  const wrongToken=await post(body(),'invalid-token');assert.equal(wrongToken.status,401);assert.equal(wrongToken.data.code,'AUTHENTICATION_REQUIRED');
  const wrongStatusToken=await fetch(url+`/api/chat/room/direct/requests/request-0001?expectedCompanyId=${company}&expectedActorId=${alice}`,{headers:{Authorization:'Bearer invalid-token'}});assert.equal(wrongStatusToken.status,401);assert.equal((await wrongStatusToken.json()).code,'AUTHENTICATION_REQUIRED');
  assert.equal((await post()).status,200);
  const conflict=await post(body('request-0001','different text'));assert.equal(conflict.status,409);assert.equal(conflict.data.code,'CHAT_REQUEST_CONFLICT');
  const socket=await connect();await db.exec(`UPDATE users SET is_active=false WHERE id='${alice}'`);
  const revoked=await socket.call('chat-text-request',body());assert.equal(revoked.code,'AUTHENTICATION_REQUIRED');assert.equal(revoked.request,undefined);
});
