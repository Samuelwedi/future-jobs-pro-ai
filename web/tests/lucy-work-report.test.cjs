const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const denied=()=>{throw new Error('Reports must not access the network, storage, credentials or a model.');};
const context={exports:{},TextEncoder,require:denied,fetch:denied,XMLHttpRequest:denied,WebSocket:denied,localStorage:new Proxy({},{get:denied}),sessionStorage:new Proxy({},{get:denied})};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/utils/lucyWorkReport.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
const {buildLucyWorkReport:build,readLucyWorkModes:modes,LUCY_REPORT_MAX_BYTES:limit}=context.exports;
const source={kind:'document',id:'document-1',title:'Crew handover',excerpt:'Needs delivery confirmation.',retrievedAt:'2026-11-08T12:00:00Z',date:'2026-11-07'};
const job=()=>({id:'job-1',mode:'record_search',prompt:'Riverside',status:'completed',createdAt:'2026-11-08T11:59:00Z',completedAt:'2026-11-08T12:00:00Z',result:{text:'One matching handover record.',run:{status:'completed',modelCalls:0},evidence:{incomplete:false,sources:[{...source}]}}});
const report=value=>build(value,{sample:false});

test('capabilities preserve legacy AI gating and fail closed on malformed new modes',()=>{
  assert.equal(modes({enabled:true}).ai_research,true);assert.equal(modes({enabled:false}).ai_research,false);
  assert.equal(modes({enabled:true}).record_search,false);assert.equal(modes({enabled:true}).explicit,false);
  const next=modes({enabled:false,modes:{ai_research:false,record_search:true}});
  assert.equal(next.record_search,true);assert.equal(next.ai_research,false);assert.equal(next.explicit,true);
  for(const value of [null,{},[],{ai_research:true},{ai_research:'true',record_search:true},{ai_research:true,record_search:1}]) {
    assert.equal(modes({enabled:true,modes:value}).ai_research,false);assert.equal(modes({enabled:true,modes:value}).record_search,false);
  }
});

test('completed report includes query, status, timestamps, result and exact source provenance without invented links',()=>{
  const value=job(),result=report(value);
  assert.equal(result.filename,'lucy-record-search-2026-11-08-job-1.txt');
  for(const expected of ['Company-record search (no AI model)','No AI model was called.',`Query:\n${value.prompt}`,'Status: completed',value.createdAt,value.completedAt,value.result.text,'No new retrieval',source.id,source.title,source.excerpt,source.retrievedAt,source.date,'not a guarantee that all company records were searched']) assert.ok(result.text.includes(expected),expected);
  assert.ok(!result.text.includes('https://'));assert.equal(result.bytes,Buffer.byteLength(result.text,'utf8'));assert.ok(result.bytes<limit);
  assert.equal(report(value).text,result.text);assert.equal(report(value).filename,result.filename);
});

test('sample export conspicuously labels synthetic fixed content and no model, account or network access',()=>{
  const result=build(job(),{sample:true});
  assert.match(result.filename,/^lucy-sample-/);assert.match(result.text,/SYNTHETIC DATA ONLY/);assert.match(result.text,/Fixed sample simulation, not a researched answer/);
  assert.match(result.text,/No AI model, API requests, credentials, persistent storage, or real records were used/);
});

test('AI and older jobs do not claim no AI or invent absent source evidence',()=>{
  const value=job();value.mode='ai_research';value.result.run.modelCalls=2;
  assert.match(report(value).text,/Model calls reported by the server: 2/);assert.ok(!report(value).text.includes('No AI model was called'));
  delete value.mode;delete value.result.run;delete value.result.evidence;delete value.completedAt;
  const result=report(value);assert.match(result.text,/legacy server mode/);assert.match(result.text,/Model-call details were not supplied/);
  assert.match(result.text,/Unknown: source evidence was not supplied/);assert.match(result.text,/None have been inferred/);assert.match(result.text,/Completed: Not supplied/);
});

