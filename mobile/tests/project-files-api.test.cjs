const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function setup(){let requestInterceptor,responseFailure,beforeSend=async()=>{},read=async key=>key==='userData'?JSON.stringify({id:'owner',companyId:'company',role:'employee'}):'token',response=async()=>({data:{success:true,attachments:[]}});const sent=[];
 const client={interceptors:{request:{use:fn=>requestInterceptor=fn},response:{use:(_ok,fail)=>responseFailure=fail}},get:async(url,config)=>{await beforeSend();config={...config,headers:{}};await requestInterceptor(config);sent.push({url,config});return response();}};
 const c={exports:{},__DEV__:false,process:{env:{}},console,require:name=>{if(name==='axios')return {default:{create:()=>client}};if(name==='expo-secure-store')return {getItemAsync:(...args)=>read(...args),deleteItemAsync:async()=>{}};if(name==='react-native')return {Platform:{OS:'ios'}};if(['./offlineService','../utils/uploadMetadata','expo-file-system/legacy'].includes(name))return {};throw Error(name);}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/services/api.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,c);
 const api=c.exports.api;api.token='token';return {api,sent,responseFailure:(...args)=>responseFailure(...args),set read(fn){read=fn},set beforeSend(fn){beforeSend=fn},set response(fn){response=fn}};
}
const owner={id:'owner',companyId:'company',role:'employee'};
test('project Files performs only encoded project-scoped GET with token/revision and current-view guards',async()=>{
 const f=setup(),current=()=>true,result=await f.api.getProjectFiles('project&projectId=other',owner,current);
 assert.equal(result.data.success,true);assert.equal(result.isSessionCurrent(),true);assert.equal(f.sent[0].url,'/attachments?projectId=project%26projectId%3Dother');assert.equal(f.sent[0].config.expectedAuthToken,'token');assert.equal(f.sent[0].config.expectedAuthRevision,0);assert.equal(f.sent[0].config.expectedCurrent,current);
});
test('missing project, token, or mismatched stored identity/company/role stops before dispatch',async()=>{
 for(const change of [{id:'other'},{companyId:'other'},{role:'manager'}]){const f=setup();f.read=async()=>JSON.stringify({...owner,...change});await assert.rejects(f.api.getProjectFiles('project',owner,()=>true),/Account or project changed/);assert.equal(f.sent.length,0);}
 const f=setup();await assert.rejects(f.api.getProjectFiles('',owner,()=>true),/required/);f.api.token=null;f.read=async()=>null;await assert.rejects(f.api.getProjectFiles('project',owner,()=>true),/Account or project changed/);assert.equal(f.sent.length,0);
});
test('account/view changes during secure storage or Axios dispatch prevent requests, including same-token replacement',async()=>{
 for(const stage of ['storage','dispatch'])for(const kind of ['view','revision','token']){
  const f=setup();let current=true;const change=()=>{if(kind==='view')current=false;else if(kind==='revision')f.api.authRevision++;else f.api.token='other';};
  if(stage==='storage')f.read=async()=>{change();return JSON.stringify(owner);};else f.beforeSend=change;
  await assert.rejects(f.api.getProjectFiles('project',owner,()=>current),/changed/);assert.equal(f.sent.length,0);
 }
});
test('replacement token loaded during initial secure read cannot acquire a stale view; completed stale reads are rejected',async()=>{
 const f=setup();f.api.token=null;f.read=async()=>{f.api.authRevision++;f.api.token='new';return 'new';};await assert.rejects(f.api.getProjectFiles('project',owner,()=>true),/changed/);assert.equal(f.sent.length,0);
 for(const kind of ['view','revision','token']){const g=setup();let current=true;g.response=async()=>{if(kind==='view')current=false;else if(kind==='revision')g.api.authRevision++;else g.api.token='new';return {data:{success:true,attachments:[]}};};await assert.rejects(g.api.getProjectFiles('project',owner,()=>current),/changed/);assert.equal(g.sent.length,1);}
});
test('a late old-session Files 401 cannot log out a replacement session',async()=>{
 const f=setup();await f.api.getProjectFiles('project',owner,()=>true);let logouts=0;f.api.setUnauthorizedHandler(()=>logouts++);f.api.authRevision++;
 await assert.rejects(f.responseFailure(Object.assign(Error('old 401'),{response:{status:401},config:f.sent[0].config})),/old 401/);assert.equal(logouts,0);assert.equal(f.api.token,'token');
});
test('Files 402 responses navigate only for the current token/revision/view; unfenced current clients retain recovery',async()=>{
 for(const kind of ['current','view','revision','token']){
  const f=setup();let current=true,navigations=0;f.api.setSubscriptionRequiredHandler(()=>navigations++);
  await f.api.getProjectFiles('project',owner,()=>current);
  if(kind==='view')current=false;else if(kind==='revision')f.api.authRevision++;else if(kind==='token')f.api.token='new';
  await assert.rejects(f.responseFailure(Object.assign(Error('subscription required'),{response:{status:402},config:f.sent[0].config})),/subscription required/);
  assert.equal(navigations,kind==='current'?1:0,kind);
 }
 const f=setup();let navigations=0;f.api.setSubscriptionRequiredHandler(()=>navigations++);
 await assert.rejects(f.responseFailure(Object.assign(Error('subscription required'),{response:{status:402},config:{}})),/subscription required/);assert.equal(navigations,1);
});
test('loaded Files session guard rejects cached links immediately after clearToken or same-token replacement',async()=>{
 for(const kind of ['clear','replacement','token']){
  const f=setup(),result=await f.api.getProjectFiles('project',owner,()=>true);assert.equal(result.isSessionCurrent(),true);
  if(kind==='clear'){const clearing=f.api.clearToken();assert.equal(result.isSessionCurrent(),false);await clearing;}
  else {if(kind==='replacement')f.api.authRevision++;else f.api.token='other';assert.equal(result.isSessionCurrent(),false);}
 }
});
