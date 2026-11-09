// Explicit opt-in only. Never part of normal tests or connected to application data.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{fork}=require('node:child_process');
const url=new URL(process.env.LUCY_BUDGET_TEST_DATABASE_URL||'invalid:');
if(url.protocol!=='postgres:'||url.hostname!=='127.0.0.1'||url.pathname!=='/lucy_budget_fixture')throw Error('Dedicated local budget fixture required');
process.env.DATABASE_URL=url.toString();process.env.DB_SSL='false';process.env.NODE_ENV='test';
const {pool}=require('../dist/config/database'),budget=require('../dist/services/lucyBackgroundBudget');const {migrate}=require('../scripts/run-lucy-workspace-migration.cjs');
const source={id:'concurrent-grant',model:'gpt-6.1-sol',maxUsd:'1.00',approvedAt:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()};
process.env.LUCY_BACKGROUND_WORK_ENABLED='true';process.env.LUCY_BACKGROUND_BUDGET_GRANT=JSON.stringify(source);
const workers=[];let checks=0;const pass=name=>console.log(`PASS ${++checks}: ${name}`);
(async()=>{try{
 await pool.query('CREATE TABLE companies(id uuid PRIMARY KEY); CREATE TABLE users(id uuid PRIMARY KEY)');
 for(const file of ['20261108_lucy_background_work.sql','20261108_lucy_user_preferences.sql','20261108_lucy_request_ledger.sql','20261108_lucy_work_modes.sql','20261108_lucy_work_briefing.sql'])await pool.query(fs.readFileSync(path.join(__dirname,'../migrations',file),'utf8'));
 const before=(await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name")).rows;
 const c=await pool.connect();try{
 await assert.rejects(()=>migrate({query:sql=>sql.startsWith('SELECT id,fingerprint')?Promise.reject(Error('injected verification failure')):c.query(sql)}),/injected/);
 assert.deepEqual((await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name")).rows,before);pass('failed additive upgrade rolls back both new tables');
 await migrate(c);await migrate(c);assert.equal((await pool.query('SELECT count(*)::int n FROM lucy_inference_grants')).rows[0].n,0);pass('exact deployed schema upgrade is additive, idempotent and unfunded');
 }finally{c.release();}
 const ready=[];
 for(let i=0;i<12;i++){
  let wake;ready.push(new Promise(resolve=>wake=resolve));
  const child=fork(path.join(__dirname,'fixtures/lucy-budget-process.cjs'),[],{stdio:['ignore','pipe','pipe','ipc'],env:{PATH:process.env.PATH,NODE_ENV:'test',LUCY_BUDGET_TEST_DATABASE_URL:url.toString(),LUCY_BACKGROUND_WORK_ENABLED:'true',LUCY_BACKGROUND_BUDGET_GRANT:JSON.stringify(source)}});
  let result,errors='';child.stderr.on('data',x=>errors+=x);child.stdout.resume();child.on('message',m=>{if(m.ready)wake();else result=m;});
  const exit=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve(result):reject(Error(`worker ${code}: ${errors}`)));});workers.push({child,exit});
 }
 await Promise.all(ready);workers.forEach(w=>w.child.send('go'));const results=await Promise.all(workers.map(w=>w.exit));
 assert.equal(results.filter(x=>x?.reserved).length,6);const row=(await pool.query('SELECT * FROM lucy_inference_grants')).rows[0];assert.equal(row.reserved_nanos,'930336000');assert.equal((await pool.query('SELECT count(*)::int n FROM lucy_inference_reservations')).rows[0].n,6);pass('twelve independent processes cannot overspend a one-dollar shared grant');
 const grant=budget.readLucyBudgetGrant();await assert.rejects(()=>budget.reserveLucyBudget(grant,20000));pass('restart preserves consumed reservation capacity');
 process.env.LUCY_BACKGROUND_BUDGET_GRANT=JSON.stringify({...source,maxUsd:'5.00'});await assert.rejects(()=>budget.reserveLucyBudget(budget.readLucyBudgetGrant(),20000));pass('same-ID configuration edit cannot reset or enlarge funds');
 const replacement={...source,id:'expiry-grant',maxUsd:'5.00'};process.env.LUCY_BACKGROUND_BUDGET_GRANT=JSON.stringify(replacement);const fresh=budget.readLucyBudgetGrant();const id=await budget.reserveLucyBudget(fresh,20000);await budget.finishLucyReservation(fresh,id,'uncertain');await assert.rejects(()=>budget.reserveLucyBudget(fresh,20000));pass('uncertain charge blocks further allocation and keeps funds consumed');
 const active={...source,id:'revocation-grant',maxUsd:'5.00'};process.env.LUCY_BACKGROUND_BUDGET_GRANT=JSON.stringify(active);const live=budget.readLucyBudgetGrant();const pending=await budget.reserveLucyBudget(live,20000);assert.equal(await budget.lucyReservationActive(live,pending),true);await pool.query('UPDATE lucy_inference_grants SET blocked=true WHERE id=$1',[active.id]);assert.equal(await budget.lucyReservationActive(live,pending),false);pass('durable grant revocation fences already reserved dispatch');
 // The former workspace migrator's SQL can still run while the additive budget ledger remains intact.
 for(const file of ['20261108_lucy_background_work.sql','20261108_lucy_user_preferences.sql','20261108_lucy_request_ledger.sql','20261108_lucy_work_modes.sql','20261108_lucy_work_briefing.sql'])await pool.query(fs.readFileSync(path.join(__dirname,'../migrations',file),'utf8'));
 assert.equal((await pool.query("SELECT reserved_nanos FROM lucy_inference_grants WHERE id='concurrent-grant'")).rows[0].reserved_nanos,'930336000');pass('old migrations preserve additive ledger for rollback with AI flag off');
 console.log(`BUDGET_POSTGRES_COMPLETE ${checks} checks; zero provider calls`);
}finally{for(const w of workers)if(w.child.exitCode===null)w.child.kill('SIGKILL');await pool.end();}})().catch(error=>{console.error(error);process.exitCode=1;});
