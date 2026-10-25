const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const {pool}=require('../dist/config/database');
const {isPublicSubscriptionPath}=require('../dist/middleware/trialMiddleware');
const {requireOwner}=require('../dist/routes/ownerOperationsRoutes');
const {runOwnerOperationsTick}=require('../dist/services/ownerOperationsService');
const db=new PGlite(); let requests=0; let lastInput;
const originalFetch=global.fetch;
const owner='00000000-0000-4000-8000-000000000001';
before(async()=>{
 await db.exec(`CREATE TABLE platform_support_agents(id uuid primary key,role text,is_active boolean);
 INSERT INTO platform_support_agents VALUES('${owner}','owner',true);
 CREATE TABLE companies(subscription_status text);
 CREATE TABLE support_tickets(id text,status text,priority text);
 CREATE TABLE platform_support_messages(ticket_id text,sender_type text,message text,created_at timestamptz default now());
 CREATE TABLE diagnostic_snapshots(source text,status text,metrics jsonb);
 CREATE TABLE system_incidents(id uuid,status text,component text,severity text,summary text,details jsonb,occurrences integer,first_seen_at timestamptz,last_seen_at timestamptz);`);
 await db.exec(fs.readFileSync('migrations/20261024_owner_operations.sql','utf8'));
 pool.query=async(sql,args)=>{const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows||r.rows.length};};
 pool.connect=async()=>({query:async(sql,args)=>{
 if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:true}]};
 if(sql.includes('pg_advisory_unlock'))return {rows:[]};
 return pool.query(sql,args);
 },release:()=>{}});
 process.env.OPENAI_API_KEY='unit-test-key-not-real';
 global.fetch=async(url,options)=>{requests++;const body=JSON.parse(options.body);lastInput=JSON.parse(body.input);assert.equal(body.store,false);assert.equal(body.tools,undefined);
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
test('ticket drafts read conversation but never send messages',async()=>{
 await db.query("UPDATE owner_operations_jobs SET status='cancelled' WHERE status='queued'");
 await db.query("INSERT INTO support_tickets VALUES('ticket-1','open','normal')");
 await db.query("INSERT INTO platform_support_messages(ticket_id,sender_type,message) VALUES('ticket-1','user','How do I view my jobs?')");
 await db.query("INSERT INTO owner_operations_jobs(owner_id,department,instruction,ticket_id) VALUES($1,'support','Draft reply','ticket-1')",[owner]);
 await runOwnerOperationsTick();
 assert.equal(lastInput.ticketContext.ticketId,'ticket-1');
 assert.equal(lastInput.ticketContext.messages[0].message,'How do I view my jobs?');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM platform_support_messages')).rows[0].n,1);
 assert.equal(requests,2);
});
test('closed tickets fail without a model call',async()=>{
 await db.query("UPDATE support_tickets SET status='resolved'");
 await db.query("INSERT INTO owner_operations_jobs(owner_id,department,instruction,ticket_id) VALUES($1,'support','Draft reply','ticket-1')",[owner]);
 await runOwnerOperationsTick();assert.equal(requests,2);
 assert.equal((await db.query("SELECT count(*)::int AS n FROM owner_operations_jobs WHERE ticket_id='ticket-1' AND status='failed'")).rows[0].n,1);
});
test('incident investigations receive the matching technical evidence without customer identifiers',async()=>{
 const id='00000000-0000-4000-8000-000000000002';
 await db.query("INSERT INTO system_incidents(id,status,component,severity,summary,details) VALUES($1,'open','mobile-ui','critical','Released recorder',$2)",[id,JSON.stringify({userId:'private-user',context:{platform:'android',appVersion:'1.2.7',buildVersion:'8',componentStack:'RecorderScreen',token:'private-token'}})]);
 await db.query("INSERT INTO owner_operations_jobs(owner_id,department,instruction,incident_id) VALUES($1,'it','Investigate',$2)",[owner,id]);
 await runOwnerOperationsTick();
 assert.equal(lastInput.incidentContext.context.buildVersion,'8');
 assert.equal(lastInput.incidentContext.context.componentStack,'RecorderScreen');
 assert.equal(JSON.stringify(lastInput).includes('private-user'),false);
 assert.equal(JSON.stringify(lastInput).includes('private-token'),false);
});
test('daily budget includes failures and prevents further calls',async()=>{
 await db.query("INSERT INTO owner_operations_jobs(owner_id,department,instruction,status,started_at) SELECT $1,'it','test','failed',now() FROM generate_series(1,12)",[owner]);
 await runOwnerOperationsTick();assert.equal(requests,3);
});

test('owner APIs use dedicated authentication rather than customer subscription tokens',()=>{
 for(const path of ['/api/owner-operations','/api/owner-operations/jobs','/api/owner-operations/schedules/it'])assert.equal(isPublicSubscriptionPath({method:'GET',originalUrl:path}),true);
 assert.equal(isPublicSubscriptionPath({method:'GET',originalUrl:'/api/owner-operations-other'}),false);
});
