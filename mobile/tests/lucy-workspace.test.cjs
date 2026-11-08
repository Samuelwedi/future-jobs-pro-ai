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

const options={from:'2026-11-01',to:'2026-11-30',taskStatus:'open'};
const briefingServer={enabled:false,modes:{ai_research:true,record_search:true,work_briefing:true},jobs:[]};
const briefingSetup=(overrides={})=>setup({get:async url=>url.endsWith('/work')?briefingServer:{preferences:[]},...overrides});
test('briefing controls require valid explicit dates, send options without a prompt, and keep record search as the default',async()=>{
 const posts=[];const {controller:c}=briefingSetup({post:async(url,data)=>{posts.push(data);return {job:{id:`briefing-${posts.length}`,mode:data.mode,status:'queued'}};}});
 c.open();await flush();assert.equal(c.snapshot().mode,'record_search');assert.equal(c.snapshot().briefing.from,'');assert.equal(c.snapshot().briefing.to,'');
 c.setPrompt('Retain my keyword draft');c.setMode('work_briefing');await c.create();assert.equal(c.snapshot().error,'briefingInvalid');assert.equal(posts.length,0);
 for(const values of [{...options,from:'2026-02-30'}, {...options,to:'2026-12-02'}, {...options,to:'2026-10-31'}]){c.setBriefing(values);await c.create();assert.equal(posts.length,0);}
 c.setBriefing(options);assert.equal(c.snapshot().error,'');await c.create();assert.equal(posts.length,1);assert.deepEqual(JSON.parse(JSON.stringify(posts[0].options)),options);assert.equal(posts[0].mode,'work_briefing');assert.equal(Object.hasOwn(posts[0],'prompt'),false);assert.deepEqual(Object.keys(posts[0]).sort(),['mode','options','requestKey']);
 assert.equal(c.snapshot().prompt,'Retain my keyword draft');assert.deepEqual(JSON.parse(JSON.stringify(c.snapshot().briefing)),{from:'',to:'',taskStatus:'open'});
 await c.create();assert.equal(posts.length,1);c.setBriefing(options);await c.create();assert.equal(posts.length,2);assert.notEqual(posts[0].requestKey,posts[1].requestKey);c.close();
});
test('uncertain briefing A→B→A retries preserve exact request identity through mode edits and close/reopen',async()=>{
 const posts=[];let fail=true;const {controller:c}=briefingSetup({post:async(url,data)=>{posts.push(data);if(fail)throw Error('lost response');return {job:{id:'confirmed',status:'completed'}};}});
 c.open();await flush();c.setMode('work_briefing');c.setBriefing(options);await c.create();
 c.setBriefing({taskStatus:'completed'});await c.create();c.setBriefing({taskStatus:'open',to:'2026-11-29'});await c.create();c.setBriefing({to:'2026-11-30',from:'2026-11-02'});await c.create();
 assert.equal(new Set(posts.map(post=>post.requestKey)).size,4);
 c.setMode('record_search');c.setPrompt('Changed keywords');await c.create();c.setMode('work_briefing');c.setBriefing(options);c.close();c.open();await flush();await c.create();assert.equal(posts[0].requestKey,posts[5].requestKey);
 fail=false;await c.create();assert.equal(posts[0].requestKey,posts[6].requestKey);await c.create();assert.equal(posts.length,7);c.setBriefing(options);await c.create();assert.notEqual(posts[6].requestKey,posts[7].requestKey);c.close();
});
test('old servers reject briefing selection and capability loss never silently switches an explicitly selected mode',async()=>{
 for(const reply of [{enabled:true,jobs:[]},modern]){
  const posts=[];const {controller:c}=briefingSetup({get:async url=>url.endsWith('/work')?reply:{preferences:[]},post:async(...args)=>{posts.push(args);}});
  c.open();await flush();assert.equal(c.snapshot().modes.work_briefing,false);c.setMode('work_briefing');assert.notEqual(c.snapshot().mode,'work_briefing');c.setBriefing(options);await c.create();assert.equal(posts.length,0);c.close();
 }
 const {controller:c,client}=briefingSetup();c.open();await flush();c.setMode('work_briefing');c.setBriefing(options);
 client.get=async url=>url.endsWith('/work')?modern:{preferences:[]};await c.refresh();assert.equal(c.snapshot().mode,'work_briefing');assert.equal(c.snapshot().enabled,false);
 client.get=async()=>{throw Error('offline');};await c.refresh();assert.equal(c.snapshot().modes,null);assert.equal(c.snapshot().enabled,null);c.close();
});
test('briefing create locks inputs and stale scope/close handlers cannot submit, acknowledge or revive hidden work',async()=>{
 for(const useScope of [false,true]){
  const wait=deferred(),posts=[],scope={active:true};const {Controller,client}=briefingSetup({post:async(url,data)=>{posts.push(data);return wait.promise;}});
  const c=new Controller(client,undefined,()=>scope.active);c.open();await flush();c.setMode('work_briefing');c.setBriefing(options);const pending=c.create();
  c.setBriefing({taskStatus:'all',from:'2026-11-10'});c.setMode('ai_research');await c.create();assert.equal(posts.length,1);assert.deepEqual(JSON.parse(JSON.stringify(c.snapshot().briefing)),options);assert.equal(c.snapshot().mode,'work_briefing');
  if(useScope)scope.active=false;else c.close();await c.create();c.setBriefing({from:'2026-11-11'});wait.resolve({job:{id:'hidden-ack',status:'queued'}});await pending;assert.equal(c.snapshot().jobs.length,0);assert.equal(c.snapshot().busy,false);
  scope.active=true;c.close();c.open();await flush();await c.create();assert.equal(posts.length,2);assert.equal(posts[0].requestKey,posts[1].requestKey);c.close();
 }
});
test('malformed create acknowledgements retain the briefing key instead of silently allowing duplicates',async()=>{
 const posts=[];let bad=true;const {controller:c}=briefingSetup({post:async(url,data)=>{posts.push(data);return bad?{job:{status:'queued'}}:{job:{id:'valid',status:'queued'}};}});
 c.open();await flush();c.setMode('work_briefing');c.setBriefing(options);await c.create();assert.equal(c.snapshot().error,'saveError');bad=false;await c.create();assert.equal(posts[0].requestKey,posts[1].requestKey);assert.equal(c.snapshot().jobs[0].id,'valid');c.close();
});
test('uncertain request retention is bounded without evicting earlier briefing keys; new sessions start clean',async()=>{
 const posts=[];const {controller:c,Controller,client}=briefingSetup({post:async(url,data)=>{posts.push(data);throw Error('offline');}});
 c.open();await flush();c.setMode('work_briefing');c.setBriefing(options);
 for(let day=1;day<=21;day++){c.setBriefing({from:`2026-11-${String(day).padStart(2,'0')}`});await c.create();}
 assert.equal(posts.length,20);assert.equal(c.snapshot().error,'requestLimit');c.setBriefing(options);await c.create();assert.equal(posts.length,21);assert.equal(posts[0].requestKey,posts[20].requestKey);
 c.close();const next=new Controller(client);next.open();await flush();next.setMode('work_briefing');next.setBriefing(options);await next.create();assert.notEqual(posts[0].requestKey,posts[21].requestKey);next.close();
});
test('unknown future work modes never enable cancellation even with queued jobs',async()=>{
 const posts=[];const {controller:c}=briefingSetup({get:async url=>url.endsWith('/work')?{...briefingServer,jobs:[{id:'future',mode:'future_write',status:'queued'}]}:{preferences:[]},post:async(...args)=>{posts.push(args);}});
 c.open();await flush();await c.cancel('future');assert.equal(posts.length,0);c.close();
});


