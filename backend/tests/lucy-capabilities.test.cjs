// The route authorization tests use the same fake model for both adapters.
require('../dist/services/lucyBackgroundInference').lucyBackgroundResponse = request => require('../dist/services/lucyInference').lucyResponse(request);
require('./fixtures/lucy-funded-processor.cjs');
const {test,before,after,beforeEach,afterEach}=require('node:test');
let backgroundFlag;
beforeEach(context=>{backgroundFlag=process.env.LUCY_BACKGROUND_WORK_ENABLED;if(context.name.startsWith('background'))process.env.LUCY_BACKGROUND_WORK_ENABLED='true';});
afterEach(()=>{if(backgroundFlag===undefined)delete process.env.LUCY_BACKGROUND_WORK_ENABLED;else process.env.LUCY_BACKGROUND_WORK_ENABLED=backgroundFlag;});
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const express=require('express');
const jwt=require('jsonwebtoken');
process.env.JWT_SECRET='lucy-isolated-test-only';
const {pool}=require('../dist/config/database');
const inference=require('../dist/services/lucyInference');
const {searchLucyWork}=require('../dist/services/lucyWorkSearch');
const db=new PGlite();let server,base;
const id=n=>`00000000-0000-4000-a000-${String(n).padStart(12,'0')}`;
const company=id(1),other=id(2),owner=id(11),employee=id(12),coworker=id(13),outsider=id(14);
const actor=(user=owner,tenant=company,role='owner')=>({id:user,company_id:tenant,role});
const query=async(sql,values)=>{const result=await db.query(sql,values);return {rows:result.rows,rowCount:result.rows.length||result.affectedRows||0};};
const request=async(path,user=owner,message)=>{
  const response=await fetch(base+path,{method:message===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(user?{Authorization:'Bearer '+jwt.sign({id:user},process.env.JWT_SECRET)}:{})},...(message===undefined?{}:{body:JSON.stringify({message})})});
  return {status:response.status,data:await response.json()};
};
before(async()=>{
  await db.exec(`
    CREATE TABLE companies(id uuid primary key,is_active boolean default true,subscription_status text default 'active',subscription_tier text default 'professional',subscription_provider text,subscription_current_period_end timestamptz,subscription_expires_at timestamptz);
    CREATE TABLE users(id uuid primary key,company_id uuid,role text,is_active boolean default true,must_change_password boolean default false,full_name text,first_name text,last_name text,email text);
    CREATE TABLE projects(id uuid primary key,company_id uuid,name text,client_name text,address text,status text);
    CREATE TABLE tasks(id uuid primary key default gen_random_uuid(),company_id uuid,assigned_to uuid,description text,status text,created_at timestamptz default now());
    CREATE TABLE shifts(id uuid primary key,project_id uuid,company_id uuid,name text,date date,start_time time,end_time time);
    CREATE TABLE shift_assignments(shift_id uuid,user_id uuid);
    CREATE TABLE time_entries(id uuid primary key,project_id uuid,user_id uuid,company_id uuid,clock_in timestamptz,clock_out timestamptz,break_minutes numeric,approval_status text,payroll_locked_at timestamptz);
    CREATE TABLE pto_requests(id uuid primary key default gen_random_uuid(),user_id uuid,company_id uuid,start_date date,end_date date,type text,reason text,status text,approved_by uuid,created_at timestamptz default now());
    CREATE TABLE in_app_notifications(company_id uuid,user_id uuid,title text,message text,notification_type text,action_url text);
    CREATE TABLE approvals(id uuid primary key default gen_random_uuid(),user_id uuid,action_type text,action_payload jsonb,status text,created_at timestamptz default now(),resolved_at timestamptz);
    CREATE TABLE lucy_conversations(id uuid default gen_random_uuid(),user_id uuid,company_id uuid,role text,content text,created_at timestamptz default now());
    CREATE TABLE command_events(company_id uuid,actor_id uuid,kind text,title text,details jsonb);
  `);
  await query('INSERT INTO companies(id) VALUES($1),($2)',[company,other]);
  await db.exec(require('node:fs').readFileSync(require('node:path').join(__dirname,'../migrations/20261108_lucy_request_ledger.sql'),'utf8'));
  for(const [user,tenant,role,name] of [[owner,company,'owner','Owner'],[employee,company,'employee','Alex'],[coworker,company,'employee','Blair'],[outsider,other,'owner','Other']])await query('INSERT INTO users(id,company_id,role,full_name) VALUES($1,$2,$3,$4)',[user,tenant,role,name]);
  for(const [project,tenant,name] of [[id(21),company,'North site'],[id(22),company,'North secret'],[id(23),other,'North foreign']])await query("INSERT INTO projects(id,company_id,name,client_name,status) VALUES($1,$2,$3,'Customer','active')",[project,tenant,name]);
  for(const [task,tenant,user,description] of [[id(31),company,employee,'North assigned'],[id(32),company,coworker,'North coworker'],[id(33),other,outsider,'North foreign'],[id(34),company,employee,'100% complete']])await query("INSERT INTO tasks(id,company_id,assigned_to,description,status) VALUES($1,$2,$3,$4,'pending')",[task,tenant,user,description]);
  for(const [shift,project,name] of [[id(41),id(21),'North morning'],[id(42),id(22),'North restricted'],[id(43),id(23),'North foreign']])await query("INSERT INTO shifts(id,project_id,name,date,start_time,end_time) VALUES($1,$2,$3,'2026-11-09','09:00','17:00')",[shift,project,name]);
  await query('INSERT INTO shift_assignments VALUES($1,$2)',[id(41),employee]);
  pool.query=query;pool.connect=async()=>({query,release(){}});
  inference.lucyInferenceReady=()=>false;
  const app=express();app.use(express.json());app.use('/lucy',require('../dist/routes/lucyJarvisRoutes').default);
  app.use('/tasks',require('../dist/routes/taskRoutes').default);app.use('/pto',require('../dist/routes/ptoRoutes').default);app.use('/pto-history',require('../dist/routes/ptoHistoryRoutes').default);app.use('/approvals',require('../dist/routes/approvalRoutes').default);
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{await new Promise(resolve=>server.close(resolve));await db.close();await pool.end();});

test('cross-module search returns real records and excludes foreign tenant data',async()=>{
  const result=await searchLucyWork(actor(),{query:'North'});
  assert.equal(result.records.length,6);assert.deepEqual(new Set(result.records.map(x=>x.kind)),new Set(['project','task','schedule']));
  assert.ok(result.records.every(row=>!row.title.includes('foreign')));assert.equal(result.hasMore,false);
});
test('employee search is restricted to assigned tasks, shifts and related projects',async()=>{
  const result=await searchLucyWork(actor(employee,company,'employee'),{query:'North'});
  assert.deepEqual(result.records.map(x=>x.title).sort(),['North assigned','North morning','North site']);
  assert.equal(result.access,'assigned_work');
});
test('literal wildcard characters cannot widen a work search and limits are explicit',async()=>{
  const exact=await searchLucyWork(actor(),{query:'%'});assert.equal(exact.records.length,1);assert.equal(exact.records[0].title,'100% complete');
  const bounded=await searchLucyWork(actor(),{query:'North',limit:2});assert.equal(bounded.records.length,2);assert.equal(bounded.hasMore,true);
  const filtered=await searchLucyWork(actor(),{query:'North',scope:'tasks'});assert.equal(filtered.records.length,2);assert.ok(filtered.records.every(x=>x.kind==='task'));
  await assert.rejects(()=>searchLucyWork(actor(),{query:'North',limit:100}),/limit/);
});
test('capability discovery is authenticated, role-filtered, and honest about missing abilities',async()=>{
  assert.equal((await request('/lucy/capabilities',null)).status,401);
  const manager=await request('/lucy/capabilities');assert.equal(manager.status,200);assert.ok(manager.data.tools.some(x=>x.name==='create_task'));
  const worker=await request('/lucy/capabilities',employee);assert.equal(worker.status,200);assert.ok(!worker.data.tools.some(x=>x.name==='create_task'));assert.match(worker.data.limitations.join(' '),/No autonomous browser/);
});
test('work search and capability help run without any model provider',async()=>{
  const result=await request('/lucy',employee,'Find work: North');assert.equal(result.status,200);assert.equal(result.data.search.records.length,3);assert.doesNotMatch(result.data.text,/foreign|coworker/);assert.equal(result.data.evidence.sources.length,3);assert.ok(result.data.evidence.sources.every(source=>!source.title.includes('foreign')));
  const help=await request('/lucy',owner,'What can you do?');assert.equal(help.status,200);assert.match(help.data.text,/AI background research is disabled/);
  assert.equal((await request('/lucy',owner,'Find work:')).status,400);
});

test('history persistence failure cannot hide an already-created task receipt',async()=>{
  let calls=0;inference.lucyInferenceReady=()=>true;
  inference.lucyResponse=async()=>calls++===0?{output:[{type:'function_call',name:'create_task',call_id:'history-write',arguments:'{"description":"History failure task"}'}]}:{output:[],output_text:'Task created.'};
  pool.query=async(sql,params)=>{if(sql.startsWith('INSERT INTO lucy_conversations')&&params[1]==='assistant')throw new Error('Simulated history outage');return query(sql,params);};
  try {
    const result=await request('/lucy',owner,'Create a task: History failure task');assert.equal(result.status,200);assert.equal(result.data.actions[0].status,'completed');
    assert.equal((await query("SELECT * FROM tasks WHERE description='History failure task'")).rows.length,1);
  } finally {pool.query=query;inference.lucyInferenceReady=()=>false;}
});
test('actual Lucy route retains a successful task receipt when later inference fails',async()=>{
  let calls=0;inference.lucyInferenceReady=()=>true;
  inference.lucyResponse=async()=>{if(calls++===0)return {model:'mock',output:[{type:'function_call',name:'create_task',call_id:'task1',arguments:JSON.stringify({description:'Inspect scaffolding'})}]};throw new Error('Simulated provider outage');};
  const result=await request('/lucy',owner,'Create a task: Inspect scaffolding');
  assert.equal(result.status,200);assert.equal(result.data.run.status,'partial');assert.equal(result.data.run.stopReason,'provider_unavailable');
  assert.equal(result.data.actions[0].status,'completed');assert.match(result.data.text,/incomplete/);
  assert.equal((await query("SELECT * FROM tasks WHERE description='Inspect scaffolding'")).rows.length,1);
  inference.lucyInferenceReady=()=>false;
});
test('actual Lucy route does not expose manager-only tools to an employee',async()=>{
  let calls=0;inference.lucyInferenceReady=()=>true;
  inference.lucyResponse=async request=>{
    assert.ok(!request.tools.some(x=>x.name==='create_task'));
    if(calls++===0)return {output:[{type:'function_call',name:'create_task',call_id:'denied',arguments:'{"description":"Not authorized"}'}]};
    return {output:[],output_text:'Manager access is required.'};
  };
  const result=await request('/lucy',employee,'Create a task');assert.equal(result.status,200);assert.equal(result.data.actions[0].status,'failed');
  assert.equal((await query("SELECT * FROM tasks WHERE description='Not authorized'")).rows.length,0);
  inference.lucyInferenceReady=()=>false;
});

test('background processor enforces read-only tools even when provider asks to write',async()=>{
 const subscriptions=require('../dist/middleware/trialMiddleware');const original=subscriptions.loadSubscriptionActor;
 subscriptions.loadSubscriptionActor=async()=>({id:owner,companyId:company,role:'owner',name:'Owner',subscriptionStatus:'active'});
 let calls=0;inference.lucyInferenceReady=()=>true;
 inference.lucyResponse=async request=>{
  assert.ok(request.tools.every(tool=>!['create_task','request_pto','prepare_payroll','confirm_payroll_preparation'].includes(tool.name)));
  if(calls++===0)return {output:[{type:'function_call',name:'create_task',call_id:'background-write',arguments:'{"description":"Background must not write"}'}]};
  return {output:[],output_text:'This background task cannot change records.'};
 };
 try{
  const result=await require('../dist/routes/lucyJarvisRoutes').runLucyBackgroundResearch({actor:actor(),prompt:'Investigate project and create a task',shouldContinue:async()=>true});
  assert.equal(result.run.status,'partial');assert.equal((await query("SELECT * FROM tasks WHERE description='Background must not write'")).rows.length,0);
 }finally{subscriptions.loadSubscriptionActor=original;inference.lucyInferenceReady=()=>false;}
});
test('background processor refuses expired entitlement before any inference',async()=>{
 const subscriptions=require('../dist/middleware/trialMiddleware');const original=subscriptions.loadSubscriptionActor;
 subscriptions.loadSubscriptionActor=async()=>({id:owner,companyId:company,role:'owner',name:'Owner',subscriptionStatus:'inactive'});
 let calls=0;inference.lucyResponse=async()=>{calls++;throw new Error('Must not call');};
 try{await assert.rejects(()=>require('../dist/routes/lucyJarvisRoutes').runLucyBackgroundResearch({actor:actor(),prompt:'Investigate work',shouldContinue:async()=>true}),/access/);assert.equal(calls,0);}
 finally{subscriptions.loadSubscriptionActor=original;}
});
test('background processor uses actual scoped work search and revalidates each step',async()=>{
 const subscriptions=require('../dist/middleware/trialMiddleware');const original=subscriptions.loadSubscriptionActor;
 let checks=0,calls=0;subscriptions.loadSubscriptionActor=async()=>{checks++;return {id:employee,companyId:company,role:'employee',name:'Alex',subscriptionStatus:'active'};};
 inference.lucyInferenceReady=()=>true;
 inference.lucyResponse=async request=>{
  if(calls++===0)return {output:[{type:'function_call',name:'search_work_records',call_id:'background-read',arguments:'{"query":"North"}'}]};
  const output=JSON.parse(request.input.at(-1).output);assert.equal(output.result.data.records.length,3);assert.ok(output.result.data.records.every(record=>!record.title.includes('foreign')));
  return {output:[],output_text:'Found your three assigned North work records.'};
 };
 try{const result=await require('../dist/routes/lucyJarvisRoutes').runLucyBackgroundResearch({actor:actor(employee,company,'employee'),prompt:'Find North work',shouldContinue:async()=>true});assert.equal(result.run.status,'completed');assert.equal(result.evidence.sources.length,3);assert.equal(result.evidence.incomplete,false);assert.ok(checks>=4);}
 finally{subscriptions.loadSubscriptionActor=original;inference.lucyInferenceReady=()=>false;}
});
test('background research cannot publish after entitlement is revoked during final inference',async()=>{
 const subscriptions=require('../dist/middleware/trialMiddleware');const original=subscriptions.loadSubscriptionActor;
 let active=true;subscriptions.loadSubscriptionActor=async()=>({id:owner,companyId:company,role:'owner',name:'Owner',subscriptionStatus:active?'active':'inactive'});
 inference.lucyInferenceReady=()=>true;inference.lucyResponse=async()=>{active=false;return {output:[],output_text:'Private result'};};
 try{await assert.rejects(()=>require('../dist/routes/lucyJarvisRoutes').runLucyBackgroundResearch({actor:actor(),prompt:'Research work',shouldContinue:async()=>true}),/access/);}
 finally{subscriptions.loadSubscriptionActor=original;inference.lucyInferenceReady=()=>false;}
});

test('chat evidence records actual successful retrieval even when final model text invents citations',async()=>{
 let calls=0;inference.lucyInferenceReady=()=>true;
 inference.lucyResponse=async()=>calls++===0?{output:[{type:'function_call',name:'search_work_records',call_id:'evidence-read',arguments:'{"query":"North"}'}]}:{output:[],output_text:'See invented reference https://wrong.example/ref.'};
 try{const result=await request('/lucy',employee,'Look up North work');assert.equal(result.status,200);assert.equal(result.data.evidence.sources.length,3);assert.ok(result.data.evidence.sources.every(source=>!source.title.includes('foreign')));assert.doesNotMatch(JSON.stringify(result.data.evidence),/wrong.example|invented/);}
 finally{inference.lucyInferenceReady=()=>false;}
});

const tracked=async(message,requestId,extra={})=>{const response=await fetch(base+'/lucy',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+jwt.sign({id:owner},process.env.JWT_SECRET)},body:JSON.stringify({message,requestId,language:'en',channel:'text',...extra})});return {status:response.status,data:await response.json()};};
test('tracked chat retries replay a completed task receipt without another inference or write',async()=>{
 let calls=0;inference.lucyInferenceReady=()=>true;inference.lucyResponse=async()=>calls++===0?{output:[{type:'function_call',name:'create_task',call_id:'replay-task',arguments:'{"description":"Request replay task"}'}]}:{output:[],output_text:'Task created.'};
 try{const first=await tracked('Create Request replay task','chat-replay-1');assert.equal(first.status,200);assert.equal(first.data.request.state,'completed');assert.equal(first.data.actions[0].status,'completed');
 const retry=await tracked('Create Request replay task','chat-replay-1');assert.equal(retry.status,200);assert.equal(retry.data.request.replayed,true);assert.equal(calls,2);assert.equal((await query("SELECT * FROM tasks WHERE description='Request replay task'")).rows.length,1);
 assert.equal((await tracked('A different request','chat-replay-1')).status,409);
 const saved=await request('/lucy/requests/chat-replay-1');assert.equal(saved.data.response.body.actions[0].status,'completed');
 assert.equal((await request('/lucy/requests/chat-replay-1',employee)).status,404);
 }finally{inference.lucyInferenceReady=()=>false;}
});
test('unconfirmed final receipt persistence keeps actual action receipts but prevents reexecution',async()=>{
 let calls=0;inference.lucyInferenceReady=()=>true;inference.lucyResponse=async()=>calls++===0?{output:[{type:'function_call',name:'create_task',call_id:'uncertain-task',arguments:'{"description":"Uncertain receipt task"}'}]}:{output:[],output_text:'Task created.'};
 const originalConnect=pool.connect;pool.connect=async()=>({query:async(sql,params)=>{if(sql.includes("SET status='completed',response_body="))throw new Error('Simulated final save failure');return query(sql,params);},release(){}});
 try{const first=await tracked('Create Uncertain receipt task','chat-uncertain-1');assert.equal(first.status,200);assert.equal(first.data.request.state,'uncertain');assert.equal(first.data.actions[0].status,'completed');
 const retry=await tracked('Create Uncertain receipt task','chat-uncertain-1');assert.equal(retry.status,409);assert.equal(retry.data.request.state,'uncertain');assert.equal(calls,2);assert.equal((await query("SELECT * FROM tasks WHERE description='Uncertain receipt task'")).rows.length,1);
 }finally{pool.connect=originalConnect;inference.lucyInferenceReady=()=>false;}
});
test('permission revocation during inference prevents mutation and suppresses protected result',async()=>{
 let calls=0;inference.lucyInferenceReady=()=>true;inference.lucyResponse=async()=>{calls++;await query("UPDATE users SET role='employee' WHERE id=$1",[owner]);return {output:[{type:'function_call',name:'create_task',call_id:'revoked-task',arguments:'{"description":"Revoked actor task"}'}]};};
 try{const result=await tracked('Create Revoked actor task','chat-revoked-1');assert.equal(result.status,401);assert.equal(result.data.actions,undefined);assert.equal((await query("SELECT * FROM tasks WHERE description='Revoked actor task'")).rows.length,0);assert.equal(calls,1);}
 finally{await query("UPDATE users SET role='owner' WHERE id=$1",[owner]);inference.lucyInferenceReady=()=>false;}
});
test('provider unavailable after a tracked claim is explicitly uncertain and cannot silently restart',async()=>{
 inference.lucyInferenceReady=()=>false;const first=await tracked('An open ended question','chat-offline-1');assert.equal(first.status,503);assert.equal(first.data.request.state,'uncertain');
 const retry=await tracked('An open ended question','chat-offline-1');assert.equal(retry.status,409);assert.equal(retry.data.request.state,'uncertain');
});
test('concurrent tracked duplicate returns processing without a second inference or action',async()=>{
 let release,started;const ready=new Promise(resolve=>{started=resolve;});const wait=new Promise(resolve=>{release=resolve;});let calls=0;
 inference.lucyInferenceReady=()=>true;inference.lucyResponse=async()=>{if(calls++===0){started();await wait;return {output:[{type:'function_call',name:'create_task',call_id:'pending-task',arguments:'{"description":"Concurrent replay task"}'}]};}return {output:[],output_text:'Created.'};};
 try{const first=tracked('Create Concurrent replay task','chat-pending-1');await ready;
  const second=await tracked('Create Concurrent replay task','chat-pending-1');assert.equal(second.status,202);assert.equal(second.data.request.state,'processing');assert.equal(calls,1);
  release();const done=await first;assert.equal(done.data.request.state,'completed');assert.equal((await query("SELECT * FROM tasks WHERE description='Concurrent replay task'")).rows.length,1);
 }finally{release();inference.lucyInferenceReady=()=>false;}
});
test('authorization verification outage at final save suppresses receipts without rerunning committed action',async()=>{
 let calls=0;inference.lucyInferenceReady=()=>true;inference.lucyResponse=async()=>calls++===0?{output:[{type:'function_call',name:'create_task',call_id:'verify-task',arguments:'{"description":"Verification outage task"}'}]}:{output:[],output_text:'Created.'};
 const originalConnect=pool.connect;pool.connect=async()=>{if(calls>=2)throw new Error('Simulated unavailable actor check');return originalConnect();};
 try{const result=await tracked('Create Verification outage task','chat-verify-1');assert.equal(result.status,503);assert.equal(result.data.actions,undefined);assert.equal(result.data.evidence,undefined);assert.equal(result.data.request.state,'uncertain');assert.equal((await query("SELECT * FROM tasks WHERE description='Verification outage task'")).rows.length,1);
  pool.connect=originalConnect;const retry=await tracked('Create Verification outage task','chat-verify-1');assert.equal(retry.status,202);assert.equal(calls,2);
 }finally{pool.connect=originalConnect;inference.lucyInferenceReady=()=>false;}
});

