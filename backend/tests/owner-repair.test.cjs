const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const {pool}=require('../dist/config/database');
const {repairEnabled,repairScope,runOwnerRepairTick}=require('../dist/services/ownerRepairService');
const db=new PGlite();const originalFetch=global.fetch;const owner='00000000-0000-4000-8000-000000000001';
let dispatches=0,run,requestId;const sha='a'.repeat(40);
before(async()=>{
 await db.exec(`CREATE TABLE platform_support_agents(id uuid primary key,role text,is_active boolean); INSERT INTO platform_support_agents VALUES('${owner}','owner',true);`);
 await db.exec(fs.readFileSync('migrations/20261024_owner_operations.sql','utf8'));
 pool.query=async(sql,args)=>{const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows||r.rows.length};};
 pool.connect=async()=>({query:async(sql,args)=>sql.includes('pg_try_advisory_lock')?{rows:[{locked:true}]}:sql.includes('pg_advisory_unlock')?{rows:[]}:pool.query(sql,args),release(){}});
 global.fetch=async(url,options)=>{
  assert.match(url,/^https:\/\/api.github.com\/repos\/Samuelwedi\/future-jobs-pro-ai\//);
  if(url.includes('/dispatches')){dispatches++;const body=JSON.parse(options.body);requestId=body.inputs.request_id;assert.deepEqual(Object.keys(body.inputs).sort(),['base_sha','request_id','scope']);throw new Error('ambiguous timeout');}
  return new Response(JSON.stringify(url.includes('git/ref')?{object:{sha}}:url.includes('actions/runs/')?run:{workflow_runs:run?[run]:[]}));
 };
});
after(async()=>{global.fetch=originalFetch;delete process.env.GH_TOKEN;delete process.env.LUCY_REPAIR_ENABLED;await db.close();await pool.end();});
test('feature fails closed and only supported incident scopes qualify',()=>{
 delete process.env.LUCY_REPAIR_ENABLED;assert.equal(repairEnabled(),false);process.env.LUCY_REPAIR_ENABLED='true';assert.equal(repairEnabled(),false);process.env.GH_TOKEN='fake-test-token';assert.equal(repairEnabled(),true);
 assert.equal(repairScope('mobile-ui','Cannot use shared object that was already released'),'mobile-audio');assert.equal(repairScope('billing','AudioRecorder'),null);assert.equal(repairScope('mobile-ui','Payment failed'),null);assert.equal(repairScope('support-portal','scrolling'),'support-portal');
});
test('ambiguous dispatch reconciles once without duplicate runs or incident resolution',async()=>{
 await db.query("INSERT INTO owner_repair_jobs(owner_id,incident_id,scope) VALUES($1,$2,'mobile-audio')",[owner,'00000000-0000-4000-8000-000000000002']);
 await runOwnerRepairTick();assert.equal(dispatches,1);
 await runOwnerRepairTick();assert.equal(dispatches,1);
 assert.equal((await db.query('SELECT status FROM owner_repair_jobs')).rows[0].status,'dispatching');
 run={id:123,display_title:`Lucy repair ${requestId}`,status:'completed',conclusion:'success'};
 await runOwnerRepairTick();const result=(await db.query('SELECT * FROM owner_repair_jobs')).rows[0];assert.equal(result.status,'awaiting_store');assert.equal(result.base_sha,sha);assert.equal(dispatches,1);
});
test('disabled owner is blocked before dispatch and active duplicate incidents are rejected',async()=>{
 await db.query('UPDATE platform_support_agents SET is_active=false');
 const incident='00000000-0000-4000-8000-000000000003';
 await db.query("INSERT INTO owner_repair_jobs(owner_id,incident_id,scope) VALUES($1,$2,'support-portal')",[owner,incident]);
 await assert.rejects(db.query("INSERT INTO owner_repair_jobs(owner_id,incident_id,scope) VALUES($1,$2,'support-portal')",[owner,incident]));
 await runOwnerRepairTick();assert.equal(dispatches,1);assert.equal((await db.query('SELECT status FROM owner_repair_jobs WHERE incident_id=$1',[incident])).rows[0].status,'blocked');
});
