const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const owner={id:'owner',companyId:'company',role:'manager'};
const source=fs.readFileSync(path.join(__dirname,'../src/services/api.ts'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function fixture(){
 let request, check=()=>{}, read=()=>JSON.stringify(owner), beforeResolve=()=>{};
 const sends=[];
 const client={
  interceptors:{request:{use:fn=>request=fn},response:{use:()=>{}}},
  async get(url,config){return send('GET',url,null,config);},
  async put(url,body,config){return send('PUT',url,body,config);},
 };
 async function send(method,url,body,config){check(); const sent=await request({...config,headers:{...config.headers}}); sends.push({method,url,body,config:sent}); beforeResolve(); return {data:{success:true}};}
 const ctx={exports:{},__DEV__:false,process:{env:{}},console:{error(){},log(){},warn(){}},require:name=>{
  if(name==='axios')return {default:{create:()=>client}};
  if(name==='expo-secure-store')return {getItemAsync:async()=>read()};
  if(name==='react-native')return {Platform:{OS:'ios'}};
  if(['./offlineService','../utils/uploadMetadata','expo-file-system/legacy'].includes(name))return {};
  throw Error(name);
 }};
 vm.runInNewContext(compiled,ctx); const api=ctx.exports.api; api.token='token';
 return {api,sends,setCheck:fn=>check=fn,setRead:fn=>read=fn,setBeforeResolve:fn=>beforeResolve=fn};
}
const copy={targetProjectId:'target/z',photoId:'photo/z'};
test('album, picker, and explicit copy keep the same locked actor and tenant headers',async()=>{
 const f=fixture();
 for(const op of ['album','targets',copy]) await f.api.projectPhotos('source/z',owner,()=>true,op);
 assert.deepEqual(f.sends.map(r=>[r.method,r.url]),[
  ['GET','/photos/project/source%2Fz'],
  ['GET','/photos/project/source%2Fz/reference-targets'],
  ['PUT','/photos/project/target%2Fz/photo/photo%2Fz/reference'],
 ]);
 assert.equal(f.sends[2].body.sourceProjectId,'source/z');
 for(const {config} of f.sends) {
  assert.equal(config.headers.Authorization,'Bearer token');
  assert.equal(config.headers['X-Project-Actor'],owner.id);
  assert.equal(config.headers['X-Project-Company'],owner.companyId);
  assert.equal(config.fenceUnauthorizedToCurrent,true);
 }
});
test('cannot copy after native app/view or credential changes before dispatch',async()=>{
 for(const stage of ['secure-store','dispatch']){
  for(const changed of ['view','revision','company']){
   const f=fixture(); let current=true;
   const invalidate=()=>{if(changed==='view')current=false;else f.api.authRevision++;};
   if(stage==='secure-store') f.setRead(()=>{if(changed==='company')return JSON.stringify({...owner,companyId:'other'});invalidate();return JSON.stringify(owner);});
   else f.setCheck(invalidate);
   await assert.rejects(f.api.projectPhotos('source',owner,()=>current,copy),/changed/);
   assert.equal(f.sends.length,0);
  }
 }
});
test('different session cannot claim the completion of a queued copy or an active album',async()=>{
 const f=fixture();
 const album=await f.api.projectPhotos('source',owner,()=>true);
 assert.equal(album.isSessionCurrent(),true);
 f.setBeforeResolve(()=>f.api.authRevision++);
 await assert.rejects(f.api.projectPhotos('source',owner,()=>true,copy),/changed/);
 assert.equal(album.isSessionCurrent(),false);
 assert.equal(f.sends.length,2);
});