test('fast acknowledged briefing resets dates and status before a delayed second tap; explicit re-entry starts new work',async()=>{
 const posts=[];const {controller:c}=briefingSetup({post:async(url,data)=>{posts.push(data);return {job:{id:`ack-${posts.length}`,mode:'work_briefing',status:'queued'}};}});
 c.open();await flush();c.setMode('work_briefing');c.setBriefing({...options,taskStatus:'completed'});
 await c.create();await flush();assert.equal(c.snapshot().busy,false);assert.deepEqual(JSON.parse(JSON.stringify(c.snapshot().briefing)),{from:'',to:'',taskStatus:'open'});
 await c.create();await flush();assert.equal(posts.length,1);assert.equal(c.snapshot().jobs.length,1);
 c.setBriefing({...options,taskStatus:'completed'});await c.create();assert.equal(posts.length,2);assert.notEqual(posts[0].requestKey,posts[1].requestKey);assert.deepEqual(JSON.parse(JSON.stringify(posts[0].options)),JSON.parse(JSON.stringify(posts[1].options)));c.close();
});
test('uncertain and hidden briefing responses retain nondefault status and dates until visible acknowledgement',async()=>{
 for(const hidden of [false,true]){
  const wait=deferred(),posts=[];let first=true;const {controller:c}=briefingSetup({post:async(url,data)=>{posts.push(data);if(first){first=false;return wait.promise;}return {job:{id:'same-briefing',status:'queued'}};}});
  const draft={...options,taskStatus:'all'};c.open();await flush();c.setMode('work_briefing');c.setBriefing(draft);const pending=c.create();
  if(hidden){c.close();wait.resolve({job:{id:'same-briefing',status:'queued'}});}else wait.reject(Error('lost acknowledgement'));
  await pending;assert.deepEqual(JSON.parse(JSON.stringify(c.snapshot().briefing)),draft);
  if(hidden){c.open();await flush();}await c.create();assert.equal(posts[0].requestKey,posts[1].requestKey);assert.deepEqual(JSON.parse(JSON.stringify(c.snapshot().briefing)),{from:'',to:'',taskStatus:'open'});c.close();
 }
});
