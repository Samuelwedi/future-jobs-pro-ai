const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/services/lucyWorkspace.ts'),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const flush=async()=>{for(let n=0;n<10;n++)await Promise.resolve();};
function setup(overrides={}){
 const timers=new Set();const calls=[];
 const client={get:async url=>{calls.push(['get',url]);return url.endsWith('/work')?{enabled:true,jobs:[]}:{preferences:[]};},put:async(url,data)=>({preference:{key:url.split('/').pop(),...data}}),post:async(url,data)=>({job:{id:'job',prompt:data?.prompt,status:'queued',createdAt:new Date().toISOString()}}),delete:async()=>{},...overrides};
 const reportContext={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/utils/lucyWorkReport.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,reportContext);
 const context={exports:{},require:name=>{assert.equal(name,'../utils/lucyWorkReport');return reportContext.exports;},setInterval:fn=>{timers.add(fn);return fn;},clearInterval:fn=>timers.delete(fn)};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
 const controller=new context.exports.LucyWorkspaceController(client);return {controller,client,timers,calls,Controller:context.exports.LucyWorkspaceController};
}
test('real create handler locks synchronously, keeps draft and request identity after uncertainty, and reconciles retry',async()=>{
 const wait=deferred();const posts=[];let fail=true;
 const {controller:c}=setup({post:async(url,data)=>{posts.push({url,data});if(fail){await wait.promise;throw Error('lost response');}return {job:{id:'same-job',prompt:data.prompt,status:'queued'}};}});
 c.open();await flush();c.setPrompt('Review projects');const first=c.create();await c.create();assert.equal(posts.length,1);assert.equal(c.snapshot().busy,true);
 wait.resolve();await first;assert.equal(c.snapshot().prompt,'Review projects');assert.equal(c.snapshot().error,'saveError');assert.equal(c.snapshot().busy,false);
 c.close();c.open();await flush();fail=false;await c.create();assert.equal(posts.length,2);assert.equal(posts[0].data.requestKey,posts[1].data.requestKey);assert.equal(c.snapshot().prompt,'');assert.equal(c.snapshot().jobs.length,1);c.close();
});
test('late refresh cannot overwrite saved preference or cancelled job',async()=>{
 const reads=[];const {controller:c,client}=setup();c.open();await flush();
 client.get=url=>{const wait=deferred();reads.push({url,...wait});return wait.promise;};
 const loading=c.refresh();c.choose('response_style','formal');await c.save('response_style');
 reads.forEach(read=>read.resolve(read.url.endsWith('/work')?{enabled:true,jobs:[]}:{preferences:[]}));await loading;
 assert.equal(c.snapshot().preferences[0].value,'formal');assert.equal(c.snapshot().loading,false);
 c.setPrompt('Review tasks');await c.create();
 client.post=async()=>({job:{id:'job',status:'cancelled'}});await c.cancel('job');assert.equal(c.snapshot().jobs[0].status,'cancelled');c.close();
});
test('close/background/navigation lifecycle stops polling and rejects late results, reopening reloads',async()=>{
 const wait=deferred();const {controller:c,timers,client}=setup({get:()=>wait.promise});c.open();assert.equal(timers.size,1);c.close();assert.equal(timers.size,0);
 wait.resolve({preferences:[{key:'response_style',value:'formal'}],enabled:true,jobs:[{id:'private'}]});await flush();assert.equal(c.snapshot().preferences.length,0);assert.equal(c.snapshot().jobs.length,0);
 client.get=async url=>url.endsWith('/work')?{enabled:false,jobs:[]}:{preferences:[]};c.open();await flush();assert.equal(c.snapshot().enabled,false);assert.equal(timers.size,1);c.close();
});
test('unavailable is not disabled; drafts and choices survive failed refresh and write',async()=>{
 const {controller:c,client}=setup();c.open();await flush();c.setPrompt('Retain this research');c.choose('week_start','sunday');
 client.get=async()=>{throw Error('offline');};client.put=async()=>{throw Error('offline');};await c.refresh();assert.equal(c.snapshot().enabled,null);assert.equal(c.snapshot().ready,false);assert.equal(c.snapshot().error,'loadError');
 await c.create();assert.equal(c.snapshot().prompt,'Retain this research');await c.save('week_start');assert.equal(c.snapshot().choices.week_start,'sunday');assert.equal(c.snapshot().error,'saveError');c.close();
});
test('forget removes only confirmed preference; failed delete retains visible data',async()=>{
 const {controller:c,client}=setup();c.open();await flush();await c.save('detail_level');client.delete=async()=>{throw Error('offline');};await c.forget('detail_level');assert.equal(c.snapshot().preferences.length,1);
 client.delete=async()=>{};await c.forget('detail_level');assert.equal(c.snapshot().preferences.length,0);c.close();
});
test('new account controller starts empty and never receives previous account pending result',async()=>{
 const wait=deferred();const {controller:old,Controller,client}=setup({put:()=>wait.promise});old.open();await flush();old.choose('response_style','formal');const saving=old.save('response_style');old.close();
 const next=new Controller(client);next.open();await flush();wait.resolve({preference:{key:'response_style',value:'formal'}});await saving;
 assert.equal(next.snapshot().preferences.length,0);assert.equal(next.snapshot().prompt,'');assert.equal(old.snapshot().preferences.length,0);next.close();
});
test('component wiring keys controller by account/company/role, watches foreground/focus, and preserves selected chat language',()=>{
 const panel=fs.readFileSync(path.join(__dirname,'../src/components/LucyWorkspacePanel.tsx'),'utf8');
 assert.match(panel,/\[user\?\.id,user\?\.companyId,user\?\.role\]/);assert.match(panel,/visible&&focused&&foreground/);assert.match(panel,/AppState.addEventListener/);assert.match(panel,/controller.close\(\);onClose\(\)/);
 const screen=fs.readFileSync(path.join(__dirname,'../src/screens/AIAssistantScreen.tsx'),'utf8');assert.match(screen,/language: lang/);assert.match(screen,/<LucyWorkspacePanel/);
});
test('polling runs only for active work and does not overlap a pending read',async()=>{
 const {controller:c,timers,client,calls}=setup();c.open();await flush();const tick=[...timers][0];tick();await flush();assert.equal(calls.length,2);
 c.setPrompt('Read schedules');await c.create();tick();await flush();assert.equal(calls.length,4);
 c.setPrompt('Read projects');await c.create();const wait=deferred();let reads=0;client.get=()=>{reads++;return wait.promise;};tick();tick();assert.equal(reads,2);c.close();assert.equal(timers.size,0);wait.resolve({preferences:[],enabled:true,jobs:[]});await flush();
});
test('pending mutation survives hidden/reopened panel without unlocking a second mutation',async()=>{
 const wait=deferred();let posts=0;const {controller:c}=setup({post:async()=>{posts++;return wait.promise;}});c.open();await flush();c.setPrompt('Read tasks');const first=c.create();c.close();c.open();await c.create();assert.equal(posts,1);
 wait.resolve({job:{id:'late',status:'queued'}});await first;await flush();assert.equal(c.snapshot().busy,false);assert.equal(c.snapshot().prompt,'Read tasks');c.close();
});
test('acknowledged work releases its key so deliberately repeating the same prompt creates new work',async()=>{
 const posts=[];const {controller:c}=setup({post:async(url,data)=>{posts.push(data);return {job:{id:`job-${posts.length}`,prompt:data.prompt,status:posts.length===1?'failed':'queued'}};}});
 c.open();await flush();c.setPrompt('Review projects');await c.create();assert.equal(c.snapshot().prompt,'');
 c.setPrompt('Review projects');await c.create();assert.equal(posts.length,2);assert.notEqual(posts[0].requestKey,posts[1].requestKey);assert.equal(c.snapshot().jobs.length,2);c.close();
});
test('hidden acknowledgement keeps the original request key until the user sees a retry acknowledgement',async()=>{
 const wait=deferred(),posts=[];let first=true;const {controller:c}=setup({post:async(url,data)=>{posts.push(data);if(first){first=false;return wait.promise;}return {job:{id:'confirmed',prompt:data.prompt,status:'completed'}};}});
 c.open();await flush();c.setPrompt('Review schedules');const pending=c.create();c.close();wait.resolve({job:{id:'confirmed',status:'completed'}});await pending;
 c.open();await flush();await c.create();assert.equal(posts[0].requestKey,posts[1].requestKey);assert.equal(c.snapshot().prompt,'');
 c.setPrompt('Review schedules');await c.create();assert.notEqual(posts[1].requestKey,posts[2].requestKey);c.close();
});