test('valid incomplete evidence remains explicitly incomplete and no sources are added',()=>{
  const value=job();value.result.evidence={incomplete:true,sources:[]};
  const result=report(value);assert.match(result.text,/Incomplete: some records may be missing/);assert.match(result.text,/Sources supplied: 0/);assert.match(result.text,/No source citations were supplied/);
});

test('in-progress, cancelled, failed, malformed and contradictory reports are refused',()=>{
  for(const status of ['queued','running','cancelled','failed','']) assert.throws(()=>report({...job(),status}),/safely/);
  for(const patch of [{id:''},{id:'a'.repeat(201)},{prompt:''},{prompt:'x'.repeat(201)},{createdAt:'not a date'},{completedAt:'invalid'},{updatedAt:'invalid'},{mode:'unknown'},{result:null},{result:{}},{result:{text:123}},{result:{text:'a',run:{status:'partial'}}}]) assert.throws(()=>report({...job(),...patch}),/safely/);
  for(const run of [undefined,null,[],{modelCalls:1},{modelCalls:-1},{modelCalls:0.5},{modelCalls:'0'},{modelCalls:0,status:'partial'}]) {const value=job();value.result.run=run;assert.throws(()=>report(value),/safely/);}
  for(const evidence of [null,{},[],{sources:[],incomplete:'false'},{sources:[null],incomplete:false},{sources:Array(13).fill(source),incomplete:false}]) {const value=job();value.result.evidence=evidence;assert.throws(()=>report(value),/safely/);}
  for(const patch of [{id:''},{id:'a'.repeat(201)},{title:'a'.repeat(201)},{excerpt:'a'.repeat(1201)},{kind:'url'},{kind:['document']},{retrievedAt:'bad'},{date:'bad'},{title:'null\0byte'}]) {const value=job();value.result.evidence.sources=[{...source,...patch}];assert.throws(()=>report(value),/safely/);}
});

test('UTF-8 byte bounds reject multibyte and aggregate oversize without truncating or inventing data',()=>{
  for(const text of ['x'.repeat(limit),'😀'.repeat(40000),'é'.repeat(65000)]) {const value=job();value.result.text=text;assert.throws(()=>report(value),/too large/);}
  const value=job();value.result.text='é'.repeat(10000);assert.equal(report(value).bytes,Buffer.byteLength(report(value).text));
});

test('filenames are deterministic bounded ASCII .txt and never include a query or path',()=>{
  for(const id of ['../../evil.html','https://x.test/a?b#c','CON','...','a'.repeat(200),'\u202Etxt.exe','😀']) {
    const value=job();value.id=id;value.prompt='private query token';
    const result=report(value);assert.match(result.filename,/^lucy-record-search-\d{4}-\d{2}-\d{2}-[A-Za-z0-9_-]{1,48}\.txt$/);
    assert.ok(!result.filename.includes('private'));assert.equal(result.filename,report(value).filename);
  }
});

test('hostile HTML, links and spreadsheet formulas are inert plain-text data, never executed or inferred citations',()=>{
  const value=job();value.prompt='<img src=x onerror=alert(1)>';
  value.result.text='=HYPERLINK("https://untrusted.invalid")\n<script>alert(1)</script>';
  value.result.evidence.sources[0].excerpt='[Click](javascript:alert(1))';
  const result=report(value);assert.ok(result.text.includes(value.result.text));assert.ok(result.text.includes(value.result.evidence.sources[0].excerpt));
  assert.match(result.filename,/\.txt$/);assert.ok(!result.filename.includes('HYPERLINK'));
});