test('company, entitlement and password-policy revocation during inference block the next mutation',async()=>{
 const cases=[['company',"UPDATE companies SET is_active=false WHERE id=$1",company,401],['entitlement',"UPDATE companies SET subscription_status='inactive' WHERE id=$1",company,402],['password',"UPDATE users SET must_change_password=true WHERE id=$1",owner,403]];
 for(const [name,sql,target,status] of cases){
  let calls=0;inference.lucyInferenceReady=()=>true;inference.lucyResponse=async()=>{calls++;await query(sql,[target]);return {output:[{type:'function_call',name:'create_task',call_id:'company-revocation',arguments:JSON.stringify({description:'Forbidden '+name})}]};};
  try{const result=await tracked('Create Forbidden '+name,'revocation-'+name);assert.equal(result.status,status,JSON.stringify(result));assert.equal(result.data.actions,undefined);assert.equal((await query('SELECT * FROM tasks WHERE description=$1',['Forbidden '+name])).rows.length,0);assert.equal(calls,1);}
  finally{await query("UPDATE companies SET is_active=true,subscription_status='active' WHERE id=$1",[company]);await query('UPDATE users SET must_change_password=false WHERE id=$1',[owner]);inference.lucyInferenceReady=()=>false;}
 }
});
test('completed stored receipts are withheld when company entitlement is later revoked',async()=>{
 const first=await tracked('What can you do?','entitled-replay');assert.equal(first.data.request.state,'completed');await query("UPDATE companies SET subscription_status='inactive' WHERE id=$1",[company]);
 try{assert.equal((await tracked('What can you do?','entitled-replay')).status,402);const saved=await request('/lucy/requests/entitled-replay');assert.equal(saved.status,402);assert.equal(saved.data.response,undefined);}
 finally{await query("UPDATE companies SET subscription_status='active' WHERE id=$1",[company]);}
});

