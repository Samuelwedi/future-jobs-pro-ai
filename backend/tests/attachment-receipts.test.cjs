const {test,before,beforeEach,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const express=require('express'),jwt=require('jsonwebtoken'),{PGlite}=require('@electric-sql/pglite');
process.env.TS_NODE_PROJECT=path.join(__dirname,'../tsconfig.json');process.env.JWT_SECRET='isolated-attachment-receipts';
require('ts-node/register/transpile-only');
const {pool}=require('../src/config/database');let db,server,base,uploads,provider,failComplete,failCommitAck,statements;
async function query(sql,args){statements.push(sql);if(failComplete&&sql.startsWith("UPDATE attachment_upload_receipts SET state='completed'"))throw Error('database completion unavailable');const r=await db.query(sql,args);if(sql==='COMMIT'&&failCommitAck)throw Error('commit acknowledgment lost');return {...r,rowCount:r.rows.length||r.affectedRows||0};}
pool.query=query;pool.connect=async()=>({query,release(){}});
const storageId=require.resolve('../src/services/cloudStorageService');require.cache[storageId]={id:storageId,filename:storageId,loaded:true,exports:{uploadAttachment:async()=>{uploads++;return provider();}}};
const key='attachment-fixture-key-001';
const migration=fs.readFileSync(path.join(__dirname,'../migrations/20261111_attachment_receipts.sql'),'utf8');
before(async()=>{
 db=new PGlite();await db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,company_id TEXT,role TEXT,is_active BOOLEAN);
 CREATE TABLE companies(id TEXT PRIMARY KEY,is_active BOOLEAN,subscription_status TEXT,subscription_tier TEXT,subscription_provider TEXT,subscription_current_period_end TIMESTAMPTZ,subscription_expires_at TIMESTAMPTZ);
 INSERT INTO companies VALUES('a',TRUE,'active','pro',NULL,NULL,NULL),('b',TRUE,'active','pro',NULL,NULL,NULL);
 CREATE TABLE projects(id TEXT PRIMARY KEY,company_id TEXT);CREATE TABLE tasks(id TEXT,company_id TEXT);
 CREATE TABLE time_entries(id TEXT,user_id TEXT);CREATE TABLE shifts(id TEXT,project_id TEXT,created_by TEXT);
 CREATE TABLE attachments(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),company_id TEXT,uploaded_by TEXT,
 shift_id TEXT,time_entry_id TEXT,project_id TEXT,task_id TEXT,subject_user_id TEXT,file_name TEXT,file_url TEXT,file_type TEXT,file_size BIGINT,category TEXT);`);
 await db.exec(migration);await db.exec(migration);
 const app=express();app.use('/attachments',require('../src/routes/attachmentRoutes').default);server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}/attachments`;
});
beforeEach(async()=>{uploads=0;failComplete=false;failCommitAck=false;statements=[];provider=async()=> 'https://example.test/stored';await db.exec(`TRUNCATE users,projects,tasks,time_entries,shifts,attachments,attachment_upload_receipts;
 INSERT INTO users VALUES('actor','a','employee',TRUE),('other','a','employee',TRUE),('foreign','b','employee',TRUE);
 INSERT INTO projects VALUES('project','a'),('other-project','a'),('foreign-project','b');
 INSERT INTO tasks VALUES('task','a');INSERT INTO time_entries VALUES('entry','actor');INSERT INTO shifts VALUES('shift','project','actor');`);});
