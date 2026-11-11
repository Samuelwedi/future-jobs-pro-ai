const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');const budget=require('../dist/services/lucyBackgroundBudget');const {pool}=require('../dist/config/database');
const fixed=Date.parse('2026-11-08T12:00:00.000Z');
const source={id:'grant-one',model:'gpt-6.1-sol',maxUsd:'0.32',approvedAt:'2026-11-08T11:00:00.000Z',expiresAt:'2026-11-09T11:00:00.000Z'};
test('persistent budget ledger is additive, idempotent, conservative and immutable',async t=>{
 const db=new PGlite(),env={...process.env},clock=Date.now,original={query:pool.query,connect:pool.connect};let databaseNow=fixed,commitFailure=false;
 // Deterministic database clock only. The concurrent PostgreSQL fixture exercises unchanged production SQL.
 const query=async(sql,args)=>{if(commitFailure&&sql==='COMMIT')throw new Error('uncertain commit');const result=await db.query(sql.replaceAll('clock_timestamp()',`TIMESTAMPTZ '${new Date(databaseNow).toISOString()}'`),args);return{rows:result.rows,rowCount:result.affectedRows||result.rows.length};};
 pool.query=query;pool.connect=async()=>({query,release(){}});Date.now=()=>fixed;
 process.env.LUCY_BACKGROUND_WORK_ENABLED='true';const configure=value=>{process.env.LUCY_BACKGROUND_BUDGET_GRANT=JSON.stringify(value);return budget.readLucyBudgetGrant();};
 let grant=configure(source);
 try{
 const migration=fs.readFileSync(path.join(__dirname,'../migrations/20261108_lucy_inference_budget.sql'),'utf8');await db.exec(migration);await db.exec(migration);
 assert.equal((await query('SELECT * FROM lucy_inference_grants')).rows.length,0);
 await t.test('successful and incomplete calls keep their entire reservations and reject overdraft',async()=>{
 const first=await budget.reserveLucyBudget(grant,20000);assert.equal(await budget.lucyReservationActive(grant,first),true);await budget.finishLucyReservation(grant,first,'completed',{input:10,output:10});assert.equal(await budget.lucyReservationActive(grant,first),false);
 const second=await budget.reserveLucyBudget(grant,20000);await budget.finishLucyReservation(grant,second,'incomplete',{input:30,output:4096});await assert.rejects(()=>budget.reserveLucyBudget(grant,20000));
 const row=(await query('SELECT * FROM lucy_inference_grants')).rows[0];assert.equal(String(row.reserved_nanos),'310112000');assert.equal(String(row.maximum_nanos),'320000000');
 await assert.rejects(()=>budget.finishLucyReservation(grant,first,'completed',{input:0,output:0}));assert.equal(String((await query('SELECT reserved_nanos FROM lucy_inference_grants')).rows[0].reserved_nanos),'310112000');
 });
 await t.test('same grant ID cannot reset or expand cap, model, expiry, or approval time',async()=>{
 for(const change of [{maxUsd:'5.00'},{model:'gpt-6-astra'},{expiresAt:'2026-11-10T11:00:00.000Z'},{approvedAt:'2026-11-08T10:00:00.000Z'}]){grant=configure({...source,...change});await assert.rejects(()=>budget.reserveLucyBudget(grant,20000));}
 grant=configure(source);assert.equal(Number((await query('SELECT count(*) FROM lucy_inference_grants')).rows[0].count),1);
 });
 await t.test('separate explicit grant has isolated funds; unknown outcome blocks it permanently',async()=>{
 grant=configure({...source,id:'grant-two',maxUsd:'5.00'});const id=await budget.reserveLucyBudget(grant,20000);await budget.finishLucyReservation(grant,id,'uncertain');assert.equal(await budget.lucyReservationActive(grant,id),false);await assert.rejects(()=>budget.reserveLucyBudget(grant,20000));
 const row=(await query("SELECT * FROM lucy_inference_grants WHERE id='grant-two'")).rows[0];assert.equal(row.blocked,true);assert.equal(String(row.reserved_nanos),'155056000');
 });
 await t.test('cancelled or pre-dispatch failures never return capacity; crash reservation survives restart',async()=>{
 grant=configure({...source,id:'grant-three',maxUsd:'0.32'});const first=await budget.reserveLucyBudget(grant,20000);await budget.finishLucyReservation(grant,first,'not_dispatched');const pending=await budget.reserveLucyBudget(grant,20000);
 const reloaded=configure({...source,id:'grant-three',maxUsd:'0.32'});assert.equal(await budget.lucyReservationActive(reloaded,pending),true);await assert.rejects(()=>budget.reserveLucyBudget(reloaded,20000));
 assert.equal((await query("SELECT outcome FROM lucy_inference_reservations WHERE id=$1",[pending])).rows[0].outcome,'reserved');
 });
 await t.test('database expiry, durable revocation and config kill switch independently fence dispatch',async()=>{
 grant=configure({...source,id:'grant-four',maxUsd:'5.00'});const id=await budget.reserveLucyBudget(grant,20000);databaseNow=Date.parse(source.expiresAt);assert.equal(await budget.lucyReservationActive(grant,id),false);await assert.rejects(()=>budget.reserveLucyBudget(grant,20000));databaseNow=fixed;
 await query("UPDATE lucy_inference_grants SET blocked=true WHERE id='grant-four'");assert.equal(await budget.lucyReservationActive(grant,id),false);delete process.env.LUCY_BACKGROUND_WORK_ENABLED;await assert.rejects(()=>budget.reserveLucyBudget(grant,20000));assert.equal(await budget.lucyReservationActive(grant,id),false);process.env.LUCY_BACKGROUND_WORK_ENABLED='true';
 });
 await t.test('persisted field drift cannot silently expand the configured approval',async()=>{
 grant=configure({...source,id:'drift',maxUsd:'5.00'});const id=await budget.reserveLucyBudget(grant,20000);
 await query("UPDATE lucy_inference_grants SET maximum_nanos=6000000000 WHERE id='drift'");assert.equal(await budget.lucyReservationActive(grant,id),false);await assert.rejects(()=>budget.reserveLucyBudget(grant,20000));
 });
 await t.test('transaction failure cannot release a dispatch handle',async()=>{
 grant=configure({...source,id:'commit-failure',maxUsd:'5.00'});commitFailure=true;await assert.rejects(()=>budget.reserveLucyBudget(grant,20000));commitFailure=false;assert.equal((await query("SELECT id FROM lucy_inference_grants WHERE id='commit-failure'")).rows.length,0);
 });
 await t.test('schema contains no prompts or tenant/provider error data and checks invalid money',async()=>{
 const cols=(await query("SELECT column_name FROM information_schema.columns WHERE table_name='lucy_inference_reservations'")).rows.map(x=>x.column_name);assert.ok(!cols.some(x=>/prompt|company|user|error|key/.test(x)));
 await assert.rejects(()=>query("UPDATE lucy_inference_grants SET reserved_nanos=maximum_nanos+1 WHERE id='grant-one'"),/constraint/);await assert.rejects(()=>query("UPDATE lucy_inference_grants SET reserved_nanos=-1 WHERE id='grant-one'"),/constraint/);
 });
 }finally{pool.query=original.query;pool.connect=original.connect;process.env=env;Date.now=clock;await db.close();}
});
