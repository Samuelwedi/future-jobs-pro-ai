process.env.TS_NODE_PROJECT=require('node:path').join(__dirname,'../tsconfig.json');
require('ts-node/register/transpile-only');
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const jwt=require('jsonwebtoken');
process.env.JWT_SECRET='voice-local-test';
delete process.env.OPENAI_API_KEY;
process.env.CLOUDINARY_CLOUD_NAME='local';process.env.CLOUDINARY_API_KEY='local';process.env.CLOUDINARY_API_SECRET='local';
const {pool}=require('../src/config/database');
const service=require('../src/services/voiceService');
const {v2:cloudinary}=require('cloudinary');
let server,base,queries=[],uploads=0,models=0,failUpload=false,failSave=false,mediaDuration=8.7;
const notes=[];
service.processVoiceNote=async()=>{models++;return {transcript:'Original note',structuredData:{actions:[]},clientSummary:'Summary',tags:[],duration:9};};
service.processTranscriptOnly=async()=>{models++;return {transcript:'Saved transcript',structuredData:{},clientSummary:'Summary',tags:[],duration:0};};
service.transcribeAudio=async()=>{throw Error('unexpected transcription');};
cloudinary.uploader.upload=async()=>{uploads++;if(failUpload)throw Error('storage failed');return {secure_url:'https://example.test/audio.m4a',duration:mediaDuration};};
pool.query=async(sql,args)=>{
 queries.push({sql,args});
 if(/FROM users/.test(sql))return {rowCount:args[0]==='inactive'?0:1,rows:[{id:args[0],company_id:args[0]==='outsider'?'other':'company'}]};
 if(/FROM projects/.test(sql))return {rowCount:args[0]==='project'&&args[1]==='company'?1:0};
 if(/FROM time_entries/.test(sql)){assert.match(sql,/user_id = \$2 AND project_id = \$3/);assert.deepEqual(args.slice(1),['worker','project']);return {rowCount:args[0]==='own-shift'?1:0};}
 if(/FROM voice_notes/.test(sql)){assert.match(sql,/company_id = \$3/);assert.deepEqual(args,['project','worker','company']);return {rows:[]};}
 if(/INSERT INTO voice_notes/.test(sql)){if(failSave)throw Error('save failed');notes.push(args);return {rows:[{id:'note-'+notes.length}]};}
 throw Error('Unexpected query: '+sql);
};
before(async()=>{const app=express();app.use(express.json());app.use(require('../src/routes/voiceRoutes').default);server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`;});
after(async()=>{await new Promise(r=>server.close(r));await pool.end();});
async function send(fields={},user='worker',audio=true){const body=new FormData();body.set('projectId','project');for(const [k,v]of Object.entries(fields))body.set(k,v);if(audio)body.set('audio',new Blob(['local fake audio'],{type:'audio/mp4'}),'voice.m4a');const r=await fetch(base+'/process',{method:'POST',body,headers:user?{Authorization:'Bearer '+jwt.sign({id:user},process.env.JWT_SECRET)}:{}});return {status:r.status,data:await r.json()};}
test('audio-only persists media and null derived content without any AI provider or time writes',async()=>{
 const start=models;queries=[];const r=await send({transcribe:'false',userId:'spoofed',timeEntryId:'own-shift'});
 assert.equal(r.status,200);assert.equal(r.data.transcriptionStatus,'skipped');assert.equal(r.data.duration,9);assert.equal(r.data.audioUrl,'https://example.test/audio.m4a');
 for(const key of ['transcript','structuredData','clientSummary'])assert.equal(r.data[key],null);
 assert.equal(models,start);const row=notes.at(-1);assert.equal(row[0],'company');assert.equal(row[1],'worker');assert.equal(row[3],'own-shift');assert.equal(row[5],null);assert.equal(row[9],null);assert.equal(row[10],null);assert.equal(JSON.parse(row[8]).transcriptionStatus,'skipped');assert.equal(queries.filter(q=>/INSERT|UPDATE|DELETE/.test(q.sql)).length,1);
});
test('audio-only never invents duration when provider omits it',async()=>{mediaDuration=undefined;try{const r=await send({transcribe:'false'});assert.equal(r.status,200);assert.equal(r.data.duration,null);assert.equal(notes.at(-1)[6],null);}finally{mediaDuration=8.7;}});
test('audio-only maintains authentication, company and owned shift boundaries before upload',async()=>{
 const start=uploads,count=notes.length;
 for(const [fields,user,status]of [[{},null,401],[{},'inactive',401],[{},'outsider',404],[{projectId:'foreign'},'worker',404],[{timeEntryId:'someone-elses'},'worker',400]])assert.equal((await send({...fields,transcribe:'false'},user)).status,status);
 assert.equal(uploads,start);assert.equal(notes.length,count);
});
test('malformed modes and missing files fail closed before any provider call',async()=>{const start=uploads;for(const transcribe of ['False','','0','no','[false]'])assert.equal((await send({transcribe})).status,400);assert.equal((await send({transcribe:'false'},'worker',false)).status,400);assert.equal(uploads,start);});
test('old clients and old queue entries still require configured transcription; explicit true matches',async()=>{const start=uploads;for(const fields of [{},{transcribe:'true'}])assert.equal((await send(fields)).status,503);assert.equal(uploads,start);process.env.OPENAI_API_KEY='test-only';try{for(const fields of [{},{transcribe:'true'}]){const r=await send(fields);assert.equal(r.status,200);assert.equal(r.data.transcriptionStatus,'completed');assert.equal(r.data.transcript,'Original note');}}finally{delete process.env.OPENAI_API_KEY;}});
test('storage and database failures do not report success and retry retains audio-only intent',async()=>{const start=models,count=notes.length;failUpload=true;assert.equal((await send({transcribe:'false'})).status,500);failUpload=false;failSave=true;assert.equal((await send({transcribe:'false'})).status,500);failSave=false;assert.equal(notes.length,count);const r=await send({transcribe:'false'});assert.equal(r.status,200);assert.equal(r.data.transcriptionStatus,'skipped');assert.equal(models,start);});
async function transcript(fields={},user='worker') {const r=await fetch(base+'/process-transcript',{method:'POST',headers:{'Content-Type':'application/json',...(user?{Authorization:'Bearer '+jwt.sign({id:user},process.env.JWT_SECRET)}:{})},body:JSON.stringify({projectId:'project',transcript:'Local transcript',...fields})});return {status:r.status,data:await r.json()};}
test('transcript route rejects foreign shifts and invalid actors before model or save',async()=>{
 const beforeModels=models,beforeNotes=notes.length;
 for(const [fields,user,status] of [[{},null,401],[{},'inactive',401],[{},'outsider',404],[{timeEntryId:'someone-elses'},'worker',400],[{projectId:'foreign'},'worker',404]]) assert.equal((await transcript(fields,user)).status,status);
 assert.equal(models,beforeModels);assert.equal(notes.length,beforeNotes);
 const r=await transcript({timeEntryId:'own-shift',userId:'spoofed'});assert.equal(r.status,200);assert.equal(notes.at(-1)[1],'worker');assert.equal(notes.at(-1)[3],'own-shift');
});
test('transcript payload must be nonempty bounded text before processing',async()=>{const start=models;for(const value of ['', '   ',{},['text'], 'x'.repeat(50001)])assert.equal((await transcript({transcript:value})).status,400);assert.equal(models,start);});
test('voice list requires active actor and project in current company and scopes rows',async()=>{
 for(const [user,status] of [[null,401],['inactive',401],['outsider',404],['worker',200]]){
 const r=await fetch(base+'/project/project',{headers:user?{Authorization:'Bearer '+jwt.sign({id:user},process.env.JWT_SECRET)}:{}});assert.equal(r.status,status);if(status===200)assert.deepEqual((await r.json()).notes,[]);
 }
});
