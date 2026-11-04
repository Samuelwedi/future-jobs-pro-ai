const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('fs'),vm=require('vm'),ts=require('typescript'),path=require('path');
function setup(){const saved=new Map();let account='employee',online=true;const replayed=[];let replay=async a=>{replayed.push(a.id);};
 const context={exports:{},require:name=>{
 if(name.includes('async-storage'))return {default:{getItem:async k=>saved.get(k)||null,setItem:async(k,v)=>{saved.set(k,v);}}};
 if(name.includes('secure-store'))return {getItemAsync:async()=>JSON.stringify({id:account})};
 if(name==='expo-network')return {getNetworkStateAsync:async()=>({isConnected:online,isInternetReachable:online})};
 if(name==='./api')return {api:{replayQueued:async a=>replay(a)}};throw Error(name);
 }};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/services/offlineService.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
 return {api:context.exports,get saved(){return JSON.parse(saved.get('offline-queue-v2:'+account)||'[]')},set saved(v){saved.set('offline-queue-v2:'+account,JSON.stringify(v))},set raw(v){saved.set('offline-queue-v2:'+account,v)},replayed,set account(v){account=v},set online(v){online=v},set replay(fn){replay=fn}};
}
test('PTO and account records remain reviewable without blocking queued media',async()=>{
 const f=setup();for(const url of ['/pto','/pto-history/request/status','/companies/company/settings','/companies/company/logo','/payroll-rules/policy','/team/user/role','/users/profile','/kiosk/set-pin','/workforce-operations/time-entries/entry/approve','/lucy-v2','/time-entries/bulk-clock-in','/time-entries/bulk-clock-out','/crew/clock-out']){
 await assert.rejects(f.api.queueAction({method:'POST',url}),/online/);assert.equal(f.saved.length,0);
 f.saved=[{id:'old',method:'PATCH',url,timestamp:1,data:{private:'original'}}];await f.api.queueAction({method:'POST',url:'/media/upload',fileUri:'local.jpg'});
 await f.api.processQueue();assert.equal(f.saved.length,1);assert.equal(f.saved[0].id,'old');assert.equal((await f.api.getOfflineQueueState()).items[0].status,'review');f.saved=[];
 }
 assert.equal(f.replayed.length,13);assert.ok(!f.replayed.includes('old'));
});
test('archive is reversible, retains payloads, and rejects the wrong account or ordinary uploads',async()=>{
 const f=setup();f.saved=[{id:'old',url:'/pto',timestamp:1,data:{reason:'private'},fileUri:'local.jpg'},{id:'media',url:'/media/upload',timestamp:2}];
 const state=await f.api.getOfflineQueueState();assert.equal(state.ownerId,'employee');assert.equal(JSON.stringify(state).includes('private'),false);
 await f.api.setOfflineReviewArchived('old','employee',true);assert.equal(f.saved[0].data.reason,'private');assert.equal(f.saved[0].fileUri,'local.jpg');assert.equal(await f.api.getPendingCount(),1);
 await assert.rejects(f.api.setOfflineReviewArchived('media','employee',true),/review/);
 await f.api.setOfflineReviewArchived('old','employee',false);assert.equal(await f.api.getPendingCount(),2);
 f.account='other';await assert.rejects(f.api.setOfflineReviewArchived('old','employee',true),/Account changed/);assert.equal(f.saved.length,0);f.account='employee';assert.equal(f.saved.length,2);
});
test('failed replay retains work and order; concurrent sync does not duplicate sends',async()=>{
 const f=setup();f.saved=[{id:'first',url:'/media/upload',timestamp:1},{id:'second',url:'/media/upload',timestamp:2}];
 f.replay=async()=>{throw Error('network');};await assert.rejects(f.api.processQueue(),/network/);assert.equal(f.saved.length,2);
 const ids=[];f.replay=async a=>{ids.push(a.id);await Promise.resolve();};await Promise.all([f.api.processQueue(),f.api.processQueue()]);assert.deepEqual(ids,['first','second']);assert.equal(f.saved.length,0);
});
test('offline and corrupt storage cannot discard queued records',async()=>{
 const f=setup();f.saved=[{id:'first',url:'/media/upload',timestamp:1}];f.online=false;await f.api.processQueue();assert.equal(f.saved.length,1);assert.equal(f.replayed.length,0);
 f.online=true;f.raw='{"broken":true}';await assert.rejects(f.api.processQueue(),/not been changed/);await assert.rejects(f.api.queueAction({method:'POST',url:'/media/upload'}),/not been changed/);assert.deepEqual(f.saved,{broken:true});
});
test('replay stops when the signed-in account changes',async()=>{
 const f=setup();f.saved=[{id:'first',url:'/media/upload',timestamp:1},{id:'second',url:'/media/upload',timestamp:2}];
 f.replay=async a=>{f.replayed.push(a.id);f.account='other';};await f.api.processQueue();assert.deepEqual(f.replayed,['first']);assert.equal(f.saved.length,0);f.account='employee';assert.equal(f.saved[0].id,'second');
});

test('personal clock actions remain queueable while supervisor actions require review',async()=>{
 const f=setup();
 for(const url of ['/time-entries/clock-in','/time-entries/clock-out'])await f.api.queueAction({method:'POST',url});
 assert.equal(f.saved.length,2);await f.api.processQueue();assert.equal(f.saved.length,0);assert.equal(f.replayed.length,2);
 for(const url of ['/api/time-entries/bulk-clock-in?source=crew','/CREW/CLOCK-OUT'])assert.equal(f.api.requiresOnlineConfirmation(url),true);
});
