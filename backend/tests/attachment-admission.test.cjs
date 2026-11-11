const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const express = require('express'), jwt = require('jsonwebtoken');
const { PGlite } = require('@electric-sql/pglite');
process.env.TS_NODE_PROJECT = path.join(__dirname,'../tsconfig.json');
process.env.JWT_SECRET = 'isolated-attachment-tests';
require('ts-node/register/transpile-only');
let db, server, base, actorReads, afterAdmission, providerCalls, saved, deleted;
const uploadDir=path.join(__dirname,'../uploads/attachments');
let initialFiles;
async function waitForCleanup() {
 for(let attempt=0;attempt<100;attempt++) {
  if(JSON.stringify(fs.readdirSync(uploadDir).sort())===JSON.stringify(initialFiles))return;
  await new Promise(r=>setTimeout(r,10));
 }
 assert.deepEqual(fs.readdirSync(uploadDir).sort(),initialFiles,'fixture attachment files must be cleaned up');
}
const {pool}=require('../src/config/database');
pool.query=async(sql,args)=>{
 if (/SELECT id, company_id, role FROM users/.test(sql)) {
  actorReads++;
  if(actorReads===1)assert.deepEqual(fs.readdirSync(uploadDir).sort(),initialFiles,'authentication must precede multipart disk writes');
  if(actorReads===2 && afterAdmission) await db.exec(afterAdmission);
 }
 const r=await db.query(sql,args);return {...r,rowCount:r.rows.length||r.affectedRows||0};
};
const stub=(file,exports)=>{const id=require.resolve(file);require.cache[id]={id,filename:id,loaded:true,exports};};
stub('../src/services/cloudStorageService',{uploadAttachment:async(local,folder)=>{providerCalls.push({local,folder,bytes:fs.readFileSync(local,'utf8')});return 'https://example.test/fixture';}});
stub('../src/services/attachmentService',{
 saveAttachment:async(...args)=>{saved.push(args);return {id:'attachment'};},
 listAttachments:async()=>[],deleteAttachment:async(...args)=>{deleted.push(args);},
});
before(async()=>{
 db=new PGlite();await db.exec('CREATE TABLE users(id TEXT,company_id TEXT,role TEXT,is_active BOOLEAN); CREATE TABLE projects(id TEXT,company_id TEXT)');
 const app=express();app.use('/attachments',require('../src/routes/attachmentRoutes').default);
 initialFiles=fs.readdirSync(uploadDir).sort();
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`;
});
beforeEach(async()=>{
 // Route cleanup is asynchronous; assert eventual removal rather than sleeping a fixed interval.
 await waitForCleanup();
 actorReads=0;afterAdmission=null;providerCalls=[];saved=[];deleted=[];
 await db.exec("TRUNCATE users,projects; INSERT INTO users VALUES ('active','a','employee',TRUE),('inactive','a','manager',FALSE),('legacy','a','employee',NULL); INSERT INTO projects VALUES ('ours','a'),('foreign','b');");
});
after(async()=>{await waitForCleanup();await new Promise(r=>server.close(r));await db.close();await pool.end();});
const token=id=>jwt.sign({id},process.env.JWT_SECRET);
async function upload(id='active',projectId='ours',rawToken){
 const form=new FormData();form.append('projectId',projectId);form.append('file',new Blob(['attachment fixture'],{type:'text/plain'}),'fixture.txt');
 const auth=rawToken===undefined?(id?token(id):null):rawToken;
 const r=await fetch(base+'/attachments/upload',{method:'POST',headers:auth?{Authorization:'Bearer '+auth}:{},body:form});
 return {status:r.status,data:await r.json()};
}
test('anonymous, invalid-token and inactive uploads never parse a file or call storage',async()=>{
 for(const [id,raw] of [[null,undefined],['active','invalid-token'],['inactive',undefined]]){
  actorReads=0;const r=await upload(id,'ours',raw);assert.equal(r.status,401);assert.equal(actorReads,id==='inactive'?1:0);
  assert.deepEqual(fs.readdirSync(uploadDir).sort(),initialFiles);assert.equal(providerCalls.length,0);assert.equal(saved.length,0);
 }
});
test('active and legacy-null accounts retain existing company-target upload access',async()=>{
 for(const id of ['active','legacy']){
  actorReads=0;const r=await upload(id);assert.equal(r.status,201);assert.equal(actorReads,2);
  assert.equal(providerCalls.at(-1).bytes,'attachment fixture');assert.equal(saved.at(-1)[0],'a');assert.equal(saved.at(-1)[1],id);
  await waitForCleanup();
 }
});
test('deactivation or company reassignment during multipart receipt rejects before provider work',async()=>{
 for(const change of ["is_active=FALSE","company_id='b'"]){
  await db.exec("UPDATE users SET is_active=TRUE,company_id='a' WHERE id='active'");actorReads=0;afterAdmission=`UPDATE users SET ${change} WHERE id='active'`;
  assert.equal((await upload()).status,401);assert.equal(actorReads,2);assert.equal(providerCalls.length,0);assert.equal(saved.length,0);
  await waitForCleanup();
 }
});
test('cross-company attachment targets still reject before provider work',async()=>{
 assert.equal((await upload('active','foreign')).status,400);assert.equal(providerCalls.length,0);assert.equal(saved.length,0);
});
test('inactive accounts cannot list or delete attachments',async()=>{
 for(const [method,route] of [['GET','?projectId=ours'],['DELETE','/attachment']]){
  actorReads=0;const r=await fetch(base+'/attachments'+route,{method,headers:{Authorization:'Bearer '+token('inactive')}});
  assert.notEqual(r.status,200);
 }
 assert.equal(deleted.length,0);
});
