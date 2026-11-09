const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const express=require('express'),jwt=require('jsonwebtoken');
process.env.JWT_SECRET='isolated-activity-test';
const {pool}=require('../dist/config/database');
const access=require('../dist/middleware/trialMiddleware');
const service=require('../dist/services/lucyActivityService');
const db=new PGlite();let server,base,role='manager',authorized=true,password=false,checks=0,revokeAfter=Infinity;
const id=n=>`00000000-0000-4000-a000-${String(n).padStart(12,'0')}`;
const actor={id:id(2),company_id:id(1),role:'manager'};
const query=async(sql,args)=>{const r=await db.query(sql,args);return {rows:r.rows,rowCount:r.affectedRows??r.rows.length};};
const read=async(path='',user=id(2))=>{const r=await fetch(base+path,{headers:user?{Authorization:`Bearer ${jwt.sign({id:user},process.env.JWT_SECRET)}`}:{}});return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')};};
before(async()=>{
 await db.exec(`CREATE TABLE users(id uuid,company_id uuid,role text,is_active boolean); CREATE TABLE command_events(id uuid,company_id uuid,actor_id uuid,kind text,title text,details jsonb,created_at timestamptz); CREATE TABLE lucy_background_work(id uuid,company_id uuid,user_id uuid,actor_role text,mode text,status text,created_at timestamptz,updated_at timestamptz,completed_at timestamptz); CREATE TABLE lucy_request_ledger(id uuid,company_id uuid,user_id uuid,actor_role text,status text,created_at timestamptz,updated_at timestamptz,completed_at timestamptz);`);
 await query("INSERT INTO users VALUES($1,$2,'manager',true),($3,$2,'employee',true),($4,$5,'manager',true),($6,$2,'manager',false)",[id(2),id(1),id(3),id(4),id(5),id(6)]);
 for(const [n,company,user] of [[10,id(1),id(2)],[20,id(1),id(3)],[30,id(5),id(2)],[40,id(5),id(4)]]){
  await query("INSERT INTO command_events VALUES($1,$2,$3,'task','SECRET_TITLE','{\"status\":\"completed\",\"summary\":\"SECRET_SUMMARY\"}',now())",[id(n),company,user]);
  await query("INSERT INTO lucy_background_work VALUES($1,$2,$3,'manager','record_search','completed',now(),now(),now())",[id(n+1),company,user]);
  await query("INSERT INTO lucy_request_ledger VALUES($1,$2,$3,'manager','completed',now(),now(),now())",[id(n+2),company,user]);
 }
 await query("INSERT INTO command_events VALUES($1,$2,$3,'pto','SECRET_PTO','{\"status\":\"completed\"}',now())",[id(50),id(1),id(2)]);
 pool.query=query;pool.connect=async()=>({query,release:()=>{}});
 access.loadSubscriptionActor=async(user,company)=>{assert.equal(user,id(2));assert.equal(company,id(1));return {role:++checks>=revokeAfter?'employee':role,mustChangePassword:password};};
 access.hasCompanyEntitlement=()=>authorized;
 const app=express();app.use('/activity',require('../dist/routes/lucyActivityRoutes').default);server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}/activity`;
});
after(async()=>{await new Promise(resolve=>server.close(resolve));await db.close();await pool.end();});
test('requires an active authenticated account and rejects client-supplied scope',async()=>{
 for(const user of [null,id(6),id(99)])assert.equal((await read('',user)).status,401);
 for(const path of ['?companyId='+id(5),'?userId='+id(3),'?limit=500','?role=owner'])assert.equal((await read(path)).status,400);
});
test('history contains only own tenant receipts, bounded metadata and no cache',async()=>{
 const r=await read();assert.equal(r.status,200);assert.equal(r.cache,'no-store');assert.equal(r.body.entries.length,4);
 assert.deepEqual(new Set(r.body.entries.map(e=>e.receiptId)),new Set([10,11,12,50].map(id)));
 assert.equal(JSON.stringify(r.body).includes('SECRET'),false);
 assert.equal(r.body.entries.find(e=>e.source==='request').outcome,'Response recorded');
 assert.equal(r.body.entries.find(e=>e.source==='action').completedAt,null);
});
test('demotion hides old-role work/requests and legacy managerial receipts',async()=>{
 role='employee';await query("UPDATE users SET role='employee' WHERE id=$1",[id(2)]);
 const r=await read();assert.equal(r.status,200);assert.deepEqual(r.body.entries.map(e=>e.receiptId),[id(50)]);
 role='manager';await query("UPDATE users SET role='manager' WHERE id=$1",[id(2)]);
});
test('entitlement, password, role changes and revocation during read fail closed',async()=>{
 authorized=false;assert.equal((await read()).status,402);authorized=true;
 password=true;assert.equal((await read()).status,403);password=false;
 role='employee';assert.equal((await read()).status,401);role='manager';
 checks=0;revokeAfter=2;const r=await read();assert.equal(r.status,401);assert.equal(r.body.entries,undefined);revokeAfter=Infinity;
});
test('unknown source/status/kind and malformed identifiers or timestamps are never rendered',()=>{
 const base={id:id(100),source:'request',kind:'chat',status:'processing',created_at:new Date(),updated_at:new Date()};
 assert.equal(service.publicLucyActivity(base).outcome,'Outcome not yet confirmed');
 for(const change of [{source:'deployment'},{status:'published'},{id:'secret'},{updated_at:'bad'},{source:'action',kind:'__proto__'},{source:'action',kind:'task',status:'constructor'}])assert.equal(service.publicLucyActivity({...base,...change}),null);
});
test('source failures return unavailable rather than a fabricated empty history',async()=>{
 await db.exec('ALTER TABLE lucy_request_ledger RENAME TO missing_ledger');const r=await read();assert.equal(r.status,503);assert.equal(r.body.entries,undefined);await db.exec('ALTER TABLE missing_ledger RENAME TO lucy_request_ledger');
});
test('global latest update order and 50-record limit are enforced by SQL',async()=>{
 for(let n=100;n<160;n++)await query("INSERT INTO lucy_background_work VALUES($1,$2,$3,'manager','work_briefing','queued',now(),$4,NULL)",[id(n),id(1),id(2),new Date(Date.now()+n*1000).toISOString()]);
 const r=await read();assert.equal(r.status,200);assert.equal(r.body.entries.length,50);assert.equal(r.body.entries[0].receiptId,id(159));assert.equal(r.body.entries.at(-1).receiptId,id(110));
});
