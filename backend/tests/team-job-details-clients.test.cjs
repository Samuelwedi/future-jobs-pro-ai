const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function extract(file,name){
 const source=fs.readFileSync(path.resolve(__dirname,'../../'+file),'utf8');
 const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let hit;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)===name)hit=n.initializer;ts.forEachChild(n,visit);}visit(ast);
 assert.ok(hit);const out=ts.transpileModule('('+hit.getText(ast)+')',{reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}});
 assert.equal(out.diagnostics.length,0);
 return { make:c=>vm.runInNewContext(out.outputText,c),source };
}
const android=extract('mobile/src/screens/TeamScreen.tsx','saveJobDetails'), web=extract('web/src/pages/Team.tsx','saveJob');
const fields=[['job_title','Job title'],['department','Department'],['job_description','Job description']];
const owner={id:'manager',companyId:'team',role:'manager',token:'fixture'};
const previous={job_title:null,department:'Legacy',job_description:null}, draft={...previous,job_title:'Manager'};
const rows=[{id:'worker',role:'employee',...previous},{id:'other',role:'manager'}];
function fixture(client){
 const h={current:true,change:false,writes:[],calls:[],rows,allowed:true};
 const patch=work=>{h.writes.push('rows'); h.rows=work(h.rows);};
 const reply={success:true,details:{id:'worker',...draft}};
 const response=()=>h.change ? {success:true,details:{id:'other',...draft}} : reply;
 const common={setMembers:patch,setLoading:()=>{},Error};
 const ctx=client==='mobile'?{...common,jobEdit:{member:{id:'worker'},previous,draft},user:owner,jobView:{current:0},
  api:{captureSessionGuard:()=>()=>h.current,saveTeamJobDetails:async(...args)=>{h.calls.push(args);if(!h.allowed)h.current=false;return response();}},
  alive:{current:true},mutationLock:{current:false},jobError:false,setBusy:()=>{},setJobError:v=>{h.error=v;},
  closeJobDetails:()=>h.writes.push('close'),teamRead:{current:0},setRefreshing:()=>{},
  memberJobDetails:source=>Object.fromEntries(fields.map(([key])=>[key,source[key]])),
 }:{...common,job:{id:'worker',previous,draft},readChatOwner:()=>owner,jobGeneration:{current:0},jobError:false,jobLock:{current:false},
  captureAuthSession:()=>({isCurrent:()=>h.current}),setJobBusy:()=>{},setJobError:v=>{h.error=v;},
  window:{setTimeout:()=>0,clearTimeout:()=>{}},AbortController,API_BASE:'https://example.test',
  fetch:async(url,req)=>{h.calls.push([url,req]);if(!h.allowed)h.current=false;return {ok:true,json:async()=>response()};},
  closeJob:()=>h.writes.push('close'),readGeneration:{current:0},fields,
  detailsOf:source=>Object.fromEntries(fields.map(([key])=>[key,source[key]])),
 };
 return Object.assign(h,{save:(client==='mobile'?android:web).make(ctx)});
}
for(const client of ['mobile','web']){
 test(client+' saves descriptive job title separately and never rewrites employee access',async()=>{
  const f=fixture(client);await f.save();assert.equal(f.rows[0].job_title,'Manager');assert.equal(f.rows[0].role,'employee');assert.equal(f.rows[1],rows[1]);
  assert.deepEqual(f.writes,['rows','close']);assert.equal(f.calls.length,1);
  if(client==='web'){
   const [url,req]=f.calls[0];assert.match(url,/\/team\/worker\/job-details$/);const b=JSON.parse(req.body);
   assert.deepEqual(b,{expectedActorId:'manager',expectedCompanyId:'team',previous,details:draft});assert.equal(req.method,'PUT');
  }else {
   const [actor,id,old,detail]=f.calls[0];assert.equal(actor.companyId,'team');assert.equal(id,'worker');assert.equal(old,previous);assert.equal(detail,draft);
  }
 });
 test(client+' ignores stale completion and rejects a mismatched saved member',async()=>{
  const stale=fixture(client);stale.allowed=false;await stale.save();assert.deepEqual(stale.writes,[]);
  const wrong=fixture(client);wrong.change=true;await wrong.save();assert.deepEqual(wrong.writes,[]);assert.equal(wrong.error,true);
 });
}
test('both screens distinguish the job labels from permission access',()=>{
 for(const source of [android.source,web.source]){
  for(const label of ['Job title','Job description','Department','Access','These details do not change account access.']) assert.ok(source.includes(label));
 }
});
