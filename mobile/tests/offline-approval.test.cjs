const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('fs'),vm=require('vm'),ts=require('typescript'),path=require('path');
function setup(){let saved='[]',replayed=0;const context={exports:{},require:name=>{
 if(name.includes('async-storage'))return {default:{getItem:async()=>saved,setItem:async(_,v)=>{saved=v;}}};
 if(name.includes('secure-store'))return {getItemAsync:async()=>JSON.stringify({id:'employee'})};
 if(name==='expo-network')return {getNetworkStateAsync:async()=>({isConnected:true,isInternetReachable:true})};
 if(name==='./api')return {api:{replayQueued:async()=>{replayed++;}}};throw Error(name);
 }};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/services/offlineService.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
 return {api:context.exports,get saved(){return JSON.parse(saved)},set saved(v){saved=JSON.stringify(v)},get replayed(){return replayed}};}
test('PTO decisions and company settings never queue or silently replay while evidence still queues',async()=>{
 const f=setup();for(const url of ['/pto','/pto-history/request/status','/companies/company/settings','/companies/company/logo','/payroll-rules/policy']){await assert.rejects(f.api.queueAction({method:'POST',url}),/online/);assert.equal(f.saved.length,0);f.saved=[{id:'old',method:'PATCH',url}];await assert.rejects(f.api.processQueue(),/review/);assert.equal(f.replayed,0);f.saved=[];}
 await f.api.queueAction({method:'POST',url:'/media/upload',fileUri:'local.jpg'});assert.equal(f.saved.length,1);await f.api.processQueue();assert.equal(f.replayed,1);assert.equal(f.saved.length,0);
});