const modern={enabled:false,modes:{ai_research:false,record_search:true},jobs:[]};
test('new servers default to record search even when AI is disabled and send the explicit mode',async()=>{
 const posts=[];const {controller:c}=setup({get:async url=>url.endsWith('/work')?modern:{preferences:[]},post:async(url,data)=>{posts.push(data);return {job:{id:'records',status:'queued'}};}});
 c.open();await flush();assert.equal(c.snapshot().mode,'record_search');assert.equal(c.snapshot().enabled,true);
 c.setMode('ai_research');assert.equal(c.snapshot().mode,'record_search');c.setPrompt('Riverside');await c.create();assert.equal(posts[0].mode,'record_search');c.close();
});
test('legacy servers remain AI-only without sending an unsupported mode field',async()=>{
 const posts=[];const {controller:c}=setup({post:async(url,data)=>{posts.push(data);return {job:{id:'legacy',status:'queued'}};}});
 c.open();await flush();assert.equal(c.snapshot().mode,'ai_research');assert.equal(c.snapshot().modes.explicit,false);
 c.setMode('record_search');assert.equal(c.snapshot().mode,'ai_research');c.setPrompt('Legacy task');await c.create();assert.equal(Object.hasOwn(posts[0],'mode'),false);c.close();
});
test('malformed explicit capability metadata never falls back to legacy enabled or enables submission',async()=>{
 for(const modes of [null,{},[],{ai_research:true},{ai_research:'true',record_search:true},{ai_research:true,record_search:1}]){
  let posts=0;const {controller:c}=setup({get:async url=>url.endsWith('/work')?{enabled:true,modes,jobs:[]}:{preferences:[]},post:async()=>{posts++;}});
  c.open();await flush();assert.equal(c.snapshot().enabled,false);c.setPrompt('No unsafe fallback');await c.create();assert.equal(posts,0);c.close();
 }
});
test('request keys stay scoped to mode and prompt across uncertainty, switching and reopening',async()=>{
 const posts=[];let fail=true;const {controller:c}=setup({get:async url=>url.endsWith('/work')?{...modern,modes:{ai_research:true,record_search:true}}:{preferences:[]},post:async(url,data)=>{posts.push(data);if(fail)throw Error('offline');return {job:{id:'done',status:'completed'}};}});
 c.open();await flush();c.setPrompt('Handover');await c.create();c.setMode('ai_research');await c.create();
 assert.notEqual(posts[0].requestKey,posts[1].requestKey);assert.equal(posts[0].mode,'record_search');assert.equal(posts[1].mode,'ai_research');
 c.setMode('record_search');c.close();c.open();await flush();await c.create();assert.equal(posts[0].requestKey,posts[2].requestKey);
 c.setPrompt('Another');await c.create();assert.notEqual(posts[0].requestKey,posts[3].requestKey);
 c.setPrompt('Handover');fail=false;await c.create();assert.equal(posts[0].requestKey,posts[4].requestKey);
 c.setPrompt('Handover');await c.create();assert.notEqual(posts[4].requestKey,posts[5].requestKey);c.close();
});
test('mode changes preserve long drafts, enforce limits and cannot alter in-flight work',async()=>{
 const posts=[],wait=deferred();const {controller:c}=setup({get:async url=>url.endsWith('/work')?{...modern,modes:{ai_research:true,record_search:true}}:{preferences:[]},post:async(url,data)=>{posts.push(data);return wait.promise;}});
 c.open();await flush();c.setPrompt('x'.repeat(201));assert.equal(c.snapshot().prompt.length,200);
 c.setMode('ai_research');c.setPrompt('x'.repeat(4001));assert.equal(c.snapshot().prompt.length,4000);c.setMode('record_search');assert.equal(c.snapshot().prompt.length,4000);await c.create();assert.equal(posts.length,0);
 c.setPrompt('short');const pending=c.create();c.setMode('ai_research');c.setPrompt('changed');assert.equal(c.snapshot().mode,'record_search');assert.equal(c.snapshot().prompt,'short');
 wait.resolve({job:{id:'ack',status:'queued'}});await pending;c.close();
});
test('selected AI does not silently become record search when capability changes, and failed loads clear capabilities',async()=>{
 const {controller:c,client}=setup({get:async url=>url.endsWith('/work')?{...modern,modes:{ai_research:true,record_search:true}}:{preferences:[]}});
 c.open();await flush();c.setMode('ai_research');client.get=async url=>url.endsWith('/work')?modern:{preferences:[]};await c.refresh();assert.equal(c.snapshot().mode,'ai_research');assert.equal(c.snapshot().enabled,false);
 c.setMode('record_search');assert.equal(c.snapshot().enabled,true);client.get=async()=>{throw Error('offline');};await c.refresh();assert.equal(c.snapshot().modes,null);assert.equal(c.snapshot().enabled,null);c.close();
});