test('simultaneous final-save failure and entitlement revocation cannot expose fallback receipts',async()=>{
 let calls=0,failed=false;inference.lucyInferenceReady=()=>true;inference.lucyResponse=async()=>calls++===0?{output:[{type:'function_call',name:'create_task',call_id:'fallback-revoked',arguments:'{"description":"Fallback revoked task"}'}]}:{output:[],output_text:'Created.'};
 const originalConnect=pool.connect;pool.connect=async()=>({query:async(sql,params)=>{
  if(sql.includes("SET status='completed',response_body=")){failed=true;throw new Error('Simulated save failure');}
  const result=await query(sql,params);if(sql==='ROLLBACK'&&failed){failed=false;await query("UPDATE companies SET subscription_status='inactive' WHERE id=$1",[company]);}return result;
 },release(){}});
 try{const result=await tracked('Create Fallback revoked task','chat-fallback-revoked');assert.equal(result.status,402);assert.equal(result.data.actions,undefined);assert.equal(result.data.evidence,undefined);assert.equal((await query("SELECT * FROM tasks WHERE description='Fallback revoked task'")).rows.length,1);}
 finally{pool.connect=originalConnect;await query("UPDATE companies SET subscription_status='active' WHERE id=$1",[company]);inference.lucyInferenceReady=()=>false;}
 const retry=await tracked('Create Fallback revoked task','chat-fallback-revoked');assert.equal(retry.status,409);assert.equal(calls,2);
});


