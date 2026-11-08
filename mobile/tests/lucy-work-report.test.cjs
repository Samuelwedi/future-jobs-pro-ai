const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const denied=()=>{throw Error('Reports may not use network, credentials, storage or models.');};
const context={exports:{},require:denied,fetch:denied,XMLHttpRequest:denied,WebSocket:denied};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/utils/lucyWorkReport.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
const {buildLucyWorkReport:build,readLucyWorkModes:modes,LUCY_REPORT_MAX_BYTES:limit}=context.exports;
const source={kind:'document',id:'document-1',title:'Crew handover',excerpt:'Needs delivery confirmation.',retrievedAt:'2026-11-08T12:00:00Z',date:'2026-11-07'};
const job=()=>({id:'job-1',mode:'record_search',prompt:'Riverside',status:'completed',createdAt:'2026-11-08T11:59:00Z',completedAt:'2026-11-08T12:00:00Z',result:{text:'One matching handover record.',run:{status:'completed',modelCalls:0},evidence:{incomplete:false,sources:[{...source}]}}});

test('capabilities preserve old servers and fail closed on invalid responses and malformed modes',()=>{
 assert.equal(modes({enabled:true}).explicit,false);assert.equal(modes({enabled:true}).ai_research,true);assert.equal(modes({enabled:false}).ai_research,false);
 assert.equal(modes({enabled:true}).record_search,false);assert.equal(modes({enabled:false,modes:{ai_research:false,record_search:true}}).record_search,true);
 for(const value of [null,undefined,1,[],{}, {enabled:'true'}, {enabled:true,modes:null}, {enabled:true,modes:[]}]){
  assert.equal(modes(value).record_search,false);assert.equal(modes(value).ai_research,false);
 }
});
test('complete record report is a deterministic bounded snapshot with exact evidence, not inferred links',()=>{
 const value=job(),result=build(value);
 assert.equal(result.filename,'lucy-record-search-2026-11-08-job-1.txt');
 for(const expected of ['Company-record search (no AI model)','No AI model was called.',`Query:\n${value.prompt}`,'Status: completed',value.createdAt,value.completedAt,value.result.text,'No new retrieval',source.id,source.title,source.excerpt,source.retrievedAt,source.date,'not a guarantee that all company records were searched'])assert.ok(result.text.includes(expected),expected);
 assert.ok(!result.text.includes('https://'));assert.equal(result.bytes,Buffer.byteLength(result.text,'utf8'));assert.ok(result.bytes<limit);assert.equal(build(value).text,result.text);
});
test('AI and legacy completed reports never falsely claim no AI, source evidence or model calls',()=>{
 const value=job();value.mode='ai_research';value.result.run.modelCalls=2;
 assert.match(build(value).text,/Model calls reported by the server: 2/);assert.ok(!build(value).text.includes('No AI model was called'));
 delete value.mode;delete value.result.run;delete value.result.evidence;delete value.completedAt;
 const result=build(value);for(const expected of ['legacy server mode','Model-call details were not supplied','Unknown: source evidence was not supplied','None have been inferred','Completed: Not supplied'])assert.ok(result.text.includes(expected));
});
test('only strictly validated partial record searches export with explicit warnings and partial filename',()=>{
 const value=job();value.status='partial';value.result.run.status='partial';value.result.evidence.incomplete=true;
 const result=build(value);for(const expected of ['LUCY PARTIAL RECORD SEARCH REPORT','Status: partial','PARTIAL RESULTS: Retrieval was limited or a source was unavailable','Do not treat this report as complete or exhaustive','Incomplete: some records may be missing','Finished (partial)'])assert.ok(result.text.includes(expected),expected);
 assert.match(result.filename,/-record-search-partial-/);assert.ok(!result.text.includes('Status: completed'));assert.ok(!result.text.includes('No missing evidence'));
 for(const change of [v=>{v.mode='ai_research';},v=>{delete v.mode;},v=>{v.result.run.modelCalls=1;},v=>{v.result.run.status='completed';},v=>{delete v.result.run.status;},v=>{v.result.evidence.incomplete=false;},v=>{delete v.result.evidence;}]){
  const bad=JSON.parse(JSON.stringify(value));change(bad);assert.throws(()=>build(bad),/shareError/);
 }
});
test('in-progress, cancelled, failed and malformed reports or evidence are refused in full',()=>{
 for(const status of ['queued','running','cancelled','failed',''])assert.throws(()=>build({...job(),status}),/shareError/);
 for(const patch of [{id:''},{id:'a'.repeat(201)},{prompt:''},{prompt:'x'.repeat(201)},{createdAt:'bad'},{completedAt:'invalid'},{updatedAt:'invalid'},{mode:'unknown'},{result:null},{result:{}},{result:{text:123}},{result:{text:'a',run:{status:'partial'}}}])assert.throws(()=>build({...job(),...patch}),/shareError/);
 for(const run of [undefined,null,[],{modelCalls:1},{modelCalls:-1},{modelCalls:.5},{modelCalls:'0'},{modelCalls:0,status:'partial'}]){const value=job();value.result.run=run;assert.throws(()=>build(value),/shareError/);}
 for(const evidence of [null,{},[],{sources:[],incomplete:'false'},{sources:[null],incomplete:false},{sources:Array(13).fill(source),incomplete:false}]){const value=job();value.result.evidence=evidence;assert.throws(()=>build(value),/shareError/);}
 for(const patch of [{id:''},{id:'a'.repeat(201)},{title:'a'.repeat(201)},{excerpt:'a'.repeat(1201)},{kind:'url'},{kind:['document']},{retrievedAt:'bad'},{date:'bad'},{title:'null\0byte'}]){const value=job();value.result.evidence.sources=[{...source,...patch}];assert.throws(()=>build(value),/shareError/);}
});
test('UTF-8 bytes, aggregate size and lone surrogates are validated without a TextEncoder or Buffer runtime dependency',()=>{
 for(const text of ['x'.repeat(limit),'😀'.repeat(40000),'é'.repeat(65000),'\uD800','\uDC00','a\uD800b']){const value=job();value.result.text=text;assert.throws(()=>build(value),/shareError/);}
 const value=job();value.result.text='é😀अ'.repeat(10000);assert.equal(build(value).bytes,Buffer.byteLength(build(value).text));
 value.result.text='x'.repeat(127000);value.result.evidence.sources=Array(12).fill({...source,excerpt:'e'.repeat(1200)});assert.throws(()=>build(value),/shareError/);
});
test('filenames are bounded ASCII .txt without query, path or markup; hostile source text stays inert',()=>{
 for(const id of ['../../evil.html','https://x.test/a?b#c','CON','...','a'.repeat(200),'\u202Etxt.exe','😀']){
  const value=job();value.id=id;value.prompt='private query token';const result=build(value);
  assert.match(result.filename,/^lucy-record-search-\d{4}-\d{2}-\d{2}-[A-Za-z0-9_-]{1,48}\.txt$/);assert.ok(!result.filename.includes('private'));assert.equal(result.filename,build(value).filename);
 }
 const value=job();value.result.text='=HYPERLINK("https://untrusted.invalid")\n<script>alert(1)</script>';value.result.evidence.sources[0].excerpt='[Click](javascript:alert(1))';
 assert.ok(build(value).text.includes(value.result.text));assert.ok(build(value).text.includes(value.result.evidence.sources[0].excerpt));
});
test('English, Spanish and French reports localize metadata and partial warnings without changing saved evidence',()=>{
 const expected={en:['LUCY PARTIAL','PARTIAL RESULTS','Do not treat','Query:','Retrieved:'],es:['INFORME PARCIAL','RESULTADOS PARCIALES','no es completo ni exhaustivo','Consulta:','Consultado:'],fr:['RAPPORT PARTIEL','RÉSULTATS PARTIELS','ni complet ni exhaustif','Requête:','Consulté:']};
 const value=job();value.status='partial';value.result.run.status='partial';value.result.evidence.incomplete=true;
 for(const [language,labels] of Object.entries(expected)){const result=build(value,language);for(const label of labels)assert.ok(result.text.includes(label),label);assert.ok(result.text.includes(source.excerpt));assert.equal(result.bytes,Buffer.byteLength(result.text));}
 assert.equal(build(value,'pt').text,build(value,'en').text);
});
