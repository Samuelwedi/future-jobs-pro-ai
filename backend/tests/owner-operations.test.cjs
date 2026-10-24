const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const {pool}=require('../dist/config/database');
const {requireOwner}=require('../dist/routes/ownerOperationsRoutes');
const {runOwnerOperationsTick}=require('../dist/services/ownerOperationsService');
const db=new PGlite(); let requests=0;
const originalFetch=global.fetch;
const owner='00000000-0000-4000-8000-000000000001';
before(async()=>{
 await db.exec(`CREATE TABLE platform_support_agents(id uuid primary key,role text,is_active boolean);
 INSERT INTO platform_support_agents VALUES('${owner}','owner',true);
 CREATE TABLE companies(subscription_status text);
 CREATE TABLE support_tickets(status text,priority text);
 CREATE TABLE system_incidents(status text,component text,severity text);`);
 await db.exec(fs.readFileSync('migrations/20261024_owner_operations.sql','utf8'));
 pool.query=async(sql,args)=>{const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows||r.rows.length};};
 pool.connect=async()=>({query:async(sql,args)=>{
 if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:true}]};
 if(sql.includes('pg_advisory_unlock'))return {rows:[]};
 return pool.query(sql,args);
 },release:()=>{}});
 process.env.OPENAI_API_KEY='unit-test-key-not-real';
 global.fetch=async(url,options)=>{requests++;const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.tools,undefined);
 return new Response(JSON.stringify({object:'response',id:'test-response',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'Evidence is limited.',annotations:[]}]}],usage:{input_tokens:20,output_tokens:10}}),{status:200,headers:{'content-type':'application/json'}});};
});
after(async()=>{global.fetch=originalFetch;await db.close();await pool.end();});
test('only platform owners pass authorization',()=>{
 for(const role of [undefined,'admin','agent','supervisor']){let code;requireOwner({supportAgent:role?{role}:undefined},{status(n){code=n;return this;},json(){}},()=>assert.fail('authorized'));assert.equal(code,403);}
 let allowed=false;requireOwner({supportAgent:{role:'owner'}},{},()=>allowed=true);assert.equal(allowed,true);
});
test('worker saves review output and usage without executing actions',async()=>{
 await db.query("INSERT INTO owner_operations_jobs(owner_id,department,instruction) VALUES($1,'it','Review incidents')",[owner]);
 await runOwnerOperationsTick();const j=(await db.query('SELECT * FROM owner_operations_jobs')).rows[0];
 assert.equal(j.status,'review');assert.match(j.result,/limited/);assert.equal(j.input_tokens,20);assert.equal(requests,1);
});
test('disabled owner cannot trigger queued work',async()=>{
 await db.query('UPDATE platform_support_agents SET is_active=false');
 await db.query("INSERT INTO owner_operations_jobs(owner_id,department,instruction) VALUES($1,'sales','Review subscriptions')",[owner]);
 await runOwnerOperationsTick();assert.equal(requests,1);
 await db.query('UPDATE platform_support_agents SET is_active=true');
});
test('daily budget includes failures and prevents further calls',async()=>{
 await db.query("INSERT INTO owner_operations_jobs(owner_id,department,instruction,status,started_at) SELECT $1,'it','test','failed',now() FROM generate_series(1,12)",[owner]);
 await runOwnerOperationsTick();assert.equal(requests,1);
});