test('capabilities and help distinguish independently enabled records, briefings and AI research',async()=>{
 const savedAI=process.env.LUCY_BACKGROUND_WORK_ENABLED,savedRecords=process.env.LUCY_RECORD_SEARCH_ENABLED,savedBriefing=process.env.LUCY_WORK_BRIEFING_ENABLED;
 const response=inference.lucyResponse;let calls=0;inference.lucyResponse=async()=>{calls++;throw new Error('Help must not call a provider');};
 try{
  for(const [ai,records] of [[false,true],[true,true],[true,false],[false,false]])for(const briefing of [false,true]){
   process.env.LUCY_BACKGROUND_WORK_ENABLED=String(ai);process.env.LUCY_RECORD_SEARCH_ENABLED=String(records);process.env.LUCY_WORK_BRIEFING_ENABLED=String(briefing);
   const capabilities=(await request('/lucy/capabilities')).data;
   assert.equal(capabilities.backgroundResearch,ai);assert.equal(capabilities.backgroundRecordSearch,records);assert.equal(capabilities.backgroundWorkBriefing,briefing);assert.deepEqual(capabilities.workModes,{ai_research:ai,record_search:records,work_briefing:briefing});
   assert.equal(capabilities.limitations.some(value=>value==='AI background research is disabled for this deployment'),!ai);
   assert.equal(capabilities.limitations.some(value=>value==='Saved company-record search is disabled for this deployment'),!records);
   assert.equal(capabilities.limitations.some(value=>value==='Saved work briefings are disabled for this deployment'),!briefing);
   const help=(await request('/lucy',owner,'What can you do?')).data;assert.deepEqual(help.capabilities.workModes,capabilities.workModes);assert.match(help.text,/This chat does not start background jobs/);
   assert.match(help.text,records?/you can save company-record searches without AI/:/saved company-record search is currently disabled/);
   assert.match(help.text,ai?/AI background research is also enabled there/:/AI background research is currently disabled/);
   assert.match(help.text,briefing?/request a model-free work briefing/:/Saved work briefings are currently disabled/);
  }
  assert.equal(calls,0);
 }finally{
  inference.lucyResponse=response;
  if(savedAI===undefined)delete process.env.LUCY_BACKGROUND_WORK_ENABLED;else process.env.LUCY_BACKGROUND_WORK_ENABLED=savedAI;
  if(savedRecords===undefined)delete process.env.LUCY_RECORD_SEARCH_ENABLED;else process.env.LUCY_RECORD_SEARCH_ENABLED=savedRecords;
  if(savedBriefing===undefined)delete process.env.LUCY_WORK_BRIEFING_ENABLED;else process.env.LUCY_WORK_BRIEFING_ENABLED=savedBriefing;
 }
});