test('validated partial record-search exports are unmistakably partial and cannot imply exhaustive completion',()=>{
  const value=job();value.status='partial';value.result.run.status='partial';value.result.evidence.incomplete=true;
  const result=report(value);assert.match(result.text,/LUCY PARTIAL RECORD SEARCH REPORT/);assert.match(result.text,/Status: partial/);
  assert.match(result.text,/PARTIAL RESULTS: Retrieval was limited or a source was unavailable/);assert.match(result.text,/Do not treat this report as complete or exhaustive/);
  assert.match(result.text,/Incomplete: some records may be missing/);assert.ok(!result.text.includes('Status: completed'));assert.ok(!result.text.includes('No missing evidence'));
  assert.match(result.filename,/-record-search-partial-/);
  for(const change of [v=>{v.mode='ai_research';},v=>{delete v.mode;},v=>{v.result.run.modelCalls=1;},v=>{v.result.run.status='completed';},v=>{delete v.result.run.status;},v=>{v.result.evidence.incomplete=false;},v=>{delete v.result.evidence;}]) {
    const bad=JSON.parse(JSON.stringify(value));change(bad);assert.throws(()=>report(bad),/safely/);
  }
});

const {readLucyBriefingOptions:briefingOptions,lucyBriefingPrompt:briefingPrompt,lucyBriefingPreview:briefingPreview,lucyWorkModeLabel:modeLabel}=context.exports;
const options=()=>({from:'2028-02-01',to:'2028-03-02',taskStatus:'open'});
const briefingJob=()=>({...job(),mode:'work_briefing',prompt:briefingPrompt(options()),options:options(),result:{text:'2 tasks and 1 stored shift.',run:{status:'completed',modelCalls:0,steps:[{tool:'briefing_tasks',status:'completed'},{tool:'briefing_schedules',status:'completed'}]},evidence:{incomplete:false,sources:[{...source,kind:'task'}]}}});

test('briefing dates are strict Gregorian calendar dates with an inclusive 31-day maximum',()=>{
  for(const dates of [['2028-02-01','2028-03-02'],['2028-02-29','2028-02-29'],['2000-02-29','2000-03-01'],['0001-01-01','0001-01-01'],['9999-12-31','9999-12-31']]) {
    const value={from:dates[0],to:dates[1],taskStatus:'open'};assert.deepEqual(JSON.parse(JSON.stringify(briefingOptions(value))),value);
  }
  for(const dates of [['2028-02-01','2028-03-03'],['2026-02-29','2026-03-01'],['2100-02-29','2100-03-01'],['2026-04-31','2026-05-01'],['2026-11-08','2026-11-07'],['0000-01-01','0000-01-01'],['2026-1-01','2026-01-01'],[' 2026-01-01','2026-01-01'],['2026-01-01T00:00:00Z','2026-01-01'],['2026-13-01','2026-13-01'],['2026-00-01','2026-00-01'],['2026-01-00','2026-01-01']]) assert.equal(briefingOptions({from:dates[0],to:dates[1],taskStatus:'open'}),null,dates.join(' '));
  for(const value of [null,[],{}, {...options(),from:1},{...options(),to:null},{...options(),taskStatus:'overdue'},{...options(),taskStatus:['open']},{...options(),prompt:'ignored'},{...options(),companyId:'other'}])assert.equal(briefingOptions(value),null);
  for(const taskStatus of ['open','pending','in_progress','completed','all'])assert.equal(briefingOptions({...options(),taskStatus}).taskStatus,taskStatus);
  assert.match(briefingPreview(options()),/open \(pending or in progress\) tasks across all dates/);
  assert.match(briefingPreview(options()),/stored shifts.*inclusive/);
});

test('briefing capability requires an explicit boolean while older servers retain compatible defaults',()=>{
  assert.equal(modes({enabled:true}).work_briefing,false);
  assert.equal(modes({modes:{ai_research:true,record_search:true}}).work_briefing,false);
  assert.equal(modes({modes:{ai_research:false,record_search:true,work_briefing:true}}).work_briefing,true);
  for(const work_briefing of [null,undefined,'true',1,{},[]]) {
    const value=modes({enabled:true,modes:{ai_research:true,record_search:true,work_briefing}});
    assert.equal(value.ai_research,false);assert.equal(value.record_search,false);assert.equal(value.work_briefing,false);
  }
  for(const mode of ['unknown','',null,1,{}])assert.equal(modeLabel(mode),'Unavailable work mode');
});

