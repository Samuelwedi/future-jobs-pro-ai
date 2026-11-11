const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function setup(){
 let online=true,check=async()=>online,patch=async()=>({data:{success:true}}),beforeSend=async()=>{};
 let requestInterceptor,responseFailure;
 const calls=[];
 async function send(method,args){
  await beforeSend();
  const config={...args[2],headers:{}};
  await requestInterceptor(config);
  calls.push([method,...args]);
  return patch();
 }
 const client={interceptors:{request:{use(fn){requestInterceptor=fn}},response:{use(_ok,fail){responseFailure=fail}}},patch:(...args)=>send('patch',args),post:(...args)=>send('post',args)};
 const c={exports:{},__DEV__:false,process:{env:{}},console,require:name=>{
  if(name==='axios')return {default:{create:()=>client}};
  if(name==='expo-secure-store')return {deleteItemAsync:async()=>{}};
  if(name==='react-native')return {Platform:{OS:'ios'}};
  if(name==='./offlineService')return {checkOnlineStatus:()=>check()};
  if(name==='../utils/uploadMetadata'||name==='expo-file-system/legacy')return {};
  throw Error(name);
 }};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/services/api.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,c);
 const api=c.exports.api;api.token='token';
 return {api,calls,responseFailure:(...args)=>responseFailure(...args),set online(v){online=v},set check(fn){check=fn},set patch(fn){patch=fn},set beforeSend(fn){beforeSend=fn}};
}
test('timesheet correction and approval are online-only and bind the original session',async()=>{
 for(const action of ['correct','approve']){const f=setup();f.online=false;
  await assert.rejects(f.api.writeTimeEntry('entry',action,{reason:'Correction'}),/Connect/);assert.equal(f.calls.length,0);
  f.online=true;await f.api.writeTimeEntry('entry/slash',action,{reason:'Correction'});
  assert.equal(f.calls[0][0],action==='approve'?'post':'patch');
  assert.equal(f.calls[0][1],'/workforce-operations/time-entries/entry%2Fslash'+(action==='approve'?'/approve':''));
  assert.equal(f.calls[0][3].expectedAuthToken,'token');
 }
});
test('account changes before sending or completing timesheet writes are rejected',async()=>{
 for(const action of ['correct','approve'])for(const stage of ['check','patch']){
  const f=setup();f[stage]=async()=>{f.api.token='other';f.api.authRevision++;return stage==='check'?true:{data:{success:true}};};
  await assert.rejects(f.api.writeTimeEntry('entry',action,{}),/Account changed/);assert.equal(f.calls.length,stage==='check'?0:1);
 }
});

test('same-token session replacement before Axios dispatch prevents the mutation',async()=>{
 for(const action of ['correct','approve']){
  const f=setup();f.beforeSend=async()=>{f.api.authRevision++;};
  await assert.rejects(f.api.writeTimeEntry('entry',action,{}),/Account changed/);
  assert.equal(f.calls.length,0);
 }
});
test('an old-session 401 cannot log out a new session using the same token',async()=>{
 const f=setup();let logouts=0;f.api.setUnauthorizedHandler(()=>logouts++);
 await f.api.writeTimeEntry('entry','approve');const config=f.calls[0][3];
 assert.equal(config.expectedAuthRevision,0);f.api.authRevision++;
 await assert.rejects(f.responseFailure(Object.assign(Error('old unauthorized'),{response:{status:401},config})),/old unauthorized/);
 assert.equal(logouts,0);assert.equal(f.api.token,'token');
 await assert.rejects(f.responseFailure(Object.assign(Error('current unauthorized'),{response:{status:401},config:{...config,expectedAuthRevision:1}})),/current unauthorized/);
 assert.equal(logouts,1);assert.equal(f.api.token,null);
});
