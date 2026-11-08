const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
test('durable read-only work SQL and authenticated API',async t=>{
 process.env.JWT_SECRET='lucy-work-isolated-test';process.env.DATABASE_URL='postgres://unused@127.0.0.1:1/unused';
 const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();
 const {pool}=require('../dist/config/database');const original={query:pool.query,connect:pool.connect};
 const query=async(sql,args)=>{const r=await db.query(sql,args);return{rows:r.rows,rowCount:r.affectedRows||r.rows.length};};
 let server;
 try {
 await db.exec('CREATE TABLE companies(id uuid PRIMARY KEY,is_active boolean DEFAULT true,subscription_status text DEFAULT \'active\',subscription_tier text DEFAULT \'professional\',subscription_provider text,subscription_current_period_end timestamptz,subscription_expires_at timestamptz); CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,role text,is_active boolean DEFAULT true,must_change_password boolean DEFAULT false,first_name text,last_name text);');
 const migration=fs.readFileSync(require('node:path').join(__dirname,'../migrations/20261108_lucy_background_work.sql'),'utf8');await db.exec(migration);await db.exec(migration);await db.exec(fs.readFileSync(require('node:path').join(__dirname,'../migrations/20261108_lucy_work_modes.sql'),'utf8'));
 const c='aaaaaaaa-0000-4000-a000-000000000001',d='aaaaaaaa-0000-4000-a000-000000000002';
 const a='bbbbbbbb-0000-4000-a000-000000000001',b='bbbbbbbb-0000-4000-a000-000000000002',x='bbbbbbbb-0000-4000-a000-000000000003';
 await query('INSERT INTO companies(id) VALUES($1),($2)',[c,d]);
 for(const [id,company] of [[a,c],[b,c],[x,d]])await query("INSERT INTO users(id,company_id,role) VALUES($1,$2,'boss')",[id,company]);
 pool.query=query;pool.connect=async()=>({query,release(){}});
 const express=require('express'),jwt=require('jsonwebtoken');const app=express();app.use(express.json());app.use('/work',require('../dist/routes/lucyWorkRoutes').default);
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const request=async(path='',id=a,method='GET',body)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/work${path}`,{method,headers:{'Content-Type':'application/json',...(id?{Authorization:'Bearer '+jwt.sign({id},process.env.JWT_SECRET)}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,...await r.json()};};
 const work=require('../dist/services/lucyWorkService');let key=0;
 const create=async(prompt='Summarize',id=a,requestKey='key'+(++key))=>request('',id,'POST',{prompt,requestKey});
 const clear=()=>query('DELETE FROM lucy_background_work');
 await t.test('off by default and unauthenticated rejected',async()=>{
 delete process.env.LUCY_BACKGROUND_WORK_ENABLED;
 assert.equal((await request('',null)).status,401);assert.equal((await create()).status,503);assert.equal(await work.runLucyWorkOnce(),false);
 process.env.LUCY_BACKGROUND_WORK_ENABLED='true';
 });
 await t.test('request keys, validation, tenant and user isolation',async()=>{
 const one=await create('Summary',a,'same');assert.equal(one.status,202);assert.equal(one.job.status,'queued');assert.equal(one.job.requestKey,undefined);
 assert.equal((await create('Summary',a,'same')).job.id,one.job.id);assert.equal((await create('Different',a,'same')).status,409);
 assert.equal((await create('',a)).status,400);assert.equal((await create('x'.repeat(4001))).status,400);
 for(const id of [b,x]){assert.equal((await request('/'+one.job.id,id)).status,404);assert.equal((await request('/'+one.job.id+'/cancel',id,'POST')).status,404);assert.equal((await request('',id)).jobs.length,0);}
 await query("UPDATE users SET role='employee' WHERE id=$1",[a]);
 assert.equal((await request('/'+one.job.id+'/cancel',a,'POST')).status,404);
 assert.equal((await query('SELECT status FROM lucy_background_work WHERE id=$1',[one.job.id])).rows[0].status,'queued');
 await query("UPDATE users SET role='boss' WHERE id=$1",[a]);
 assert.equal((await request('/invalid')).status,404);await clear();
 });
 await t.test('claims are exclusive, queued and running cancellation suppress results',async()=>{
 let release;let checked;
 work.configureLucyWorkProcessor(async({shouldContinue})=>{checked=shouldContinue;await new Promise(r=>release=r);return{text:'must not publish'};});
 const one=await create();const pending=work.runLucyWorkOnce();while(!release)await new Promise(r=>setTimeout(r,5));
 assert.equal(await work.runLucyWorkOnce(),false);
 // A separate module instance has its own local slot, as another process would.
 const modulePath=require.resolve('../dist/services/lucyWorkService');const cached=require.cache[modulePath];delete require.cache[modulePath];
 const otherWorker=require(modulePath);require.cache[modulePath]=cached;
 otherWorker.configureLucyWorkProcessor(async()=>{throw Error('must not claim a leased job');});
 assert.equal(await otherWorker.runLucyWorkOnce(),false);
 assert.equal((await request('/'+one.job.id+'/cancel',a,'POST')).job.status,'cancelled');assert.equal(await checked(),false);
 release();await pending;assert.equal((await request('/'+one.job.id)).job.result,null);
 const two=await create();await request('/'+two.job.id+'/cancel',a,'POST');assert.equal(await work.runLucyWorkOnce(),false);await clear();
 });
 await t.test('completed and partial results, sanitized provider failure',async()=>{
 for(const status of ['completed','partial']){const one=await create();work.configureLucyWorkProcessor(async()=>({text:'answer',run:{status}}));assert.equal(await work.runLucyWorkOnce(),true);const r=await request('/'+one.job.id);assert.equal(r.job.status,status);assert.equal(r.job.result.text,'answer');}
 await query("UPDATE users SET role='employee' WHERE id=$1",[a]);assert.equal((await request()).jobs.length,0);await query("UPDATE users SET role='boss' WHERE id=$1",[a]);
 const one=await create();work.configureLucyWorkProcessor(async()=>{throw Error('SECRET provider detail');});await work.runLucyWorkOnce();const r=await request('/'+one.job.id);assert.equal(r.job.status,'failed');assert.ok(!r.job.error.includes('SECRET'));await clear();
 });
 await t.test('expired lease recovery bounded to three attempts; stale worker cannot commit',async()=>{
 const one=await create();await query("UPDATE lucy_background_work SET status='running',attempts=1,lease_token=gen_random_uuid(),lease_until=now()-interval '1 minute' WHERE id=$1",[one.job.id]);
 work.configureLucyWorkProcessor(async()=>({text:'recovered'}));await work.runLucyWorkOnce();assert.equal((await request('/'+one.job.id)).job.attempts,2);
 const two=await create();await query("UPDATE lucy_background_work SET status='running',attempts=3,lease_token=gen_random_uuid(),lease_until=now()-interval '1 minute' WHERE id=$1",[two.job.id]);assert.equal(await work.runLucyWorkOnce(),false);assert.equal((await request('/'+two.job.id)).job.status,'failed');
 const three=await create();let release;work.configureLucyWorkProcessor(async()=>{await new Promise(r=>release=r);return{text:'stale'};});const pending=work.runLucyWorkOnce();while(!release)await new Promise(r=>setTimeout(r,5));
 await query("UPDATE lucy_background_work SET lease_token=gen_random_uuid(),lease_until=now()-interval '1 minute' WHERE id=$1",[three.job.id]);release();await pending;assert.equal((await request('/'+three.job.id)).job.result,null);
 work.configureLucyWorkProcessor(async()=>({text:'fresh'}));await work.runLucyWorkOnce();assert.equal((await request('/'+three.job.id)).job.result.text,'fresh');await clear();
 });
 await t.test('inactive actors and company or role changes fail closed',async()=>{
 for(const change of ["is_active=false","company_id='"+d+"'","role='employee'"]){await create();await query('UPDATE users SET '+change+' WHERE id=$1',[a]);let calls=0;work.configureLucyWorkProcessor(async()=>{calls++;return{text:'no'};});assert.equal(await work.runLucyWorkOnce(),false);assert.equal(calls,0);assert.equal((await query('SELECT status FROM lucy_background_work')).rows[0].status,'failed');await query("UPDATE users SET is_active=true,company_id=$2,role='boss' WHERE id=$1",[a,c]);await clear();}
 const one=await create();work.configureLucyWorkProcessor(async({shouldContinue})=>{await query('UPDATE users SET is_active=false WHERE id=$1',[a]);assert.equal(await shouldContinue(),false);return{text:'no'};});await work.runLucyWorkOnce();assert.equal((await request()).status,401);await query('UPDATE users SET is_active=true WHERE id=$1',[a]);assert.equal((await request('/'+one.job.id)).job.status,'failed');await clear();
 });
 await t.test('active and rolling daily limits',async()=>{
 for(let i=0;i<10;i++)assert.equal((await create()).status,202);assert.equal((await create()).status,429);
 for(let batch=0;batch<4;batch++){await query("UPDATE lucy_background_work SET status='completed'");for(let i=0;i<10;i++)assert.equal((await create()).status,202);}
 await query("UPDATE lucy_background_work SET status='completed'");assert.equal((await create()).status,429);
 });
 await t.test('stop drains a timed-out processor and prevents further claims during drain',async()=>{
 await clear();const first=await create();const second=await create();
 let release;let check;let calls=0;
 work.configureLucyWorkProcessor(async({shouldContinue})=>{calls++;check=shouldContinue;await new Promise(r=>release=r);return{text:'late'};});
 const originalTimeout=global.setTimeout;
 global.setTimeout=(fn,ms,...args)=>originalTimeout(fn,ms===90000?20:ms,...args);
 try {
 work.startLucyWorkWorker();while(!release)await new Promise(r=>originalTimeout(r,5));
 while((await request('/'+first.job.id)).job.status==='running')await new Promise(r=>originalTimeout(r,5));
 assert.equal((await request('/'+first.job.id)).job.status,'failed');
 let stopped=false;const stop=work.stopLucyWorkWorker().then(()=>{stopped=true;});
 await new Promise(r=>originalTimeout(r,10));assert.equal(stopped,false);assert.equal(await check(),false);
 work.startLucyWorkWorker();assert.equal(await work.runLucyWorkOnce(),false);assert.equal(calls,1);
 assert.equal((await request('/'+second.job.id)).job.status,'queued');
 release();await stop;assert.equal(stopped,true);
 assert.equal(await work.runLucyWorkOnce(),false); // Explicit start is required after stop.
 work.configureLucyWorkProcessor(async()=>({text:'restarted'}));work.startLucyWorkWorker();
 while((await request('/'+second.job.id)).job.status!=='completed')await new Promise(r=>originalTimeout(r,5));
 await work.stopLucyWorkWorker();
 } finally {global.setTimeout=originalTimeout;if(release)release();await work.stopLucyWorkWorker();}
 });
 } finally {if(server)await new Promise(r=>server.close(r));pool.query=original.query;pool.connect=original.connect;await db.close();delete process.env.LUCY_BACKGROUND_WORK_ENABLED;}
});
