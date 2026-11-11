'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const {migrate}=require('../scripts/migrate-chat-text-requests.cjs');
const {run,steps}=require('../scripts/run-release-predeploy.cjs');
const sql=fs.readFileSync(path.join(__dirname,'../migrations/20261111_chat_text_requests.sql'),'utf8');
const exists=async(db,table)=>Boolean((await db.query('SELECT to_regclass($1) AS name',[table])).rows[0].name);

test('additive receipt migration applies repeatedly and preserves tombstones and scoped uniqueness',async t=>{
  const db=new PGlite();t.after(()=>db.close());await migrate(db);await migrate(db);
  assert.equal((await db.query('SELECT count(*)::int n FROM app_release_migrations')).rows[0].n,1);
  const values=['00000000-0000-4000-a000-000000000001','00000000-0000-4000-a000-000000000002','request-0001','direct',1,'a'.repeat(64),'00000000-0000-4000-a000-000000000003'];
  const insert='INSERT INTO chat_text_requests(company_id,actor_id,request_key,room_id,fingerprint_version,payload_hash,original_message_id) VALUES($1,$2,$3,$4,$5,$6,$7)';
  await db.query(insert,values);await assert.rejects(db.query(insert,values),e=>e.code==='23505');
  await db.query(insert,[values[1],...values.slice(1)]);
  await db.query(insert,[values[0],values[0],...values.slice(2)]);
  await migrate(db);assert.equal((await db.query('SELECT count(*)::int n FROM chat_text_requests')).rows[0].n,3);
  assert.equal((await db.query("SELECT count(*)::int n FROM pg_constraint WHERE conrelid='chat_text_requests'::regclass AND contype='f'")).rows[0].n,0);
  await assert.rejects(db.query(insert,[values[0],values[1],'invalid key',...values.slice(3)]),e=>e.code==='23514');
  await assert.rejects(db.query(insert,[values[0],values[1],'new-key-0001','support-ticket-1',...values.slice(4)]),e=>e.code==='23514');
});
test('failed verification rolls back all fresh schema and ledger changes',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  const client={query:async(sql,args)=>{if(sql.includes('information_schema.columns'))throw Error('Injected verify failure');return db.query(sql,args);}};
  await assert.rejects(migrate(client),/Injected verify failure/);assert.equal(await exists(db,'chat_text_requests'),false);assert.equal(await exists(db,'app_release_migrations'),false);
  await migrate(db);assert.equal(await exists(db,'chat_text_requests'),true);
});
for(const [name,change,reason] of [
  ['required column',"ALTER TABLE chat_text_requests DROP COLUMN original_message_id",/columns/],
  ['scoped uniqueness',"ALTER TABLE chat_text_requests DROP CONSTRAINT chat_text_requests_pkey",/uniqueness/],
  ['wrong unique scope',"ALTER TABLE chat_text_requests DROP CONSTRAINT chat_text_requests_pkey;ALTER TABLE chat_text_requests ADD PRIMARY KEY(request_key)",/uniqueness/],
  ['deferrable unique',"ALTER TABLE chat_text_requests DROP CONSTRAINT chat_text_requests_pkey;ALTER TABLE chat_text_requests ADD UNIQUE(company_id,actor_id,request_key) DEFERRABLE INITIALLY DEFERRED",/uniqueness/],
  ['missing validation',"ALTER TABLE chat_text_requests DROP CONSTRAINT chat_text_requests_hash_valid",/constraints/],
])test('repeat migration fails closed for '+name,async t=>{
  const db=new PGlite();t.after(()=>db.close());await migrate(db);await db.exec(change);await assert.rejects(migrate(db),reason);
});
test('incompatible preexisting table is not blessed by IF NOT EXISTS or a partial index',async t=>{
  const db=new PGlite();t.after(()=>db.close());await db.exec(sql);await db.exec('ALTER TABLE chat_text_requests DROP CONSTRAINT chat_text_requests_pkey;CREATE UNIQUE INDEX partial_receipt_key ON chat_text_requests(company_id,actor_id,request_key) WHERE room_id IS NOT NULL');
  await assert.rejects(migrate(db),/uniqueness/);assert.equal(await exists(db,'app_release_migrations'),false);
});
test('checksum mismatch aborts and receipt migration follows unchanged chat-media in required predeploy',async t=>{
  const db=new PGlite();t.after(()=>db.close());await migrate(db);await db.exec("UPDATE app_release_migrations SET sha256='tampered'");await assert.rejects(migrate(db),/checksum changed/);
  const index=steps.indexOf('migrate-chat-text-requests.cjs');assert(index>0);assert.equal(steps[index-1],'migrate-chat-media.cjs');
  const called=[];assert.throws(()=>run((_exe,args)=>{const name=path.basename(args[0]);called.push(name);return {status:name==='migrate-chat-text-requests.cjs'?1:0};}),/Release migration failed/);
  assert.deepEqual(called,steps.slice(0,index+1));
});