test('chat instructions describe panel modes honestly without a background-job tool',async()=>{
 const response=inference.lucyResponse,ready=inference.lucyInferenceReady;
 const savedAI=process.env.LUCY_BACKGROUND_WORK_ENABLED,savedRecords=process.env.LUCY_RECORD_SEARCH_ENABLED;
 try{
  delete process.env.LUCY_BACKGROUND_WORK_ENABLED;delete process.env.LUCY_RECORD_SEARCH_ENABLED;inference.lucyInferenceReady=()=>true;
  inference.lucyResponse=async input=>{
   assert.match(input.instructions,/you can save company-record searches without AI/);assert.match(input.instructions,/AI background research is currently disabled/);assert.match(input.instructions,/This chat does not start background jobs/);
   assert.ok(input.tools.every(tool=>!/(background|create_work|record_search)/.test(tool.name)));
   return {output:[],output_text:'Use Tasks and preferences for a saved record search.'};
  };
  assert.equal((await request('/lucy',owner,'How can I save a record search?')).status,200);
 }finally{
  inference.lucyResponse=response;inference.lucyInferenceReady=ready;
  if(savedAI===undefined)delete process.env.LUCY_BACKGROUND_WORK_ENABLED;else process.env.LUCY_BACKGROUND_WORK_ENABLED=savedAI;
  if(savedRecords===undefined)delete process.env.LUCY_RECORD_SEARCH_ENABLED;else process.env.LUCY_RECORD_SEARCH_ENABLED=savedRecords;
 }
});


