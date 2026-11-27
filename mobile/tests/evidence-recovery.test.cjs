const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const requestKey='evidence-recovery-key';
const fields={requestKey,userId:'employee',projectId:'project'};
const success={status:200,data:{success:true,requestKey,photoId:'photo'}};
const missing={status:404,data:{code:'EVIDENCE_REQUEST_NOT_FOUND',requestKey}};
function setup(){
 let queue=[],online=true,status=async()=>missing,post=async()=>success;
 const files=new Set(['file:///camera/original.mov']),copied=[],posts=[],gets=[];
 const client={interceptors:{request:{use(){}},response:{use(){}}},
  get:async(...args)=>{gets.push(args);return status();},
  post:async(...args)=>{posts.push(args);return post(...args);}};
 const context={exports:{},__DEV__:false,process:{env:{}},console,
  FormData:class {constructor(){this.entries=[];}append(...args){this.entries.push(args);}},
  require:name=>{
   if(name==='axios')return {default:{create:()=>client}};
   if(name==='expo-secure-store')return {getItemAsync:async()=>JSON.stringify({id:'employee'})};
   if(name==='expo-file-system/legacy')return {documentDirectory:'file:///app/',copyAsync:async({from,to})=>{copied.push({from,to});if(!files.has(from))throw Error('File missing');files.add(to);}};
   if(name==='react-native')return {Platform:{OS:'ios'}};
   if(name==='../utils/uploadMetadata')return {uploadMetadata:(_uri,_field,info)=>({name:info?.name||'original.mov',type:info?.mimeType||'video/quicktime'})};
   if(name==='./offlineService')return {
    validEvidenceKey:key=>typeof key==='string'&&/^[a-zA-Z0-9_.:-]{16,100}$/.test(key),
    isEvidenceUpload:url=>url==='/photos/upload',checkOnlineStatus:async()=>online,
    getPendingEvidence:async(_owner,_project,key)=>queue.find(item=>item.data.requestKey===key),
    queueAction:async action=>{queue.push(JSON.parse(JSON.stringify(action)));},
    completeQueuedEvidence:async key=>{queue=queue.filter(item=>{if(item.data.requestKey!==key)return true;files.delete(item.fileUri);return false;});}
   };
   throw Error('Unexpected dependency '+name);
  }};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/services/api.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
 const api=context.exports.api;api.token='token';
 return {files,copied,posts,gets,api,set post(value){post=value;},get queue(){return queue;},set status(value){status=value;},set online(value){online=value;},
  upload:(uri='file:///camera/original.mov',replay=false,onProgress)=>api.uploadFileWithData('/photos/upload',uri,fields,'file',replay,{name:'original.mov',mimeType:'video/quicktime'},'token','employee',onProgress)};
}
test('completed receipt recovers after background sync deleted both queue entry and file',async()=>{
 const f=setup();f.status=async()=>success;
 const result=await f.upload('file:///app/'+requestKey+'.mov');
 assert.equal(result.photoId,'photo');assert.equal(f.copied.length,0);assert.equal(f.posts.length,0);assert.equal(f.queue.length,0);
});
test('first-upload status failure durably preserves original and never posts',async()=>{
 const f=setup();f.status=async()=>{throw Error('timeout');};
 await assert.rejects(f.upload(),error=>error.code==='EVIDENCE_PENDING');
 assert.equal(f.queue.length,1);assert.equal(f.queue[0].data.requestKey,requestKey);assert.ok(f.files.has(f.queue[0].fileUri));assert.equal(f.posts.length,0);
 f.files.delete('file:///camera/original.mov');f.status=async()=>success;
 assert.equal((await f.upload()).photoId,'photo');assert.equal(f.copied.length,1);assert.equal(f.posts.length,0);assert.equal(f.queue.length,0);
});
test('pending and uncertain receipts preserve captures without reposting on repeated checks',async()=>{
 for(const state of ['processing','uncertain']){
  const f=setup();f.status=async()=>({status:202,data:{success:false,state,requestKey,retryAllowed:false}});
  await assert.rejects(f.upload(),error=>error.code==='EVIDENCE_PENDING');
  await assert.rejects(f.upload(f.queue[0].fileUri,true),error=>error.code==='EVIDENCE_PENDING');
  assert.equal(f.queue.length,1);assert.equal(f.copied.length,1);assert.equal(f.posts.length,0);
 }
});
test('offline first upload saves before returning queued, then sends exactly once after verified absence',async()=>{
 const f=setup();f.online=false;
 await assert.rejects(f.upload(),error=>error.code==='EVIDENCE_QUEUED');
 assert.equal(f.queue.length,1);assert.ok(f.files.has(f.queue[0].fileUri));assert.equal(f.gets.length,0);assert.equal(f.posts.length,0);
 f.online=true;assert.equal((await f.upload(f.queue[0].fileUri,true)).photoId,'photo');
 assert.equal(f.copied.length,1);assert.equal(f.posts.length,1);assert.equal(f.queue.length,0);
});
test('generic or mismatched not-found responses never authorize upload and preserve capture',async()=>{
 for(const response of [{status:404,data:{}},{status:404,data:{...missing.data,requestKey:'different-key'}}]){
  const f=setup();f.status=async()=>{throw {response};};
  await assert.rejects(f.upload(),error=>error.code==='EVIDENCE_PENDING');assert.equal(f.posts.length,0);assert.equal(f.queue.length,1);
 }
});
test('matching rejected 404 permits upload only after local persistence',async()=>{
 const f=setup();f.status=async()=>{throw {response:missing};};
 assert.equal((await f.upload()).photoId,'photo');assert.equal(f.copied.length,1);assert.equal(f.posts.length,1);
});
test('authorization denial never posts or silently treats receipt as missing',async()=>{
 for(const status of [401,403]){
  const f=setup();f.status=async()=>{throw {response:{status}};};
  await assert.rejects(f.upload(),error=>error.response.status===status);assert.equal(f.posts.length,0);
 }
});

