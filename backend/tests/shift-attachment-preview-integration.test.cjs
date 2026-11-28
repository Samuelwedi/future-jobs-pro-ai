const { test,before,after,beforeEach }=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs');
const express=require('express'),jwt=require('jsonwebtoken'),sharp=require('sharp');
const {PGlite}=require('@electric-sql/pglite');
process.env.TS_NODE_PROJECT=path.join(__dirname,'../tsconfig.json');
process.env.JWT_SECRET='synthetic-shift-preview';
require('ts-node/register/transpile-only');
const {pool}=require('../src/config/database');
const id=n=>'2f819544-e31c-493a-b11b-'+String(n).padStart(12,'0');
const [company,other,manager,primary,assigned,peer,outsider,project,shift,shift2]=Array.from({length:10},(_,n)=>id(n+1));
let db, server, base, original, uploads, fail;
const cloud=require.resolve('../src/services/cloudStorageService');
require.cache[cloud]={id:cloud,filename:cloud,loaded:true,exports:{
  uploadAttachment:async file=>{uploads.push(fs.readFileSync(file));return 'https://example.invalid/synthetic-original.png';}
}};
const readSql=file=>fs.readFileSync(path.join(__dirname,'../migrations',file),'utf8');
async function query(sql,args){
 if(fail && sql.includes(fail)) { fail=null; return db.query("SELECT 'force failed transaction'::uuid"); }
 const r=await db.query(sql,args);
 return {...r,rowCount:r.rows.length||r.affectedRows||0};
}
before(async()=>{
 db=new PGlite();
 await db.exec(`CREATE TABLE companies(id uuid PRIMARY KEY);
   CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,role text,is_active boolean);
   CREATE TABLE projects(id uuid PRIMARY KEY,company_id uuid,archived_at timestamptz);
   CREATE TABLE shifts(id uuid PRIMARY KEY,user_id uuid,project_id uuid,created_by uuid);
   CREATE TABLE shift_assignments(shift_id uuid,user_id uuid);
   CREATE TABLE time_entries(id uuid PRIMARY KEY);
   CREATE TABLE tasks(id uuid PRIMARY KEY);`);
 for(const f of ['20261111_attachment_schema.sql','20261111_attachment_receipts.sql','20261128_shift_attachment_previews.sql'])await db.exec(readSql(f));
 await db.exec(readSql('20261128_shift_attachment_previews.sql'));
 pool.query=query;pool.connect=async()=>({query,release(){}});
 const app=express();app.use('/api/attachments',require('../src/routes/attachmentRoutes').default);
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 base='http://127.0.0.1:'+server.address().port+'/api/attachments';
 original=await sharp({create:{width:640,height:240,channels:4,background:'#22779988'}}).png().toBuffer();
});
beforeEach(async()=>{
 process.env.SHIFT_ATTACHMENT_PREVIEWS_ENABLED='1';uploads=[];fail=null;
 await db.exec(`TRUNCATE companies,users,projects,shifts,shift_assignments,attachment_upload_receipts CASCADE;
   INSERT INTO companies VALUES ('${company}'),('${other}');
   INSERT INTO users VALUES ('${manager}','${company}','manager',TRUE),('${primary}','${company}','employee',TRUE),
    ('${assigned}','${company}','employee',TRUE),('${peer}','${company}','employee',TRUE),('${outsider}','${other}','manager',TRUE);
   INSERT INTO projects VALUES ('${project}','${company}',NULL);
   INSERT INTO shifts VALUES ('${shift}','${primary}','${project}','${manager}'),('${shift2}','${primary}','${project}','${manager}');
   INSERT INTO shift_assignments VALUES ('${shift}','${assigned}');`);
});
after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));if(db)await db.close();await pool.end();});
const headers=(actor=manager,tenant=actor===outsider?other:company)=>({'Authorization':'Bearer '+jwt.sign({id:actor},process.env.JWT_SECRET),'X-Project-Actor':actor,'X-Project-Company':tenant});
async function upload({actor=manager,key,name='attachment.png',media='image/png',bytes=original,target=shift,additional=false}={}){
 const form=new FormData();form.append('shiftId',target);
 if(additional)form.append('projectId',project);
 if(key)form.append('requestKey',key);
 form.append('file',new Blob([bytes],{type:media}),name);
 return fetch(base+'/upload',{method:'POST',headers:headers(actor),body:form});
}
const preview=(a,{actor=manager,tenant,s=shift}={})=>fetch(base+`/shift/${s}/file/${a}/preview`,{headers:headers(actor,tenant)});
const list=(actor=manager)=>fetch(base+`/shift/${shift}/files`,{headers:headers(actor)});
const count=async table=>(await db.query('SELECT count(*)::int n FROM '+table)).rows[0].n;
test('legacy and keyed upload stores only JPEG derivative; replay does not reupload or rerender',async()=>{
 for(const key of [undefined,'attachment-preview-fixture-0001']){
  const res=await upload({key});assert.equal(res.status,201);const body=await res.json();
  assert.equal(body.attachment.file_type,'image/png');assert.equal('jpeg' in body.attachment,false);assert.equal('preview_available' in body.attachment,false);
  const fetchPreview=await preview(body.attachment.id);
  assert.equal(fetchPreview.status,200);assert.match(fetchPreview.headers.get('cache-control'),/no-store/);
  const jpeg=Buffer.from(await fetchPreview.arrayBuffer());
  const metadata=await sharp(jpeg).metadata();
  assert.equal(metadata.format,'jpeg');assert.equal(metadata.hasAlpha,false);assert.equal(metadata.exif,undefined);
  assert.notDeepEqual(jpeg,original);
  if(key){ const retry=await upload({key});assert.equal(retry.status,200);assert.deepEqual(await retry.json(),body); }
 }
 assert.equal(uploads.length,2);assert.deepEqual(uploads,[original,original]);
 assert.equal(await count('attachments'),2);assert.equal(await count('shift_attachment_previews'),2);
 const files=(await (await list(primary)).json()).files;
 assert.equal(files.length,2);
 for(const f of files){assert.equal(f.preview_available,true);assert.deepEqual(Object.keys(f).sort(),['file_name','file_type','file_url','id','preview_available']);}
});
test('scope blocks other tenants and unassigned peers and is immediately re-evaluated',async()=>{
 const a=(await (await upload()).json()).attachment.id;
 assert.equal((await preview(a,{actor:primary})).status,200);
 assert.equal((await preview(a,{actor:assigned})).status,200);
 assert.equal((await preview(a,{actor:peer})).status,404);
 assert.equal((await preview(a,{actor:outsider})).status,404);
 assert.equal((await preview(a,{actor:manager,tenant:other})).status,404);
 assert.equal((await preview(a,{s:shift2})).status,404);
 assert.deepEqual((await (await list(peer)).json()).files,[]);
 await query('DELETE FROM shift_assignments WHERE user_id=$1',[assigned]);
 assert.equal((await preview(a,{actor:assigned})).status,404);
 await query('UPDATE attachments SET shift_id=$1 WHERE id=$2',[shift2,a]);
 assert.equal((await preview(a,{s:shift2})).status,404);
 await query('UPDATE attachments SET shift_id=$1 WHERE id=$2',[shift,a]);
 await query('UPDATE projects SET archived_at=now() WHERE id=$1',[project]);
 assert.equal((await preview(a)).status,404);
});
test('non-image, legacy row, mixed target and default-off can still open original only',async()=>{
 for(const testCase of [
  {name:'schedule.pdf',media:'application/pdf',bytes:Buffer.from('synthetic')},{name:'mismatch.png',bytes:Buffer.from('not png')},{additional:true},
 ]){
  const res=await upload(testCase);assert.equal(res.status,201);const a=(await res.json()).attachment.id;
  assert.equal((await preview(a)).status,404);
 }
 delete process.env.SHIFT_ATTACHMENT_PREVIEWS_ENABLED;
 const a=(await (await upload()).json()).attachment.id;
 process.env.SHIFT_ATTACHMENT_PREVIEWS_ENABLED='1';
 const files=(await (await list()).json()).files;
 assert.equal(files.length,3);assert.equal(files.find(f=>f.id===a).preview_available,false);
 assert.equal(await count('shift_attachment_previews'),0);
});
test('deletion cascades and a completed keyed upload does not recreate deleted previews',async()=>{
 const key='attachment-preview-fixture-0002';
 const a=(await (await upload({key})).json()).attachment.id;
 assert.equal((await fetch(base+'/'+a,{method:'DELETE',headers:headers()})).status,200);
 assert.equal(await count('shift_attachment_previews'),0);
 assert.equal((await upload({key})).status,410);
 assert.equal(uploads.length,1);
});
test('failure completing receipt rolls back derivative and attachment; preview-only fault leaves original and replay intact',async()=>{
 fail='UPDATE attachment_upload_receipts SET state=\'completed\'';
 const key='attachment-preview-fixture-0003';
 const failed=await upload({key});assert.equal(failed.status,500);assert.equal((await failed.json()).state,'uncertain');
 assert.equal(await count('attachments'),0);assert.equal(await count('shift_attachment_previews'),0);
 fail='INSERT INTO shift_attachment_previews';
 const k2='attachment-preview-fixture-0004';
 const res=await upload({key:k2});assert.equal(res.status,201);
 assert.equal(await count('attachments'),1);assert.equal(await count('shift_attachment_previews'),0);
 assert.equal((await upload({key:k2})).status,200);
});
test('per-tenant cap returns the ordinary upload without allocating another derivative',async()=>{
 await query(`INSERT INTO attachments(company_id,uploaded_by,shift_id,file_name,file_url)
 SELECT $1,$2,$3,n::text,'https://example.invalid/fixture' FROM generate_series(1,64) n`,[company,manager,shift]);
 await query(`INSERT INTO shift_attachment_previews(attachment_id,company_id,shift_id,jpeg)
 SELECT id,company_id,shift_id,decode('ffd8ff','hex') FROM attachments`);
 const res=await upload();assert.equal(res.status,201);
 assert.equal(await count('shift_attachment_previews'),64);
 assert.equal((await preview((await res.json()).attachment.id)).status,404);
 assert.equal(await count('attachments'),65);
});