test('background processor pins provider before authorization awaits and withholds changed-provider results',async()=>{
 const subscriptions=require('../dist/middleware/trialMiddleware');const original=subscriptions.loadSubscriptionActor;const originalModel=process.env.LUCY_BACKGROUND_LLM_MODEL;
 let calls=0;inference.lucyResponse=async()=>{calls++;return{output:[],output_text:'Must not publish'};};
 subscriptions.loadSubscriptionActor=async()=>{process.env.LUCY_BACKGROUND_LLM_MODEL='replacement';return{id:owner,companyId:company,role:'owner',name:'Owner',subscriptionStatus:'active'};};
 try{await assert.rejects(()=>require('../dist/routes/lucyJarvisRoutes').runLucyBackgroundResearch({actor:actor(),prompt:'Read records',shouldContinue:async()=>true}),/access/);assert.equal(calls,0);}
 finally{subscriptions.loadSubscriptionActor=original;process.env.LUCY_BACKGROUND_LLM_MODEL=originalModel;}
});
test('background processor refuses temporary-password restriction before inference even when directly invoked',async()=>{
 const subscriptions=require('../dist/middleware/trialMiddleware');const original=subscriptions.loadSubscriptionActor;let calls=0;
 subscriptions.loadSubscriptionActor=async()=>({id:owner,companyId:company,role:'owner',name:'Owner',subscriptionStatus:'active',mustChangePassword:true});inference.lucyResponse=async()=>{calls++;throw Error('Must not call');};
 try{await assert.rejects(()=>require('../dist/routes/lucyJarvisRoutes').runLucyBackgroundResearch({actor:actor(),prompt:'Read records',shouldContinue:async()=>true}),/access/);assert.equal(calls,0);}
 finally{subscriptions.loadSubscriptionActor=original;}
});
// These tests intentionally exercise malformed cross-company references, not only
// well-formed tenant fixtures. Provider responses are local stubs throughout.
const api=async(path,user=owner,method='GET',body)=>{
 const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+jwt.sign({id:user},process.env.JWT_SECRET)},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {status:response.status,data:await response.json()};
};
async function invokeTool(name,args,user=owner,extra={}) {
 const ready=inference.lucyInferenceReady,respond=inference.lucyResponse;let calls=0,outcome;
 inference.lucyInferenceReady=()=>true;
 inference.lucyResponse=async input=>{
  if(calls++===0)return {output:[{type:'function_call',name,call_id:'permission-tool',arguments:JSON.stringify(args)}]};
  outcome=JSON.parse(input.input.filter(item=>item.type==='function_call_output').at(-1).output);
  return {output:[],output_text:outcome.success?'Verified result.':'Action unavailable.'};
 };
 try {const response=await api('/lucy',user,'POST',{message:'Explicit customer request for '+name,...extra});return {...response,outcome,calls};}
 finally {inference.lucyInferenceReady=ready;inference.lucyResponse=respond;}
}

test('Lucy PTO uses real dates, bounded ranges and type validation before insertion',async()=>{
 const before=(await query('SELECT count(*) n FROM pto_requests')).rows[0].n;
 for(const args of [
  {start_date:'2027-02-30',end_date:'2027-03-02'},
  {start_date:'2027-01-01',end_date:'2028-01-02'},
  {start_date:'2027-03-02',end_date:'2027-03-01'},
  {start_date:'2027-03-01',end_date:'2027-03-02',leave_type:'automatic_approved'},
  {start_date:'2027-03-01',end_date:'2027-03-02',leave_type:''},
  {start_date:'2027-03-01',end_date:'2027-03-02',user_id:coworker},
 ]){const result=await invokeTool('request_pto',args,employee);assert.equal(result.status,200);assert.equal(result.outcome.success,false);}
 assert.equal((await query('SELECT count(*) n FROM pto_requests')).rows[0].n,before);
 const created=await invokeTool('request_pto',{start_date:'2027-03-01',end_date:'2027-03-02'},employee);
 assert.equal(created.outcome.success,true);assert.equal(created.outcome.result.data.type,'vacation');assert.equal(created.outcome.result.data.user_id,employee);assert.equal(created.outcome.result.data.company_id,company);assert.equal(created.outcome.result.data.status,'pending');
 const overlap=await invokeTool('request_pto',{start_date:'2027-03-02',end_date:'2027-03-03',leave_type:'sick'},employee);
 assert.equal(overlap.outcome.success,false);assert.match(overlap.outcome.error,/overlap/);
});

