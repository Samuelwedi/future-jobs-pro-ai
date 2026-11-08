const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const load=(file,requireFn=()=>{throw Error('Unexpected runtime dependency');},extra={})=>{
 const context={exports:{},require:requireFn,...extra};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,context);return context.exports;
};
const reportUtils=load('utils/lucyWorkReport.ts');
const {LucyWorkspaceController:Controller}=load('services/lucyWorkspace.ts',name=>{assert.equal(name,'../utils/lucyWorkReport');return reportUtils;},{setInterval:()=>1,clearInterval:()=>{}});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const flush=async()=>{for(let n=0;n<15;n++)await Promise.resolve();};
const job=()=>({id:'job-1',mode:'record_search',prompt:'Riverside',status:'completed',createdAt:'2026-11-08T11:59:00Z',completedAt:'2026-11-08T12:00:00Z',result:{text:'One matching record.',run:{status:'completed',modelCalls:0},evidence:{incomplete:false,sources:[{kind:'task',id:'task-1',title:'Handover',excerpt:'Delivery confirmation.',retrievedAt:'2026-11-08T12:00:00Z'}]}}});
async function setup(options={}){
 const calls=[],scope={current:true},value=options.job??job();
 const file={share:async title=>{calls.push(['share',title]);},cleanup:async()=>{calls.push(['cleanup']);},...options.file};
 const sharing={isAvailable:async()=>{calls.push(['available']);return true;},createTemporary:async report=>{calls.push(['create',report]);return file;},...options.sharing};
 const client={get:async url=>url.endsWith('/work')?{enabled:false,modes:{ai_research:false,record_search:true},jobs:[value]}:{preferences:[]},post:async()=>{calls.push(['post']);return {job:value};},put:async()=>{calls.push(['put']);return {};},delete:async()=>{calls.push(['delete']);}};
 const c=new Controller(client,sharing,()=>scope.current);c.open();await flush();return {c,client,sharing,file,calls,scope,value};
}
test('sharing is explicit, uses the loaded job only, and serializes the share sheet against all mutations',async()=>{
 const wait=deferred();const {c,calls,file,value}=await setup();assert.equal(calls.length,0);
 await c.shareReport({...value});assert.equal(calls.length,0);
 file.share=async title=>{calls.push(['share',title]);return wait.promise;};
 const pending=c.shareReport(value,'es','Compartir informe (.txt)');await flush();assert.equal(c.snapshot().busy,true);
 await c.shareReport(value);await c.save('response_style');await c.forget('week_start');c.setPrompt('new');await c.create();await c.refresh();
 assert.deepEqual(calls.map(call=>call[0]),['available','create','share']);assert.match(calls[1][1].text,/INFORME DE TRABAJO DE LUCY/);assert.equal(calls[2][1],'Compartir informe (.txt)');
 wait.resolve();await pending;assert.equal(c.snapshot().busy,false);assert.equal(c.snapshot().error,'');assert.equal(calls.at(-1)[0],'cleanup');c.close();
});
test('malformed, unfinished and non-record partial reports are refused before touching native storage',async()=>{
 for(const change of [v=>{v.status='queued';},v=>{v.result.text='\uD800';},v=>{v.status='partial';v.mode='ai_research';},v=>{v.status='partial';v.result.run.status='partial';},v=>{v.result.run.modelCalls=1;}]){
  const value=job();change(value);const {c,calls}=await setup({job:value});await c.shareReport(value);assert.equal(calls.length,0);assert.equal(c.snapshot().error,'shareError');c.close();
 }
});
test('validated partial record searches pass their explicit partial labels to native sharing',async()=>{
 const value=job();value.status='partial';value.result.run.status='partial';value.result.evidence.incomplete=true;
 const {c,calls}=await setup({job:value});await c.shareReport(value,'fr','Partager le rapport partiel (.txt)');
 assert.match(calls.find(call=>call[0]==='create')[1].filename,/-partial-/);assert.match(calls.find(call=>call[0]==='create')[1].text,/RÉSULTATS PARTIELS/);assert.equal(calls.find(call=>call[0]==='share')[1],'Partager le rapport partiel (.txt)');c.close();
});
test('unsupported sharing avoids file creation; native availability and share errors release the lock',async()=>{
 const {c,calls,value,sharing,file}=await setup({sharing:{isAvailable:async()=>false}});await c.shareReport(value);assert.equal(c.snapshot().error,'shareUnavailable');assert.equal(calls.length,0);assert.equal(c.snapshot().busy,false);
 sharing.isAvailable=async()=>{throw Error('private native detail');};await c.shareReport(value);assert.equal(c.snapshot().error,'shareError');assert.equal(calls.length,0);
 sharing.isAvailable=async()=>true;file.share=async()=>{throw Error('share failed');};await c.shareReport(value);assert.equal(c.snapshot().error,'shareError');assert.deepEqual(calls.map(call=>call[0]),['create','cleanup']);assert.equal(c.snapshot().busy,false);c.close();
});
test('close, navigation, background or account/company/role changes while availability is pending prevent file creation',async()=>{
 for(const invalidate of [({c})=>c.close(),({scope})=>{scope.current=false;}]){
  const wait=deferred(),h=await setup({sharing:{isAvailable:()=>wait.promise}});const pending=h.c.shareReport(h.value);invalidate(h);wait.resolve(true);await pending;
  assert.equal(h.calls.length,0);assert.equal(h.c.snapshot().error,'');assert.equal(h.c.snapshot().busy,false);h.c.close();
 }
});
test('scope loss after temporary creation always cleans up and never opens the share sheet',async()=>{
 for(const invalidate of [({c})=>c.close(),({scope})=>{scope.current=false;}]){
  const wait=deferred(),h=await setup({sharing:{createTemporary:()=>wait.promise}});const pending=h.c.shareReport(h.value);await flush();invalidate(h);wait.resolve(h.file);await pending;
  assert.deepEqual(h.calls.map(call=>call[0]),['available','cleanup']);h.c.close();
 }
});
test('reopening never revives a pending export; a new account cannot receive the previous result',async()=>{
 const wait=deferred(),h=await setup({sharing:{isAvailable:()=>wait.promise}});const pending=h.c.shareReport(h.value);h.c.close();h.c.open();
 assert.equal(h.c.snapshot().jobs.length,0);assert.equal(h.c.snapshot().busy,true);await h.c.shareReport(h.value);
 const next=new Controller(h.client,h.sharing);next.open();await flush();assert.equal(next.snapshot().busy,false);
 wait.resolve(true);await pending;await flush();assert.equal(h.calls.length,0);assert.equal(next.snapshot().error,'');assert.equal(next.snapshot().busy,false);next.close();h.c.close();
});
test('file is retained through user-controlled sheet backgrounding and removed only after dismissal, including rejection',async()=>{
 for(const reject of [false,true]){
  const wait=deferred(),h=await setup({file:{share:()=>wait.promise}});const pending=h.c.shareReport(h.value);await flush();h.c.close();assert.equal(h.calls.filter(call=>call[0]==='cleanup').length,0);
  if(reject)wait.reject(Error('cancelled'));else wait.resolve();await pending;assert.equal(h.calls.filter(call=>call[0]==='cleanup').length,1);assert.equal(h.c.snapshot().error,'');
 }
});
test('stale loaded objects and loading state cannot be exported; cleanup failure is surfaced without unhandled errors',async()=>{
 const h=await setup();h.client.get=async url=>url.endsWith('/work')?{enabled:false,modes:{ai_research:false,record_search:true},jobs:[job()]}:{preferences:[]};await h.c.refresh();await h.c.shareReport(h.value);assert.equal(h.calls.length,0);
 const wait=deferred();h.client.get=()=>wait.promise;const loading=h.c.refresh();await h.c.shareReport(h.c.snapshot().jobs[0]);assert.equal(h.calls.length,0);h.c.close();wait.resolve({preferences:[],jobs:[]});await loading;
 const other=await setup({file:{cleanup:()=>{throw Error('cleanup failed');}}});await other.c.shareReport(other.value);assert.equal(other.c.snapshot().error,'shareError');assert.equal(other.c.snapshot().busy,false);other.c.close();
});
function nativeAdapter(options={}){
 const calls=[],directories=[];
 class Directory {constructor(root,name){calls.push(['directory',root,name]);this.exists=false;directories.push(this);}create(){calls.push(['mkdir']);this.exists=true;}delete(){calls.push(['remove']);this.exists=false;}}
 class File {constructor(directory,name){calls.push(['file',directory,name]);this.uri='file:///private/cache/report.txt';}create(){calls.push(['touch']);}write(text,settings){calls.push(['write',text,settings]);if(options.failWrite)throw Error('write failed');}}
 const sharing={isAvailableAsync:async()=>{calls.push(['available']);return true;},shareAsync:async(uri,settings)=>{calls.push(['share',uri,settings]);if(options.shareWait)await options.shareWait.promise;}};
 const result=load('services/lucyReportSharing.ts',name=>name==='expo-file-system'?{Directory,File,Paths:{cache:'private-cache'}}:name==='expo-sharing'?sharing:name==='react-native'?{Platform:{OS:options.os??'ios'}}:(()=>{throw Error(name);})());
 return {adapter:result.nativeLucyReportSharing,calls,directories};
}
test('SDK55 adapter uses private cache, explicit UTF-8 plain text, unique directories and user-controlled native sheet',async()=>{
 const {adapter,calls,directories}=nativeAdapter();assert.equal(await adapter.isAvailable(),true);const report=reportUtils.buildLucyWorkReport(job());
 const first=adapter.createTemporary(report),second=adapter.createTemporary(report);const dirs=calls.filter(call=>call[0]==='directory');assert.notEqual(dirs[0][2],dirs[1][2]);assert.equal(dirs[0][1],'private-cache');
 assert.equal(calls.find(call=>call[0]==='file')[2],report.filename);assert.equal(calls.find(call=>call[0]==='write')[1],report.text);assert.equal(calls.find(call=>call[0]==='write')[2].encoding,'utf8');
 assert.equal(calls.filter(call=>call[0]==='share').length,0);await first.share('Report');const sent=calls.find(call=>call[0]==='share');assert.equal(sent[1],'file:///private/cache/report.txt');assert.equal(sent[2].mimeType,'text/plain');assert.equal(sent[2].UTI,'public.plain-text');assert.equal(sent[2].dialogTitle,'Report');
 first.cleanup();first.cleanup();second.cleanup();assert.equal(calls.filter(call=>call[0]==='remove').length,2);assert.ok(directories.every(directory=>!directory.exists));
});
test('SDK55 adapter cleans failed writes and never attempts web file sharing or a remote-upload fallback',async()=>{
 const broken=nativeAdapter({failWrite:true});assert.throws(()=>broken.adapter.createTemporary(reportUtils.buildLucyWorkReport(job())),/write failed/);assert.equal(broken.calls.at(-1)[0],'remove');
 const web=nativeAdapter({os:'web'});assert.equal(await web.adapter.isAvailable(),false);assert.equal(web.calls.length,0);
});

