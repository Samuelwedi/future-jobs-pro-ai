const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function setup(){let requestInterceptor,responseFailure,beforeSend=async()=>{},read=async key=>key==='userData'?JSON.stringify({id:'owner',companyId:'company',role:'manager'}):'token',response=async()=>({data:{success:true,attachments:[]}});let online=true;const sent=[];
 const client={interceptors:{request:{use:fn=>requestInterceptor=fn},response:{use:(_ok,fail)=>responseFailure=fail}},get:async(url,config)=>{await beforeSend();config={...config,headers:{}};await requestInterceptor(config);sent.push({url,config});return response();}};
 client.post=async(url,data,config)=>{await beforeSend();config={...config,headers:{}};await requestInterceptor(config);sent.push({url,data,config});return response();};
 const c={exports:{},__DEV__:false,process:{env:{}},console,require:name=>{if(name==='axios')return {default:{create:()=>client}};if(name==='expo-secure-store')return {getItemAsync:(...args)=>read(...args),deleteItemAsync:async()=>{}};if(name==='react-native')return {Platform:{OS:'ios'}};if(name==='./offlineService')return {checkOnlineStatus:async()=>online};if(['../utils/uploadMetadata','expo-file-system/legacy'].includes(name))return {};throw Error(name);}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/services/api.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,c);
 const api=c.exports.api;api.token='token';return {api,sent,set online(value){online=value},responseFailure:(...args)=>responseFailure(...args),set read(fn){read=fn},set beforeSend(fn){beforeSend=fn},set response(fn){response=fn}};
}
const owner={id:'owner',companyId:'company',role:'manager'};
test('advisory POST is direct, online and session fenced without any offline queue',async()=>{
 const f=setup();await f.api.checkScheduleConflicts({date:'2026-11-11',employeeIds:['worker']},owner,()=>true);
 assert.equal(f.sent.length,1);assert.equal(f.sent[0].url,'/schedule/conflicts');assert.equal(f.sent[0].config.expectedAuthToken,'token');assert.equal(f.sent[0].config.expectedAuthRevision,0);
 f.online=false;await assert.rejects(f.api.checkScheduleConflicts({},owner,()=>true),/online/);assert.equal(f.sent.length,1);
});
test('mismatched stored owner, company and role cannot dispatch private overlap reads',async()=>{
 for(const field of ['id','companyId','role']){const f=setup();f.read=async()=>JSON.stringify({...owner,[field]:'other'});await assert.rejects(f.api.checkScheduleConflicts({},owner,()=>true),/changed/);assert.equal(f.sent.length,0);}
});
test('overlap transport rejects token, revision and draft changes at dispatch and response',async()=>{
 for(const stage of ['dispatch','response'])for(const change of ['token','revision','draft']){
  const f=setup();let current=true;const mutate=()=>{if(change==='token')f.api.token='other';else if(change==='revision')f.api.authRevision++;else current=false;};
  if(stage==='dispatch')f.beforeSend=mutate;else f.response=async()=>{mutate();return {data:{success:true}};};
  await assert.rejects(f.api.checkScheduleConflicts({},owner,()=>current),/changed/);assert.equal(f.sent.length,stage==='dispatch'?0:1);
 }
});
