const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function setup(){let interceptor,beforeSend=async()=>{},afterSend=async()=>{},online=true,readUser=async()=>JSON.stringify({id:'owner',companyId:'company'});const sent=[];
 async function send(method,url,data,config){await beforeSend();config={...config,headers:{...config?.headers}};await interceptor(config);sent.push({method,url,data,config});await afterSend();return {status:method==='get'?404:201,data:{success:false}};}
 const client={interceptors:{request:{use:fn=>interceptor=fn},response:{use(){}}},post:(url,data,config)=>send('post',url,data,config),get:(url,config)=>send('get',url,undefined,config)};
 class Form {constructor(){this.fields=[];}append(...args){this.fields.push(args);}}
 const c={exports:{},FormData:Form,__DEV__:false,process:{env:{}},console,require:n=>{
  if(n==='axios')return {default:{create:()=>client}};if(n==='expo-secure-store')return {getItemAsync:()=>readUser()};if(n==='react-native')return {Platform:{OS:'ios'}};
  if(n==='./offlineService')return {checkOnlineStatus:async()=>online,validEvidenceKey:v=>typeof v==='string'&&/^[a-zA-Z0-9_.:-]{16,100}$/.test(v),requiresOnlineConfirmation:url=>/^\/(?:api\/)?voice\/process(?:-transcript)?\/?(?:\?|$)/i.test(url)};if(n==='expo-file-system/legacy')return {};
  if(n==='../utils/uploadMetadata')return {uploadMetadata:(_uri,_field,info)=>({name:info.name,type:info.mimeType})};throw Error(n);
 }};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/services/api.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,c);const api=c.exports.api;api.token='token';return {api,sent,set afterSend(v){afterSend=v},set online(v){online=v},set beforeSend(v){beforeSend=v},set readUser(v){readUser=v}};
}

const file={uri:'file:///retained.m4a',name:'École original.m4a',mimeType:'audio/mp4',projectId:'project',timeEntryId:null,mode:'audio-only'};
test('voice receipt transport preserves exact retained metadata and explicit mode/optional shift',async()=>{
 for(const mode of ['audio-only','audio-transcribed'])for(const timeEntryId of [null,'entry']){
  const f=setup(),s=await f.api.captureVoiceSession('owner','company');
  await f.api.requestVoiceReceipt(s,'stable-voice-request',{...file,mode,timeEntryId});
  const request=f.sent[0],fields=Object.fromEntries(request.data.fields);
  assert.equal(request.url,'/voice/process');assert.equal(request.method,'post');assert.equal(request.config.timeout,120000);
  assert.equal(fields.audio.uri,file.uri);assert.equal(fields.audio.name,file.name);assert.equal(fields.audio.type,file.mimeType);
  assert.equal(fields.transcribe,mode==='audio-only'?'false':'true');assert.equal(fields.projectId,'project');assert.equal(fields.requestKey,'stable-voice-request');
  assert.equal(fields.timeEntryId,timeEntryId===null?undefined:'entry');assert.equal(request.config.expectedAuthRevision,0);
 }
});
test('status is cache-busted, accepts noncompleted states and never posts or retries',async()=>{
 const f=setup(),s=await f.api.getVoiceSession('owner','company');await f.api.requestVoiceReceipt(s,'stable-voice-request');
 const r=f.sent[0];assert.equal(r.url,'/voice/requests/stable-voice-request');assert.equal(r.method,'get');assert.ok(r.config.params._);
 assert.match(r.config.headers['Cache-Control'],/no-store/);for(const status of [200,202,404,410])assert.equal(r.config.validateStatus(status),true);
 for(const status of [401,403,409,500])assert.equal(r.config.validateStatus(status),false);assert.equal(f.sent.length,1);
});
test('malformed keys, bad metadata, wrong owner/company and offline requests fail without dispatch',async()=>{
 const f=setup(),s=await f.api.getVoiceSession('owner','company');
 for(const key of ['', 'short', '../escape-voice-request', 'x'.repeat(101)])await assert.rejects(f.api.requestVoiceReceipt(s,key,file),/request key/);
 await assert.rejects(f.api.requestVoiceReceipt(s,'stable-voice-request',{...file,mode:'transcript'}),/metadata/);
 await assert.rejects(f.api.getVoiceSession('other','company'),/Account changed/);await assert.rejects(f.api.getVoiceSession('owner','other'),/Account changed/);
 f.online=false;await assert.rejects(f.api.requestVoiceReceipt(s,'stable-voice-request',file),/Nothing was queued/);assert.equal(f.sent.length,0);
});
test('same-token ABA, current screen and persisted owner/company changes are fenced before dispatch and after response',async()=>{
 for(const payload of [undefined,file])for(const stage of ['storage','dispatch','response'])for(const change of ['revision','screen','owner','company']){
  const f=setup(),s=await f.api.captureVoiceSession('owner','company');let current=true;
  const mutate=()=>{if(change==='revision')f.api.authRevision++;if(change==='screen')current=false;if(change==='owner'||change==='company')f.readUser=async()=>JSON.stringify({id:change==='owner'?'other':'owner',companyId:change==='company'?'other':'company'});};
  if(stage==='storage') {mutate();} else if(stage==='dispatch')f.beforeSend=async()=>mutate();else f.afterSend=async()=>mutate();
  await assert.rejects(f.api.requestVoiceReceipt(s,'stable-voice-request',payload,()=>current),/Account changed|screen changed/);
  assert.equal(f.sent.length,stage==='response'?1:0);
 }
});
test('input mutation during preparation cannot change retained target, mode, metadata or identity',async()=>{
 const f=setup(),s=await f.api.getVoiceSession('owner','company'),payload={...file};
 f.readUser=async()=>{payload.projectId='other';payload.mode='audio-transcribed';payload.name='changed';return JSON.stringify({id:'owner',companyId:'company'});};
 await f.api.requestVoiceReceipt(s,'stable-voice-request',payload);
 const fields=Object.fromEntries(f.sent[0].data.fields);assert.equal(fields.projectId,'project');assert.equal(fields.transcribe,'false');assert.equal(fields.audio.name,file.name);
});
test('direct replay of legacy voice audio/transcript actions fails without network',async()=>{
 const f=setup();for(const url of ['/voice/process','/voice/process-transcript','/api/voice/process?old=true','/VOICE/PROCESS-TRANSCRIPT/']){
  await assert.rejects(f.api.replayQueued({url,method:'POST',fileUri:file.uri,data:{requestKey:'stable-voice-request'}}),/review/);
 }assert.equal(f.sent.length,0);
});

test('account and screen changes while secure storage awaits cannot dispatch',async()=>{
 for(const mutation of ['revision','screen']){
  const f=setup(),s=await f.api.getVoiceSession('owner','company');let current=true;
  f.readUser=async()=>{await Promise.resolve();if(mutation==='revision')f.api.authRevision++;else current=false;return JSON.stringify({id:'owner',companyId:'company'});};
  await assert.rejects(f.api.requestVoiceReceipt(s,'stable-voice-request',file,()=>current),/Account changed|screen changed/);assert.equal(f.sent.length,0);
 }
});