test('native adapter rejects unsafe filenames before creating files and globally prevents overlapping sheets',async()=>{
 const wait=deferred(),h=nativeAdapter({shareWait:wait});const report=reportUtils.buildLucyWorkReport(job());
 for(const filename of ['../../private.txt','https://host/file.txt','report.html','report.txt\0','report/next.txt'])assert.throws(()=>h.adapter.createTemporary({...report,filename}),/shareError/);
 assert.equal(h.calls.length,0);const first=h.adapter.createTemporary(report),second=h.adapter.createTemporary(report);
 const active=first.share('First');await assert.rejects(second.share('Second'),/shareError/);assert.equal(h.calls.filter(call=>call[0]==='share').length,1);
 wait.resolve();await active;await second.share('Second');assert.equal(h.calls.filter(call=>call[0]==='share').length,2);first.cleanup();second.cleanup();
});

const briefingJob=()=>{
 const value=job();value.mode='work_briefing';value.options={from:'2026-11-01',to:'2026-11-30',taskStatus:'open'};value.prompt=reportUtils.lucyBriefingPrompt(value.options);
 value.result.run.steps=[{tool:'briefing_tasks',status:'completed'},{tool:'briefing_schedules',status:'completed'}];return value;
};
test('briefing shares only after explicit request, use existing temporary .txt path, and lock date/status controls',async()=>{
 for(const partial of [false,true]){
  const value=briefingJob();if(partial){value.status='partial';value.result.run.status='partial';value.result.run.stopReason='retrieval_limits';value.result.evidence.incomplete=true;}
  const wait=deferred(),h=await setup({job:value,file:{share:()=>wait.promise}});h.client.get=async url=>url.endsWith('/work')?{enabled:false,modes:{ai_research:false,record_search:true,work_briefing:true},jobs:[value]}:{preferences:[]};await h.c.refresh();h.c.setMode('work_briefing');h.c.setBriefing(value.options);
  assert.equal(h.calls.length,0);const pending=h.c.shareReport(value,'es','Compartir informe (.txt)');await flush();h.c.setBriefing({taskStatus:'all',from:'2026-11-20'});h.c.setMode('record_search');await h.c.create();await h.c.cancel(value.id);
  assert.equal(h.c.snapshot().briefing.from,'2026-11-01');assert.equal(h.c.snapshot().briefing.taskStatus,'open');assert.equal(h.c.snapshot().mode,'work_briefing');
  assert.deepEqual(h.calls.map(call=>call[0]),['available','create']);const report=h.calls[1][1];assert.match(report.filename,partial?/-work-briefing-partial-/:/-work-briefing-/);assert.match(report.text,/RESUMEN DE TRABAJO DE LUCY/);assert.equal(report.bytes,Buffer.byteLength(report.text));
  h.c.close();assert.equal(h.calls.filter(call=>call[0]==='cleanup').length,0);wait.resolve();await pending;assert.equal(h.calls.filter(call=>call[0]==='cleanup').length,1);assert.equal(h.c.snapshot().busy,false);
 }
});
test('invalid briefing reports fail before native storage or sharing and still release the controller lock',async()=>{
 for(const change of [v=>{v.options.taskStatus='overdue';},v=>{v.prompt='different prompt';},v=>{v.result.run.steps[1].status='failed';},v=>{v.result.evidence.sources=Array(7).fill(v.result.evidence.sources[0]);},v=>{v.result.text='😀'.repeat(40000);}]){
  const value=briefingJob();change(value);const h=await setup({job:value});await h.c.shareReport(value);assert.equal(h.calls.length,0);assert.equal(h.c.snapshot().error,'shareError');assert.equal(h.c.snapshot().busy,false);h.c.close();
 }
});
test('briefing share cannot revive across close/reopen or render-time scope loss, even after file creation',async()=>{
 for(const stage of ['available','create'])for(const close of [false,true]){
  const wait=deferred(),value=briefingJob(),h=await setup({job:value,sharing:stage==='available'?{isAvailable:()=>wait.promise}:{createTemporary:()=>wait.promise}});
  const pending=h.c.shareReport(value);await flush();if(close){h.c.close();h.c.open();}else h.scope.current=false;
  wait.resolve(stage==='available'?true:h.file);await pending;await flush();assert.equal(h.calls.filter(call=>call[0]==='share').length,0);assert.equal(h.calls.filter(call=>call[0]==='cleanup').length,stage==='create'?1:0);h.c.close();
 }
});
