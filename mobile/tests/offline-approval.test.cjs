const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('fs'),vm=require('vm'),ts=require('typescript'),path=require('path');
function setup(){const saved=new Map();let account='employee',online=true;const replayed=[],deleted=[];let remove=async uri=>deleted.push(uri);let replay=async a=>{replayed.push(a.id);};
 const context={exports:{},require:name=>{
 if(name.includes('async-storage'))return {default:{getItem:async k=>saved.get(k)||null,setItem:async(k,v)=>{saved.set(k,v);}}};
 if(name.includes('secure-store'))return {getItemAsync:async()=>JSON.stringify({id:account})};
 if(name==='expo-file-system/legacy')return {documentDirectory:'file:///app/',deleteAsync:async(uri)=>remove(uri)};
 if(name==='expo-network')return {getNetworkStateAsync:async()=>({isConnected:online,isInternetReachable:online})};
 if(name==='./api')return {api:{replayQueued:async a=>replay(a)}};throw Error(name);
 }};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/services/offlineService.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
 return {api:context.exports,deleted,set remove(fn){remove=fn},get saved(){return JSON.parse(saved.get('offline-queue-v2:'+account)||'[]')},set saved(v){saved.set('offline-queue-v2:'+account,JSON.stringify(v))},set raw(v){saved.set('offline-queue-v2:'+account,v)},replayed,set account(v){account=v},set online(v){online=v},set replay(fn){replay=fn}};
}
test('PTO and account records remain reviewable without blocking queued media',async()=>{
 const f=setup();for(const url of ['/pto','/pto-history/request/status','/companies/company/settings','/companies/company/logo','/payroll-rules/policy','/team/user/role','/users/profile','/kiosk/set-pin','/workforce-operations/time-entries/entry/approve','/lucy-v2','/time-entries/bulk-clock-in','/time-entries/bulk-clock-out','/crew/clock-out','/crew/clock-in']){
 await assert.rejects(f.api.queueAction({method:'POST',url}),/online/);assert.equal(f.saved.length,0);
 f.saved=[{id:'old',method:'PATCH',url,timestamp:1,data:{private:'original'}}];await f.api.queueAction({method:'POST',url:'/media/upload',fileUri:'local.jpg'});
 await f.api.processQueue();assert.equal(f.saved.length,1);assert.equal(f.saved[0].id,'old');assert.equal((await f.api.getOfflineQueueState()).items[0].status,'review');f.saved=[];
 }
 assert.equal(f.replayed.length,14);assert.ok(!f.replayed.includes('old'));
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



test('confirmed evidence cleanup deletes only the owned copy and retains unrelated captures',async()=>{
 const f=setup(),requestKey='evidence-completed-key';
 f.saved=[{id:'done',url:'/photos/upload',fileUri:'file:///app/'+requestKey+'.mov',data:{requestKey}},{id:'other',url:'/photos/upload',fileUri:'file:///app/other.mov',data:{requestKey:'evidence-other-key'}}];
 await f.api.completeQueuedEvidence(requestKey,'employee');assert.deepEqual(f.deleted,['file:///app/'+requestKey+'.mov']);assert.equal(f.saved.length,1);assert.equal(f.saved[0].id,'other');
 for(const uri of ['file:///camera/original.mov','file:///app/'+requestKey+'.../other.mov','file:///app/unrelated.mov']){
  f.saved=[{id:'done',url:'/photos/upload',fileUri:uri,data:{requestKey}}];await f.api.completeQueuedEvidence(requestKey,'employee');assert.equal(f.deleted.length,1);
 }
});
test('cleanup failure retains receipt and retry is idempotent without affecting another account',async()=>{
 const f=setup(),requestKey='evidence-completed-key';f.saved=[{id:'done',url:'/photos/upload',fileUri:'file:///app/'+requestKey+'.mov',data:{requestKey}}];
 f.remove=async()=>{throw Error('disk unavailable');};await assert.rejects(f.api.completeQueuedEvidence(requestKey,'employee'),/disk/);assert.equal(f.saved.length,1);
 f.account='other';f.saved=[{id:'other',url:'/media/upload'}];f.remove=async uri=>f.deleted.push(uri);await f.api.completeQueuedEvidence(requestKey,'employee');assert.equal(f.saved[0].id,'other');f.account='employee';assert.equal(f.saved.length,0);
});
test('transcript edits cannot enter or replay from the offline queue',async()=>{const f=setup();for(const url of ['/voice/note/transcript','/api/voice/note/transcript?x=1']){assert.equal(f.api.requiresOnlineConfirmation(url),true);await assert.rejects(f.api.queueAction({url,method:'PATCH',data:{transcript:'new'}}),/online/);f.saved=[{id:'old-edit',url,method:'PATCH'}];await f.api.processQueue();assert.equal(f.saved.length,1);assert.equal(f.replayed.length,0);}});
test('project writes including old archive actions remain review-only while offline',async()=>{const f=setup();for(const [method,url] of [['POST','/projects'],['DELETE','/projects/id'],['POST','/projects/id/restore']]){await assert.rejects(f.api.queueAction({method,url}),/online/);f.saved=[{id:'old-project',method,url}];await f.api.processQueue();assert.equal(f.replayed.length,0);assert.equal((await f.api.getOfflineQueueState()).items[0].status,'review');}});
test('legacy attachment uploads require review and never silently replay without receipts',async()=>{
 const f=setup();for(const url of ['/attachments/upload','/api/attachments/upload?source=old']){
  assert.equal(f.api.requiresOnlineConfirmation(url),true);await assert.rejects(f.api.queueAction({method:'POST',url,fileUri:'file:///old.pdf'}),/online/);
  f.saved=[{id:'old-attachment',method:'POST',url,fileUri:'file:///old.pdf'}];await f.api.processQueue();assert.equal(f.replayed.length,0);assert.equal(f.saved.length,1);
 }
});

test('legacy voice audio and transcript records stay review-only with payloads/files intact',async()=>{
 const f=setup();for(const url of ['/voice/process','/voice/process-transcript','/api/voice/process?old=true','/VOICE/PROCESS-TRANSCRIPT/']){
  const original={id:'old-voice',url,method:'POST',timestamp:1,fileUri:'file:///original.m4a',data:{requestKey:'stable-voice-request',transcript:'retained words'}};
  f.saved=[original];await assert.rejects(f.api.queueAction({method:'POST',url,fileUri:original.fileUri}),/online/);
  await f.api.processQueue();assert.deepEqual(f.saved,[original]);assert.equal(f.replayed.length,0);assert.equal(f.deleted.length,0);
  assert.equal((await f.api.getOfflineQueueState()).items[0].status,'review');
  await f.api.setOfflineReviewArchived('old-voice','employee',true);assert.equal(f.saved[0].fileUri,original.fileUri);assert.equal(f.saved[0].data.transcript,'retained words');
  await f.api.setOfflineReviewArchived('old-voice','employee',false);await f.api.processQueue();assert.deepEqual(f.saved,[{...original,archived:false}]);assert.equal(f.replayed.length,0);
 }
});

test('personal shift actions cannot be queued or replayed with a later server timestamp',async()=>{
 const f=setup();for(const url of ['/time-entries/clock-in','/time-entries/clock-out','/api/time-entries/clock-in?source=home','/TIME-ENTRIES/CLOCK-OUT/']){
  assert.equal(f.api.requiresOnlineConfirmation(url),true);await assert.rejects(f.api.queueAction({url,method:'POST',data:{projectId:'project'}}),/online/);
  f.saved=[{id:'old-personal-clock',url,method:'POST',data:{projectId:'project'},timestamp:1}];await f.api.processQueue();assert.equal(f.saved.length,1);assert.equal(f.replayed.length,0);assert.equal((await f.api.getOfflineQueueState()).items[0].status,'review');
 }
});

test('legacy chat messages and media remain review-only with original payloads intact',async()=>{
 const f=setup();for(const url of ['/chat/message','/chat/room/room/attachments','/chat/room/room/photo','/api/chat/message?old=1','/CHAT/MESSAGE/']){
  const original={id:'old-chat',url,method:'POST',data:{message:'keep my words'},fileUri:'file:///original.pdf'};
  await assert.rejects(f.api.queueAction({url,method:'POST',data:original.data}),/online/);f.saved=[original];await f.api.processQueue();assert.deepEqual(f.saved,[original]);assert.equal(f.replayed.length,0);assert.equal(f.deleted.length,0);assert.equal((await f.api.getOfflineQueueState()).items[0].status,'review');
  await f.api.setOfflineReviewArchived(original.id,'employee',true);await f.api.setOfflineReviewArchived(original.id,'employee',false);assert.equal(f.saved[0].data.message,'keep my words');assert.equal(f.saved[0].fileUri,'file:///original.pdf');
 }
});