after(async()=>{await new Promise(r=>server.close(r));await db.close();await pool.end();});
const headers=actor=>({Authorization:'Bearer '+jwt.sign({id:actor},process.env.JWT_SECRET)});
async function upload({actor='actor',requestKey=key,bytes='fixture bytes',name='fixture.txt',mime='text/plain',fields={projectId:'project'}}={}){
 const form=new FormData();if(requestKey!==null)form.append('requestKey',requestKey);for(const [k,v]of Object.entries(fields))form.append(k,v);form.append('file',new Blob([bytes],{type:mime}),name);
 const r=await fetch(base+'/upload',{method:'POST',headers:headers(actor),body:form});return {status:r.status,data:await r.json()};
}
async function status(actor='actor',requestKey=key){const r=await fetch(base+'/uploads/'+requestKey,{headers:headers(actor)});return {status:r.status,data:await r.json()};}
const count=async table=>(await db.query(`SELECT * FROM ${table}`)).rows.length;
const until=async condition=>{for(let i=0;i<200;i++){if(condition())return;await new Promise(r=>setTimeout(r,5));}throw Error('Fixture did not reach expected state');};
test('completed receipt survives a lost response and returns the same attachment without another provider call',async()=>{
 const first=await upload();assert.equal(first.status,201);assert.equal(first.data.requestKey,key);
 assert.deepEqual((await status()).data,first.data);assert.deepEqual((await upload()).data,first.data);
 assert.equal(uploads,1);assert.equal(await count('attachments'),1);assert.equal(await count('attachment_upload_receipts'),1);
 assert.ok(statements.includes('BEGIN'));assert.ok(statements.includes('COMMIT'));assert.ok(statements.some(s=>s.includes('FOR SHARE')));
 await db.exec(migration);assert.deepEqual((await status()).data,first.data);
});
test('simultaneous duplicate waits on the durable claim without repeating provider work',async()=>{
 let finish;provider=()=>new Promise(r=>finish=r);const first=upload();await until(()=>uploads===1);
 const duplicate=await upload();assert.equal(duplicate.status,202);assert.equal(duplicate.data.state,'processing');assert.equal(duplicate.data.retryAllowed,false);assert.equal(uploads,1);
 finish('https://example.test/stored');assert.equal((await first).status,201);assert.equal((await status()).status,200);assert.equal(await count('attachments'),1);
});
test('content, filename, target and category mismatches reject reuse without new provider work',async()=>{
 await upload();for(const change of [{bytes:'different'}, {name:'other.txt'}, {mime:'application/octet-stream'}, {fields:{projectId:'other-project'}}, {fields:{projectId:'project',category:'other'}}])assert.equal((await upload(change)).status,409);
 assert.equal(uploads,1);assert.equal(await count('attachments'),1);
});
test('provider failure remains uncertain and same-key repeats cannot start the provider again',async()=>{
 provider=async()=>{throw Error('ambiguous provider failure');};assert.equal((await upload()).status,500);
 const check=await status();assert.equal(check.status,202);assert.equal(check.data.state,'uncertain');assert.equal(check.data.retryAllowed,false);
 assert.equal((await upload()).status,202);assert.equal(uploads,1);assert.equal(await count('attachments'),0);
});
test('database completion failure rolls back attachment and leaves uncertainty instead of duplicate retry',async()=>{
 failComplete=true;assert.equal((await upload()).status,500);assert.equal(await count('attachments'),0);assert.ok(statements.includes('ROLLBACK'));
 failComplete=false;assert.equal((await status()).data.state,'uncertain');assert.equal((await upload()).status,202);assert.equal(uploads,1);
});
test('receipt reads are actor/tenant scoped and revalidate current target ownership',async()=>{
 await upload();assert.equal((await status('other')).status,404);assert.equal((await status('foreign')).status,404);
 await db.exec("UPDATE projects SET company_id='b' WHERE id='project'");assert.equal((await status()).status,403);
 await db.exec("UPDATE projects SET company_id='a' WHERE id='project'; UPDATE users SET is_active=FALSE WHERE id='actor'");assert.equal((await status()).status,401);
});
test('authorization or target changes during provider work prevent committing the attachment',async()=>{
 for(const change of ["UPDATE users SET is_active=FALSE WHERE id='actor'","UPDATE projects SET company_id='b' WHERE id='project'"]){
  await db.exec("UPDATE users SET is_active=TRUE WHERE id='actor'; UPDATE projects SET company_id='a' WHERE id='project'; TRUNCATE attachments,attachment_upload_receipts");
  provider=async()=>{await db.exec(change);return 'https://example.test/stored';};assert.equal((await upload()).status,500);assert.equal(await count('attachments'),0);
 }
});
test('deleted completed attachments are unavailable and cannot be resurrected by replay',async()=>{
 await upload();await db.exec('DELETE FROM attachments');assert.equal((await status()).status,410);assert.equal((await upload()).status,410);assert.equal(uploads,1);
});
test('missing/invalid keys never imply permission to retry; legacy clients retain existing upload path',async()=>{
 const missing=await status();assert.equal(missing.status,404);assert.equal(missing.data.retryAllowed,false);
 assert.equal((await upload({requestKey:'short'})).status,400);assert.equal(uploads,0);
 const legacy=await upload({requestKey:null});assert.equal(legacy.status,201);assert.equal(legacy.data.requestKey,undefined);assert.equal(await count('attachment_upload_receipts'),0);
});
test('all existing attachment target types work with receipt completion',async()=>{
 for(const fields of [{timeEntryId:'entry'},{shiftId:'shift'},{taskId:'task'},{subjectUserId:'actor'}]){
  const requestKey=key+'-'+Object.keys(fields)[0];const r=await upload({requestKey,fields});assert.equal(r.status,201);assert.equal((await status('actor',requestKey)).status,200);
 }
});
test('migration runner includes attachment schema and rolls back failed verification',async()=>{
 const {migrate}=require('../scripts/run-evidence-receipts-migration.cjs');const calls=[];
 await assert.rejects(migrate({query:async sql=>{calls.push(sql);if(sql.includes('FROM attachment_upload_receipts LIMIT 0'))throw Error('fixture failure');}}),/fixture failure/);
 assert.ok(calls.some(s=>s.includes('CREATE TABLE IF NOT EXISTS attachment_upload_receipts')));assert.equal(calls.at(-1),'ROLLBACK');
});
test('the same request key is isolated across actors and companies',async()=>{
 const a=await upload();const b=await upload({actor:'other'});const c=await upload({actor:'foreign',fields:{projectId:'foreign-project'}});
 assert.equal(a.status,201);assert.equal(b.status,201);assert.equal(c.status,201);
 assert.equal(new Set([a.data.attachment.id,b.data.attachment.id,c.data.attachment.id]).size,3);
 assert.equal(uploads,3);assert.equal(await count('attachment_upload_receipts'),3);
 assert.equal((await status('actor')).data.attachment.id,a.data.attachment.id);
 assert.equal((await status('other')).data.attachment.id,b.data.attachment.id);
 assert.equal((await status('foreign')).data.attachment.id,c.data.attachment.id);
});

