const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function requestHarness(active=false, cancelState='queued') {
 const handlers={}, queries=[]; let inserted=0;
 const db={query:async(sql,args)=>{
  queries.push(sql);
  if(sql.startsWith('UPDATE owner_repair_jobs')) {
   assert.deepEqual(Array.from(args),['00000000-0000-4000-8000-000000000003','owner']);
   assert.match(sql,/owner_id=\$2 AND status='queued'/);
   const changed=cancelState==='queued';if(changed)cancelState='cancelled';
   return {rowCount:changed?1:0,rows:changed?[{id:args[0]}]:[]};
  }
  if(sql.startsWith('SELECT status FROM owner_repair_jobs'))return {rows:cancelState==='other-owner'?[]:[{status:cancelState}]};
  if(sql.includes('FROM system_incidents'))return {rows:[{component:'mobile-ui',summary:'audio failure'}]};
  if(sql.includes('FROM owner_repair_jobs'))return {rows:active?[{id:'existing'}]:[],rowCount:active?1:0};
  if(sql.startsWith('INSERT INTO owner_repair_jobs'))return {rows:[{id:`repair-${++inserted}`}]};
  return {rows:[]};
 },release(){}};
 const router={use(){},get(){},put(){},patch(){},post(path,handler){handlers[path]=handler;}};
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync('dist/routes/ownerOperationsRoutes.js','utf8'),{
  module,exports:module.exports,process,
  require(name){
   if(name==='express')return {Router:()=>router};
   if(name.endsWith('/ownerRepairService'))return {repairEnabled:()=>true,repairScope:()=> 'mobile',repairFeature:()=> 'audio'};
   if(name.endsWith('/database'))return {pool:{connect:async()=>db}};
   if(name.endsWith('/supportAgentRoutes'))return {authenticateAgent(){}};
   if(name.endsWith('/ownerOperationsService'))return {};
   throw Error(name);
  }
 });
 return {queries,async cancel(){let status=200,body;await handlers['/repairs/:id/cancel']({params:{id:'00000000-0000-4000-8000-000000000003'},supportAgent:{id:'owner'}},{status(code){status=code;return this;},json(value){body=value;return this;}});return {status,body};},async submit(){let status=200,body;await handlers['/repairs']({body:{incidentId:'00000000-0000-4000-8000-000000000002'},supportAgent:{id:'owner'}},{status(code){status=code;return this;},json(value){body=value;return this;}});return {status,body};}};
}
test('owner can request more than two repairs without a daily quota',async()=>{
 const h=requestHarness();for(let i=0;i<5;i++)assert.equal((await h.submit()).status,201);
 assert.equal(h.queries.some(sql=>/24 hours|count\(\*\)/.test(sql)),false);
});
test('an active repair for the same incident still prevents duplicate dispatch',async()=>{
 const h=requestHarness(true);const result=await h.submit();assert.equal(result.status,409);assert.match(result.body.message,/already in progress/);
 assert.equal(h.queries.some(sql=>sql.startsWith('INSERT INTO owner_repair_jobs')),false);
});

test('queued cancellation is owner-scoped, audited once and idempotent',async()=>{
 const h=requestHarness();assert.equal((await h.cancel()).status,200);assert.equal((await h.cancel()).status,200);
 assert.equal(h.queries.filter(sql=>sql.startsWith('INSERT INTO owner_operations_audit')).length,1);
});
test('cancellation does not claim to stop an already dispatched workflow or another owner job',async()=>{
 for(const state of ['dispatching','running','deployed']){
  const h=requestHarness(false,state);const r=await h.cancel();assert.equal(r.status,409);assert.match(r.body.message,/has not cancelled/);
  assert.equal(h.queries.some(sql=>sql.startsWith('INSERT INTO owner_operations_audit')),false);
 }
 assert.equal((await requestHarness(false,'other-owner').cancel()).status,404);
});
