const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function setup(){let requestInterceptor,responseFailure,beforeSend=async()=>{},read=async key=>key==='userData'?JSON.stringify({id:'owner',companyId:'company',role:'employee'}):'token',response=async()=>({data:{success:true,attachments:[]}});const sent=[];
 const client={interceptors:{request:{use:fn=>requestInterceptor=fn},response:{use:(_ok,fail)=>responseFailure=fail}},get:async(url,config)=>{await beforeSend();config={...config,headers:{}};await requestInterceptor(config);sent.push({url,config});return response();}};
 const c={exports:{},__DEV__:false,process:{env:{}},console,require:name=>{if(name==='axios')return {default:{create:()=>client}};if(name==='expo-secure-store')return {getItemAsync:(...args)=>read(...args),deleteItemAsync:async()=>{}};if(name==='react-native')return {Platform:{OS:'ios'}};if(['./offlineService','../utils/uploadMetadata','expo-file-system/legacy'].includes(name))return {};throw Error(name);}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/services/api.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,c);
 const api=c.exports.api;api.token='token';return {api,sent,responseFailure:(...args)=>responseFailure(...args),set read(fn){read=fn},set beforeSend(fn){beforeSend=fn},set response(fn){response=fn}};
}
const owner={id:'owner',companyId:'company',role:'employee'};
test('subscription status and capabilities use read-only identity/session/view-bound transport',async()=>{
 const f=setup();for(const endpoint of ['status','capabilities']){const result=await f.api.readSubscription(endpoint,owner,()=>true);assert.equal(result.success,true);}
 assert.deepEqual(f.sent.map(s=>s.url),['/subscriptions/status','/subscriptions/capabilities']);
 for(const sent of f.sent){assert.equal(sent.config.expectedAuthToken,'token');assert.equal(sent.config.expectedAuthRevision,0);assert.equal(sent.config.fenceUnauthorizedToCurrent,true);}
});
test('missing token or mismatched stored user, company or role blocks both subscription reads',async()=>{
 for(const endpoint of ['status','capabilities'])for(const change of [{id:'other'},{companyId:'other'},{role:'boss'},null]){
  const f=setup();if(change)f.read=async()=>JSON.stringify({...owner,...change});else f.api.token=null;
  await assert.rejects(f.api.readSubscription(endpoint,owner,()=>true),/changed/);assert.equal(f.sent.length,0);
 }
});
test('storage, dispatch and response races reject changed session or view, including same-token replacement',async()=>{
 for(const stage of ['storage','dispatch','response'])for(const kind of ['view','token','revision']){
  const f=setup();let current=true;const change=()=>{if(kind==='view')current=false;else if(kind==='token')f.api.token='new';else f.api.authRevision++;};
  if(stage==='storage')f.read=async()=>{change();return JSON.stringify(owner);};else if(stage==='dispatch')f.beforeSend=change;else f.response=async()=>{change();return {data:{success:true}};};
  await assert.rejects(f.api.readSubscription('status',owner,()=>current),/changed/);assert.equal(f.sent.length,stage==='response'?1:0);
 }
});
test('old subscription 401 and 402 responses cannot log out or navigate a replaced or superseded view',async()=>{
 for(const status of [401,402])for(const kind of ['current','view','token','revision']){
  const f=setup();let current=true,logouts=0,navigations=0;f.api.setUnauthorizedHandler(()=>logouts++);f.api.setSubscriptionRequiredHandler(()=>navigations++);
  await f.api.readSubscription('status',owner,()=>current);
  if(kind==='view')current=false;else if(kind==='token')f.api.token='new';else if(kind==='revision')f.api.authRevision++;
  await assert.rejects(f.responseFailure(Object.assign(Error('response failure'),{response:{status},config:f.sent[0].config})),/response failure/);
  assert.equal(logouts,kind==='current'&&status===401?1:0);assert.equal(navigations,kind==='current'&&status===402?1:0);
 }
});
test('other existing clients preserve their prior current-session 401 behavior',async()=>{
 const f=setup();let logouts=0;f.api.setUnauthorizedHandler(()=>logouts++);
 await assert.rejects(f.responseFailure(Object.assign(Error('401'),{response:{status:401},config:{expectedAuthToken:'token',expectedAuthRevision:0,expectedCurrent:()=>false}})),/401/);
 assert.equal(logouts,1);
});

test('a replacement session during awaited 401 cleanup is not signed out by the old callback',async()=>{
 const f=setup();let logouts=0;f.api.setUnauthorizedHandler(()=>logouts++);await f.api.readSubscription('status',owner,()=>true);
 const pending=f.responseFailure(Object.assign(Error('401'),{response:{status:401},config:f.sent[0].config}));
 f.api.token='replacement';f.api.authRevision++;
 await assert.rejects(pending,/401/);assert.equal(logouts,0);assert.equal(f.api.token,'replacement');
});