test('lost COMMIT acknowledgment preserves the completed receipt and status recovers without reupload',async()=>{
 failCommitAck=true;const response=await upload();assert.equal(response.status,500);assert.equal(response.data.retryAllowed,false);
 failCommitAck=false;const recovered=await status();assert.equal(recovered.status,200);assert.equal(recovered.data.success,true);
 assert.equal(await count('attachments'),1);assert.deepEqual((await upload()).data,recovered.data);assert.equal(uploads,1);
});
test('attachment receipt preserves a UTF-8 original filename',async()=>{
 const name='École été.pdf';const result=await upload({name,fields:{projectId:'project',originalFileName:name}});assert.equal(result.status,201);assert.equal(result.data.attachment.file_name,name);
 assert.equal((await status()).data.attachment.file_name,name);
 assert.equal((await upload({name,fields:{projectId:'project',originalFileName:'Different.pdf'}})).status,409);
});
test('React Native encoded filename headers use exact UTF-8 field, preserving spaces and literal percent text',async()=>{
 for(const [index,name] of ['Work report.pdf','École été.pdf','a%20b.pdf','a b.pdf'].entries()){
  const requestKey=key+'-native-'+index;
  const result=await upload({requestKey,name:encodeURIComponent(name),fields:{projectId:'project',originalFileName:name}});
  assert.equal(result.status,201);assert.equal(result.data.attachment.file_name,name);
  assert.equal((await status('actor',requestKey)).data.attachment.file_name,name);
 }
});
test('explicit original filename is validated before claim or provider work',async()=>{
 for(const originalFileName of ['../escape.pdf','bad\nname.pdf','malware.exe','x'.repeat(256)+'.pdf']){
  const result=await upload({fields:{projectId:'project',originalFileName}});assert.equal(result.status,400);
 }
 assert.equal(uploads,0);assert.equal(await count('attachment_upload_receipts'),0);
});