test('briefing reports export exact bounded evidence with the validated schedule and all-time task scope',()=>{
  const value=briefingJob(),result=report(value);
  assert.match(result.filename,/^lucy-work-briefing-/);assert.match(result.text,/LUCY WORK BRIEFING REPORT/);
  for(const expected of ['Work briefing (no AI model)','No AI model was called.',options().from,options().to,'oldest first','Due dates are not evaluated','Recurrence rules are not expanded',source.id,source.excerpt])assert.ok(result.text.includes(expected),expected);
  assert.equal(result.bytes,Buffer.byteLength(result.text));assert.ok(!result.text.includes('https://'));
  value.result.evidence.sources=[];assert.match(report(value).text,/No source citations were supplied. None have been inferred/);
  const sample=build(value,{sample:true});assert.match(sample.text,/SYNTHETIC DATA ONLY/);assert.match(sample.text,/dates and task status are not searched or applied/);assert.match(sample.text,/Displayed schedule dates \(not applied\)/);
});

test('partial briefing reports remain partial and malformed or contradictory model-free contracts cannot export',()=>{
  const value=briefingJob();value.status='partial';value.result.run.status='partial';value.result.run.stopReason='retrieval_limits';value.result.evidence.incomplete=true;
  const result=report(value);assert.match(result.filename,/work-briefing-partial/);assert.match(result.text,/LUCY PARTIAL WORK BRIEFING REPORT/);assert.match(result.text,/Do not treat this report as complete or exhaustive/);
  for(const modify of [
    v=>{delete v.options;},v=>{v.options.from='2026-02-29';},v=>{v.options.extra='x';},v=>{v.options.taskStatus='overdue';},v=>{v.prompt='Wrong options';},
    v=>{v.result.run.modelCalls=1;},v=>{delete v.result.run;},v=>{v.result.run.status='completed';},v=>{v.result.run.stopReason='timeout';},v=>{v.result.run.stopReason=['retrieval_limits'];},
    v=>{delete v.result.run.steps;},v=>{v.result.run.steps=[];},v=>{v.result.run.steps[0].status=['completed'];},v=>{v.result.run.steps[0].tool='send_email';},
    v=>{v.result.evidence.incomplete=false;},v=>{v.result.evidence.sources[0].kind='document';},v=>{v.result.evidence.sources=Array(7).fill({...source,kind:'task'});},
    v=>{v.result.evidence.sources[0].excerpt='x'.repeat(1201);},v=>{v.result.text='😀'.repeat(40000);},
  ]){const bad=JSON.parse(JSON.stringify(value));modify(bad);assert.throws(()=>report(bad),/safely/);}
  const completed=briefingJob();completed.result.evidence.incomplete=true;assert.throws(()=>report(completed),/safely/);
  const failed=briefingJob();failed.result.run.steps[0].status='failed';assert.throws(()=>report(failed),/safely/);
  value.result.run.steps[1].status='failed';value.result.run.stopReason='source_unavailable';assert.match(report(value).text,/PARTIAL WORK BRIEFING/);
});


test('briefing failed sections cannot contribute evidence or use a retrieval-limit stop reason',()=>{
  const value=briefingJob();value.status='partial';value.result.run.status='partial';value.result.evidence.incomplete=true;
  value.result.run.stopReason='source_unavailable';assert.throws(()=>report(value),/safely/);
  value.result.run.steps[0].status='failed';assert.throws(()=>report(value),/safely/);
  value.result.evidence.sources=[];assert.match(report(value).text,/PARTIAL WORK BRIEFING/);
  value.result.run.stopReason='retrieval_limits';assert.throws(()=>report(value),/safely/);
  value.result.run.stopReason='source_unavailable';value.result.run.steps[1].status='failed';assert.throws(()=>report(value),/safely/);
});
