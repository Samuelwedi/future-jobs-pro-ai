// Execute current TypeScript source, never a possibly stale dist tree.
require('ts-node').register({transpileOnly:true,project:require('node:path').join(__dirname,'../tsconfig.json')});
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
process.env.JWT_SECRET='photo-upload-isolated-test';process.env.DATABASE_URL='postgres://unused:unused@127.0.0.1:1/unused';
const {pool}=require('../src/config/database');const jwt=require('jsonwebtoken');
const watermark=require('../src/services/watermarkService');const compliance=require('../src/services/photoComplianceService');const storage=require('../src/services/evidenceUpload');
const root=path.join(__dirname,'../uploads/temp');
const user='11111111-1111-4111-a111-111111111111',company='22222222-2222-4222-a222-222222222222',project='33333333-3333-4333-a333-333333333333';
test('evidence upload streams authorized media to disk and cleans temporary files',async t=>{
 const originals={query:pool.query,connect:pool.connect,watermark:watermark.applyWatermark,compliance:compliance.analyzePhotoCompliance,upload:storage.uploadEvidenceFile};
 const receipts=new Map();
 pool.connect=async()=>({query:(...args)=>pool.query(...args),release(){}});
 let ownership=true,shiftOwned=true,actorRole='employee',active=true,inserts=0,uploads=0,watermarks=0,block=null;
 pool.query=async (sql,params=[])=>{const key=JSON.stringify(params.slice(0,3));if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return {};if(sql.includes('FOR SHARE'))return {rowCount:1,rows:[{company_id:company,role:actorRole,is_active:active}]};
 if(sql.includes('INSERT INTO evidence_upload_receipts')){if(receipts.has(key))return {rowCount:0};receipts.set(key,{fingerprint:params[3],state:'processing'});return {rowCount:1};}
 if(sql.includes('SELECT fingerprint,state,response'))return {rowCount:receipts.has(key)?1:0,rows:[receipts.get(key)]};
 if(sql.includes("SET state='completed'")){Object.assign(receipts.get(key),{state:'completed',response:JSON.parse(params[3])});return {rowCount:1};}
 if(sql.includes("SET state='uncertain'")){if(receipts.get(key)?.state==='processing')receipts.get(key).state='uncertain';return {rowCount:1};}
 if(sql.includes('SELECT r.state,r.response'))return {rowCount:receipts.has(key)?1:0,rows:receipts.has(key)?[receipts.get(key)]:[]};
 if(sql.startsWith('SELECT id, company_id'))return {rowCount:active?1:0,rows:active?[{id:user,company_id:company,role:actorRole}]:[]};if(sql.startsWith('SELECT te.id'))return {rowCount:shiftOwned?1:0,rows:shiftOwned?[{id:'shift'}]:[]};if(sql.includes('valid_user'))return {rows:[{valid_user:ownership,valid_project:ownership}]};if(sql.includes('INSERT INTO photos')){inserts++;return {rows:[{id:'photo'}]};}throw Error('Unexpected fixture SQL');};
 watermark.applyWatermark=async(input,output)=>{watermarks++;assert.ok(fs.existsSync(input));assert.ok(!input.includes('hostile'));if(block)await block;fs.copyFileSync(input,output);return {outputPath:output,verificationHash:'fixture-hash',applied:true};};
 compliance.analyzePhotoCompliance=async()=>null;
 storage.uploadEvidenceFile=async()=>{uploads++;return {secure_url:'https://example.test/evidence'};};
 const express=require('express');const app=express();app.use('/photos',require('../src/routes/photoRoutes').default);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 const token=jwt.sign({id:user},process.env.JWT_SECRET);const baseline=new Set(fs.readdirSync(root));
 const send=async(type='video/quicktime',auth=true,extra=false,fields={})=>{const body=new FormData();body.set('requestKey',require('node:crypto').randomUUID());body.set('userId',user);body.set('projectId',project);for(const [key,value] of Object.entries(fields))value === undefined ? body.delete(key) : body.set(key,value);body.set('file',new Blob([Buffer.alloc(8192,5)],{type}), 'hostile;name.MOV');if(extra)body.append('file',new Blob(['more'],{type}),'second.mov');return fetch(base+'/photos/upload',{method:'POST',headers:auth?{Authorization:'Bearer '+token}:{},body});};
 const clean=()=>assert.deepEqual(fs.readdirSync(root).filter(file=>!baseline.has(file)),[]);
 try {
  await t.test('unauthenticated request is rejected before parsing or processing media',async()=>{const r=await send('video/quicktime',false);assert.equal(r.status,401);assert.equal(watermarks,0);clean();});
  await t.test('supported video is on disk and removed after success',async()=>{const r=await send();assert.equal(r.status,200);const result=await r.json();assert.equal(result.fileType,'video');assert.equal(result.watermarkApplied,true);assert.equal(inserts,1);clean();});
  await t.test('installed clients without a key retain non-idempotent uploads without receipts',async()=>{
   const before={inserts,uploads,receipts:receipts.size};
   for(let i=0;i<2;i++){
    const r=await send('image/jpeg',true,false,{requestKey:undefined});
    assert.equal(r.status,200);const result=await r.json();assert.equal(result.success,true);assert.equal(result.fileType,'image');assert.equal(Object.hasOwn(result,'requestKey'),false);clean();
   }
   assert.equal(inserts,before.inserts+2);assert.equal(uploads,before.uploads+2);assert.equal(receipts.size,before.receipts);
  });
  await t.test('explicit empty, short, invalid and oversized keys reject rather than use legacy mode',async()=>{
   const before={inserts,uploads,receipts:receipts.size};
   for(const requestKey of ['', 'short', 'invalid key with spaces', 'a'.repeat(101)])assert.equal((await send('image/jpeg',true,false,{requestKey})).status,400);
   assert.equal(inserts,before.inserts);assert.equal(uploads,before.uploads);assert.equal(receipts.size,before.receipts);clean();
  });
  await t.test('legacy uploads retain tenant, actor, shift and commit-time authorization',async()=>{
   const fields={requestKey:undefined};const before=inserts;
   ownership=false;assert.equal((await send('image/jpeg',true,false,fields)).status,403);ownership=true;
   assert.equal((await send('image/jpeg',true,false,{...fields,userId:'other-user'})).status,403);
   shiftOwned=false;assert.equal((await send('image/jpeg',true,false,{...fields,timeEntryId:'foreign'})).status,400);shiftOwned=true;
   const saved=storage.uploadEvidenceFile;
   try {storage.uploadEvidenceFile=async()=>{active=false;return {secure_url:'https://example.test/uploaded'};};assert.equal((await send('image/jpeg',true,false,fields)).status,500);}
   finally {active=true;storage.uploadEvidenceFile=saved;}
   assert.equal(inserts,before);clean();
  });
  await t.test('same-key replay returns original result without repeating providers; changed payload conflicts',async()=>{
   const requestKey=require('node:crypto').randomUUID();const before=uploads;
   let r=await send('video/mp4',true,false,{requestKey});assert.equal(r.status,200);const original=await r.json();
   r=await send('video/mp4',true,false,{requestKey});assert.equal(r.status,200);assert.deepEqual(await r.json(),original);assert.equal(uploads,before+1);
   r=await send('video/mp4',true,false,{requestKey,address:'changed'});assert.equal(r.status,409);assert.equal(uploads,before+1);
   r=await fetch(base+'/photos/upload-status/'+requestKey,{headers:{Authorization:'Bearer '+token}});assert.equal(r.status,200);assert.deepEqual(await r.json(),original);
  });
  await t.test('uncertain receipt blocks provider replay and status is read-only',async()=>{
   const requestKey=require('node:crypto').randomUUID();const saved=storage.uploadEvidenceFile;let calls=0;
   storage.uploadEvidenceFile=async()=>{calls++;throw Error('uncertain fixture');};
   assert.equal((await send('video/mp4',true,false,{requestKey})).status,500);
   assert.equal((await send('video/mp4',true,false,{requestKey})).status,202);assert.equal(calls,1);
   const r=await fetch(base+'/photos/upload-status/'+requestKey,{headers:{Authorization:'Bearer '+token}});assert.equal(r.status,202);assert.equal((await r.json()).status,'uncertain');assert.equal(calls,1);storage.uploadEvidenceFile=saved;
  });
  await t.test('revoked actor after provider work cannot persist evidence',async()=>{
   const saved=storage.uploadEvidenceFile;const before=inserts;
   storage.uploadEvidenceFile=async()=>{active=false;return {secure_url:'https://example.test/uploaded'};};
   const r=await send();assert.equal(r.status,500);assert.equal(inserts,before);active=true;storage.uploadEvidenceFile=saved;clean();
  });
  await t.test('unsupported MIME and multiple files are rejected without processing',async()=>{let before=watermarks;assert.equal((await send('application/javascript')).status,400);assert.equal((await send('video/mp4',true,true)).status,400);assert.equal(watermarks,before);clean();});
  await t.test('cross-company project or user is rejected and disk file is removed',async()=>{ownership=false;const before=uploads;assert.equal((await send()).status,403);assert.equal(uploads,before);ownership=true;clean();});
  await t.test('inactive actors, employee impersonation and foreign shifts are rejected',async()=>{
   active=false;assert.equal((await send()).status,401);active=true;
   assert.equal((await send('video/mp4',true,false,{userId:'other-user'})).status,403);
   shiftOwned=false;assert.equal((await send('video/mp4',true,false,{timeEntryId:'foreign-shift'})).status,400);shiftOwned=true;
   actorRole='manager';assert.equal((await send('video/mp4',true,false,{userId:'other-user',timeEntryId:'owned-shift'})).status,200);actorRole='employee';clean();
  });
  await t.test('provider failures preserve a retry warning and release the slot and files',async()=>{const saved=storage.uploadEvidenceFile;storage.uploadEvidenceFile=async()=>{throw Error('provider secret error detail');};const r=await send();assert.equal(r.status,500);assert.match((await r.json()).message,/Check your saved evidence/);clean();storage.uploadEvidenceFile=saved;assert.equal((await send()).status,200);clean();});
  await t.test('interrupted multipart upload removes partial disk files and releases its slot',async()=>{
   const http=require('node:http');const boundary='fixture-interrupted-boundary';
   const req=http.request(base+'/photos/upload',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'multipart/form-data; boundary='+boundary}});req.on('error',()=>{});
   req.write(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="partial.mov"\r\nContent-Type: video/quicktime\r\n\r\n`);req.write(Buffer.alloc(16384));
   for(let i=0;i<100 && fs.readdirSync(root).filter(file=>!baseline.has(file)).length===0;i++)await new Promise(r=>setTimeout(r,5));
   req.destroy();
   for(let i=0;i<100 && fs.readdirSync(root).filter(file=>!baseline.has(file)).length;i++)await new Promise(r=>setTimeout(r,5));
   clean();assert.equal((await send()).status,200);clean();
  });
  await t.test('two in-flight jobs bound process work; rejected excess does not allocate a disk file',async()=>{let release;block=new Promise(r=>release=r);const before=watermarks;const first=send(),second=send();while(watermarks<before+2)await new Promise(r=>setTimeout(r,5));const third=await send();assert.equal(third.status,503);assert.equal(third.headers.get('retry-after'),'10');release();await Promise.all([first,second]);block=null;clean();});
 } finally {await new Promise(r=>server.close(r));pool.query=originals.query;pool.connect=originals.connect;watermark.applyWatermark=originals.watermark;compliance.analyzePhotoCompliance=originals.compliance;storage.uploadEvidenceFile=originals.upload;}
});
