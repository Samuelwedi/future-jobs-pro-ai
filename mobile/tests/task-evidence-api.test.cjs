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

test('task receipts and notes use fenced multipart requests and preserve filenames',async()=>{
 const f=setup(),s=await f.api.captureAttachmentSession('owner','company');
 await f.api.taskEvidence(s,'task',()=>true,{requestKey:'request-key-123456',note:'Supplies',file:{uri:'file:///receipt.pdf',name:'École.pdf',mimeType:'application/pdf'}});
 assert.equal(f.sent[0].url,'/tasks/task/evidence');assert.equal(f.sent[0].config.fenceUnauthorizedToCurrent,true);
 assert.equal(f.sent[0].data.fields.find(x=>x[0]==='originalFileName')[1],'École.pdf');
 assert.equal(f.sent[0].data.fields.find(x=>x[0]==='note')[1],'Supplies');
 await f.api.taskEvidence(s,'task',()=>true);assert.equal(f.sent[1].method,'get');
});
test('task reads and writes stop on stored owner, token revision and screen changes',async()=>{
 for(const submission of [undefined,{requestKey:'request-key-123456',note:'Supplies'}])for(const change of ['storage','revision','screen']){
 const f=setup(),s=await f.api.captureAttachmentSession('owner','company');let current=true;
 if(change==='storage')f.readUser=async()=>JSON.stringify({id:'other',companyId:'company'});
 if(change==='revision')f.beforeSend=async()=>{f.api.authRevision++;};
 if(change==='screen')f.beforeSend=async()=>{current=false;};
 await assert.rejects(f.api.taskEvidence(s,'task',()=>current,submission));assert.equal(f.sent.length,0);
 }
});
