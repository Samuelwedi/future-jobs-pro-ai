const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function setup(){let interceptor,beforeSend=async()=>{},readUser=async()=>JSON.stringify({id:'owner',companyId:'company'});const sent=[];
 async function send(method,url,data,config){await beforeSend();config={...config,headers:{...config?.headers}};await interceptor(config);sent.push({method,url,data,config});return {status:method==='get'?404:201,data:{success:false}};}
 const client={interceptors:{request:{use:fn=>interceptor=fn},response:{use(){}}},post:(url,data,config)=>send('post',url,data,config),get:(url,config)=>send('get',url,undefined,config)};
 class Form {constructor(){this.fields=[];}append(...args){this.fields.push(args);}}
 const c={exports:{},FormData:Form,__DEV__:false,process:{env:{}},console,require:n=>{
  if(n==='axios')return {default:{create:()=>client}};if(n==='expo-secure-store')return {getItemAsync:()=>readUser()};if(n==='react-native')return {Platform:{OS:'ios'}};
  if(n==='./offlineService'||n==='expo-file-system/legacy')return {};
  if(n==='../utils/uploadMetadata')return {uploadMetadata:(_uri,_field,info)=>({name:info.name,type:info.mimeType})};throw Error(n);
 }};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/services/api.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,c);const api=c.exports.api;api.token='token';return {api,sent,set beforeSend(v){beforeSend=v},set readUser(v){readUser=v}};
}
test('attachment session checks stored owner/company and preserves original file metadata with receipt identity',async()=>{
 const f=setup();const session=await f.api.captureAttachmentSession('owner','company');
 await f.api.requestAttachmentReceipt(session,'stable-request-key',{uri:'file:///owned.bin',name:'École.pdf',mimeType:'application/pdf',timeEntryId:'entry'});
 assert.equal(f.sent[0].config.expectedAuthToken,'token');assert.equal(f.sent[0].config.expectedAuthRevision,0);
 const fields=f.sent[0].data.fields;assert.equal(fields[0][1].name,'École.pdf');assert.equal(fields[0][1].type,'application/pdf');assert.equal(fields[1][0],'originalFileName');assert.equal(fields[1][1],'École.pdf');assert.equal(fields[2][1],'entry');assert.equal(fields[3][1],'stable-request-key');
 await assert.rejects(f.api.captureAttachmentSession('other','company'),/Account changed/);
 await assert.rejects(f.api.captureAttachmentSession('owner','other'),/Account changed/);
});
test('same-token session switch at Axios dispatch prevents both attachment POST and status reads',async()=>{
 for(const file of [undefined,{uri:'file:///owned.bin',name:'file.pdf',mimeType:'application/pdf',timeEntryId:'entry'}]){const f=setup(),s=await f.api.captureAttachmentSession('owner','company');f.beforeSend=async()=>{f.api.authRevision++;};
  await assert.rejects(f.api.requestAttachmentReceipt(s,'stable-request-key',file),/Account changed/);assert.equal(f.sent.length,0);
 }
});
test('stored account or company change during preparation blocks request; status accepts missing/unavailable without retry',async()=>{
 const f=setup(),s=await f.api.captureAttachmentSession('owner','company');await f.api.requestAttachmentReceipt(s,'stable-request-key');
 assert.equal(f.sent[0].method,'get');assert.equal(f.sent[0].config.validateStatus(404),true);assert.equal(f.sent[0].config.validateStatus(410),true);assert.equal(f.sent[0].config.validateStatus(401),false);
 f.readUser=async()=>JSON.stringify({id:'owner',companyId:'other'});await assert.rejects(f.api.requestAttachmentReceipt(s,'stable-request-key'),/Account changed/);assert.equal(f.sent.length,1);
});
test('dialog changes during secure storage or Axios dispatch prevent both POST and status calls',async()=>{
 for(const stage of ['storage','dispatch'])for(const file of [undefined,{uri:'file:///owned.bin',name:'Work report.pdf',mimeType:'application/pdf',timeEntryId:'entry'}]){
  const f=setup(),s=await f.api.captureAttachmentSession('owner','company');let current=true;
  if(stage==='storage')f.readUser=async()=>{current=false;return JSON.stringify({id:'owner',companyId:'company'});};
  else f.beforeSend=async()=>{current=false;};
  await assert.rejects(f.api.requestAttachmentReceipt(s,'stable-request-key',file,()=>current),/screen changed/);assert.equal(f.sent.length,0);
 }
});