test('tracked Lucy PTO retries reuse their receipt and do not create a second request',async()=>{
 const extra={requestId:'pto-replay-hardening',language:'en',channel:'text'};
 const first=await invokeTool('request_pto',{start_date:'2027-04-01',end_date:'2027-04-03',leave_type:'personal'},owner,extra);
 assert.equal(first.outcome.success,true);assert.equal(first.data.request.state,'completed');
 const repeat=await invokeTool('request_pto',{start_date:'2027-04-01',end_date:'2027-04-03',leave_type:'personal'},owner,extra);
 assert.equal(repeat.data.request.replayed,true);assert.equal(repeat.calls,0);assert.deepEqual(repeat.data.actions,first.data.actions);
 assert.equal((await query('SELECT count(*) n FROM pto_requests WHERE user_id=$1 AND start_date=$2',[owner,'2027-04-01'])).rows[0].n,1);
 const changed=await api('/lucy',owner,'POST',{message:'A changed action',...extra});assert.equal(changed.status,409);
});

test('PTO transactional role recheck denies a changed actor after route verification',async()=>{
 const connect=pool.connect;let changed=false;
 pool.connect=async()=>({query:async(sql,params)=>{
  if(sql.startsWith('SELECT id FROM users')&&sql.includes('$3::text IS NULL')){changed=true;await query("UPDATE users SET role='manager' WHERE id=$1",[employee]);}
  return query(sql,params);
 },release(){}});
 try{const result=await invokeTool('request_pto',{start_date:'2027-05-01',end_date:'2027-05-02'},employee);assert.equal(changed,true);assert.equal(result.outcome.success,false);assert.equal((await query('SELECT id FROM pto_requests WHERE user_id=$1 AND start_date=$2',[employee,'2027-05-01'])).rows.length,0);}
 finally{pool.connect=connect;await query("UPDATE users SET role='employee' WHERE id=$1",[employee]);}
});

test('direct task creation accepts all manager aliases but rejects employees, foreign and inactive assignees',async()=>{
 for(const role of ['boss','owner','manager','admin']){
  await query('UPDATE users SET role=$1 WHERE id=$2',[role,owner]);
  const result=await api('/tasks',owner,'POST',{description:'Tenant role '+role,assigned_to:employee});assert.equal(result.status,201,JSON.stringify(result));assert.equal(result.data.task.company_id,company);assert.equal(result.data.task.assigned_to,employee);
 }
 await query("UPDATE users SET role='owner' WHERE id=$1",[owner]);
 assert.equal((await api('/tasks',employee,'POST',{description:'Forbidden employee creation'})).status,403);
 assert.equal((await api('/tasks',owner,'POST',{description:'Foreign assignee',assigned_to:outsider})).status,404);
 assert.equal((await api('/tasks',owner,'POST',{description:'Invalid assignee',assigned_to:{id:employee}})).status,400);
 await query('UPDATE users SET is_active=false WHERE id=$1',[coworker]);
 try{assert.equal((await api('/tasks',owner,'POST',{description:'Inactive assignee',assigned_to:coworker})).status,404);}
 finally{await query('UPDATE users SET is_active=true WHERE id=$1',[coworker]);}
 assert.equal((await query("SELECT * FROM tasks WHERE description IN ('Foreign assignee','Invalid assignee','Inactive assignee','Forbidden employee creation')")).rows.length,0);
 const own=await api('/tasks/'+id(31),employee,'PATCH',{status:'completed'});assert.equal(own.status,200);
 assert.equal((await api('/tasks/'+id(32),employee,'PATCH',{status:'completed'})).status,404);
 assert.equal((await api('/tasks/'+id(33),owner,'PATCH',{status:'completed'})).status,404);
 assert.equal((await api('/tasks/'+id(32),owner,'PATCH',{status:'in_progress'})).status,200);
});

test('Lucy task creation rechecks an assignee moved after name resolution and rolls back',async()=>{
 const connect=pool.connect;let moved=false;
 pool.connect=async()=>({query:async(sql,params)=>{
  if(sql.includes('WHERE id=ANY($1::uuid[])')){moved=true;await query('UPDATE users SET company_id=$1 WHERE id=$2',[other,coworker]);}
  return query(sql,params);
 },release(){}});
 try{const result=await invokeTool('create_task',{description:'Moved assignee must not create',employee:'Blair'});assert.equal(moved,true);assert.equal(result.outcome.success,false);assert.equal((await query("SELECT * FROM tasks WHERE description='Moved assignee must not create'")).rows.length,0);}
 finally{pool.connect=connect;await query('UPDATE users SET company_id=$1 WHERE id=$2',[company,coworker]);}
});

test('task list and Lucy reads never return a foreign assignee name from corrupt references',async()=>{
 await query("UPDATE users SET first_name='Foreign private',last_name='Person' WHERE id=$1",[outsider]);
 await query("INSERT INTO tasks(id,company_id,assigned_to,description,status) VALUES($1,$2,$3,'Broken assignee reference','pending')",[id(701),company,outsider]);
 const direct=await api('/tasks');assert.equal(direct.status,200);assert.doesNotMatch(JSON.stringify(direct.data),/Foreign private/);
 const lucy=await invokeTool('tasks',{});assert.equal(lucy.outcome.success,true);assert.doesNotMatch(JSON.stringify(lucy.outcome),/Foreign private/);
});