test('foreground progress is advisory, monotonic and ends after the transport settles',async()=>{
 const f=setup(),seen=[];let report;
 f.post=async(_url,_body,config)=>{
  report=config.onUploadProgress;
  report({loaded:10,total:100});
  report({loaded:9,total:100});
  report({loaded:50,total:100});
  report({loaded:100,total:100});
  assert.equal(f.queue.length,1,'transport 100% is not a server receipt');
  return success;
 };
 assert.equal((await f.upload(undefined,false,p=>seen.push(JSON.stringify(p)))).photoId,'photo');
 report({loaded:200,total:200});
 assert.deepEqual(seen.map(x=>JSON.parse(x)),[
  {phase:'checking'},{phase:'uploading'},{phase:'uploading',loaded:10,total:100},
  {phase:'uploading',loaded:50,total:100},{phase:'uploading',loaded:100,total:100},
 ]);
 assert.equal(f.queue.length,0);
});
test('a changed total does not manufacture a percentage and a throwing observer cannot fail the receipt',async()=>{
 const f=setup(),seen=[];
 f.post=async(_url,_body,config)=>{
  config.onUploadProgress(null);
  config.onUploadProgress({loaded:10,total:100});
  config.onUploadProgress({loaded:20,total:200});
  config.onUploadProgress({loaded:200,total:200});
  return success;
 };
 assert.equal((await f.upload(undefined,false,p=>{seen.push(JSON.stringify(p));throw Error('observer');})).photoId,'photo');
 assert.deepEqual(seen.map(x=>JSON.parse(x)).slice(-3),[
  {phase:'uploading',loaded:10,total:100},{phase:'uploading',loaded:20},{phase:'uploading',loaded:200},
 ]);
});
test('auth revision change suppresses stale progress and keeps the original pending',async()=>{
 const f=setup(),seen=[];
 f.post=async(_url,_body,config)=>{
  config.onUploadProgress({loaded:1,total:2});
  f.api.authRevision++;
  config.onUploadProgress({loaded:2,total:2});
  return success;
 };
 await assert.rejects(f.upload(undefined,false,p=>seen.push(p.loaded)),e=>e.code==='EVIDENCE_ACCOUNT_CHANGED');
 assert.deepEqual(seen,[undefined,undefined,1]);assert.equal(f.queue.length,1);
});
test('offline sync replay has no foreground progress observer',async()=>{
 const f=setup(),seen=[];f.online=false;
 await assert.rejects(f.upload(),e=>e.code==='EVIDENCE_QUEUED');
 f.online=true;
 f.post=async(_url,_body,config)=>{assert.equal(config.onUploadProgress,undefined);return success;};
 assert.equal((await f.upload(f.queue[0].fileUri,true,p=>seen.push(p))).photoId,'photo');
 assert.deepEqual(seen,[]);
});