test('direct Lucy projects and search agree on employee scope and reject mismatched stored tenant links',async()=>{
 await query("INSERT INTO shifts(id,project_id,company_id,name,date,start_time,end_time) VALUES($1,$2,$3,'North corrupt shift',CURRENT_DATE,'09:00','17:00')",[id(702),id(22),other]);
 await query('INSERT INTO shift_assignments VALUES($1,$2)',[id(702),employee]);
 await query('INSERT INTO time_entries(id,project_id,user_id,company_id) VALUES($1,$2,$3,$4)',[id(703),id(22),employee,other]);
 const lucy=await invokeTool('projects',{},employee);assert.equal(lucy.outcome.success,true);assert.deepEqual(lucy.outcome.result.data.map(row=>row.id),[id(21)]);
 const search=await searchLucyWork(actor(employee,company,'employee'),{query:'North'});assert.ok(!search.records.some(row=>[id(22),id(702)].includes(row.id)));
 const manager=await invokeTool('projects',{});assert.equal(manager.outcome.success,true);assert.deepEqual(new Set(manager.outcome.result.data.map(row=>row.id)),new Set([id(21),id(22)]));
});

test('Lucy schedules filter foreign crew identities and shifts with inconsistent stored company',async()=>{
 await query('UPDATE shifts SET date=CURRENT_DATE WHERE id=$1',[id(41)]);
 await query('INSERT INTO shift_assignments VALUES($1,$2)',[id(41),outsider]);
 const result=await invokeTool('schedules',{days:1},employee);assert.equal(result.outcome.success,true,JSON.stringify(result.outcome));
 assert.ok(result.outcome.result.data.shifts.every(row=>row.id!==id(702)));
 assert.doesNotMatch(JSON.stringify(result.outcome.result.data),/Foreign private|North corrupt shift/);
 assert.ok(result.outcome.result.data.shifts.every(row=>row.employees.every(person=>person.id!==outsider)));
});

test('Lucy time entries suppress foreign project data and mismatched entry company',async()=>{
 await query('INSERT INTO time_entries(id,project_id,user_id,company_id,clock_in,clock_out) VALUES($1,$2,$3,$4,now()-interval \'1 hour\',now())',[id(704),id(23),employee,company]);
 await query('UPDATE time_entries SET clock_in=now()-interval \'1 hour\',clock_out=now() WHERE id=$1',[id(703)]);
 const result=await invokeTool('time_entries',{scope:'self',days:1},employee);assert.equal(result.outcome.success,true);assert.deepEqual(result.outcome.result.data.entries.map(row=>row.id),[id(704)]);assert.equal(result.outcome.result.data.entries[0].project_name,null);assert.doesNotMatch(JSON.stringify(result.outcome.result.data),/North foreign/);
});

test('PTO list, mine, history and Lucy exclude old-company or mismatched employee requests',async()=>{
 for(const [key,user,tenant] of [[705,employee,other],[706,outsider,company],[711,employee,null]])await query("INSERT INTO pto_requests(id,user_id,company_id,start_date,end_date,type,status) VALUES($1,$2,$3,'2027-06-01','2027-06-02','sick','pending')",[id(key),user,tenant]);
 for(const path of ['/pto','/pto/mine','/pto-history']){
  const result=await api(path,employee);assert.equal(result.status,200,JSON.stringify(result));assert.ok(result.data.requests.every(row=>![id(705),id(706),id(711)].includes(row.id)),path);
 }
 const manager=await api('/pto',owner);assert.equal(manager.status,200);assert.ok(manager.data.requests.some(row=>row.user_id===employee));assert.ok(manager.data.requests.every(row=>![id(705),id(706),id(711)].includes(row.id)));
 const lucy=await invokeTool('pto',{},employee);assert.equal(lucy.outcome.success,true);assert.ok(lucy.outcome.result.data.every(row=>![id(705),id(706),id(711)].includes(row.id)));
});

test('approval APIs cannot list, reject or execute proposals from a previous company or missing tenant',async()=>{
 for(const [key,payload] of [[707,{companyId:other}],[708,{}]])await query("INSERT INTO approvals(id,user_id,action_type,action_payload,status) VALUES($1,$2,'run_payroll',$3,'pending')",[id(key),owner,JSON.stringify(payload)]);
 const pending=await api('/approvals/pending');assert.equal(pending.status,200);assert.ok(pending.data.approvals.every(row=>![id(707),id(708)].includes(row.id)));
 for(const key of [707,708]){assert.equal((await api('/approvals/'+id(key)+'/reject',owner,'POST',{})).status,404);assert.equal((await api('/approvals/'+id(key)+'/approve',owner,'POST',{})).status,403);}
});

test('owner role can confirm a company-bound payroll proposal through the approval API',async()=>{
 const payroll=require('../dist/services/payrollGenerator'),calendar=require('../dist/services/lucyPayrollService');const generate=payroll.generatePayroll,resolve=calendar.resolveCompanyPayPeriod;let generated=0;
 payroll.generatePayroll=async(companyId,start,end,user)=>{assert.equal(companyId,company);assert.equal(user,owner);generated++;return {payrollId:id(710),employeeCount:1,totalHours:8,totalPay:100};};
 calendar.resolveCompanyPayPeriod=async()=>({start:'2027-07-01',end:'2027-07-02',label:'test period'});
 try{await query("INSERT INTO approvals(id,user_id,action_type,action_payload,status) VALUES($1,$2,'run_payroll',$3,'pending')",[id(709),owner,JSON.stringify({companyId:company,period:{start:'2027-07-01',end:'2027-07-02'}})]);
 const result=await api('/approvals/'+id(709)+'/approve',owner,'POST',{});assert.equal(result.status,200,JSON.stringify(result));assert.equal(generated,1);
 const replay=await api('/approvals/'+id(709)+'/approve',owner,'POST',{});assert.equal(replay.status,400);assert.equal(generated,1);
 }finally{payroll.generatePayroll=generate;calendar.resolveCompanyPayPeriod=resolve;}
});
