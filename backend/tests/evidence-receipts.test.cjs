const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
test('receipt migration registered and aborts predeploy on failure', () => {
 const {run,steps} = require('../scripts/run-release-predeploy.cjs');
 assert.ok(steps.includes('run-evidence-receipts-migration.cjs'));
 assert.throws(() => run(() => ({status:1})), /migration failed/);
});
test('receipt migration verifies schema and rolls back errors', async () => {
 const {migrate} = require('../scripts/run-evidence-receipts-migration.cjs');
 const calls=[];
 await assert.rejects(migrate({query:async sql => {calls.push(sql);if(sql.startsWith('SELECT')) throw Error('schema');}}));
 assert.equal(calls.at(-1),'ROLLBACK');
});
test('receipt migration creates unique durable actor and tenant key, no reclaim lease', () => {
 const sql=fs.readFileSync(path.join(root,'migrations/20261109_evidence_receipts.sql'),'utf8');
 assert.match(sql,/PRIMARY KEY\(company_id, actor_id, request_key\)/);
 assert.match(sql,/'processing','completed','uncertain'/);
});
test('route claims before provider work and commits receipt with photo', () => {
 const source=fs.readFileSync(path.join(root,'src/routes/photoRoutes.ts'),'utf8');
 assert.ok(source.indexOf('await claimEvidence') < source.indexOf('await analyzePhotoCompliance'));
 assert.ok(source.indexOf("await db.query('BEGIN')") < source.indexOf('INSERT INTO photos'));
 assert.ok(source.indexOf("SET state='completed'") < source.indexOf("await db.query('COMMIT')"));
 assert.match(source,/previous.fingerprint !== fingerprint/);
 assert.match(source,/state='uncertain'.*state='processing'/);
});
test('PGlite durable claims serialize duplicate keys and rollback photo/receipt atomically', {timeout:60000}, async () => {
 const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();
 const {pool}=require('../dist/config/database');const original=pool.query;
 const query=async(sql,values)=>{const r=await db.query(sql,values);return {...r,rowCount:r.rowCount ?? (r.rows.length || r.affectedRows || 0)};};
 try {
  await db.exec(fs.readFileSync(path.join(root,'migrations/20261109_evidence_receipts.sql'),'utf8'));
  await db.exec('CREATE TABLE photos(id text PRIMARY KEY)');pool.query=query;
  const {claimEvidence}=require('../dist/services/evidenceReceipts');
  const scope=['company','actor','stable-request-key'];const body={userId:'actor',projectId:'project'};
  const claims=await Promise.all(Array.from({length:8},()=>claimEvidence(scope,'hash',body)));
  assert.equal(claims.filter(r=>r===null).length,1);
  assert.equal((await query('SELECT * FROM evidence_upload_receipts')).rows.length,1);
  await db.exec('BEGIN');await db.exec("INSERT INTO photos VALUES ('photo')");
  await query("UPDATE evidence_upload_receipts SET state='completed',response=$1::jsonb",[JSON.stringify({photoId:'photo'})]);
  await db.exec('ROLLBACK');
  assert.equal((await query('SELECT * FROM photos')).rows.length,0);
  assert.equal((await claimEvidence(scope,'hash',body)).state,'processing');
  assert.equal((await claimEvidence(scope,'changed',body)).fingerprint,'hash');
  assert.equal(await claimEvidence(['company','different-actor','stable-request-key'],'hash',body),null);
  assert.equal(await claimEvidence(['different-company','actor','stable-request-key'],'hash',body),null);
 } finally {pool.query=original;await db.close();}
});
test('receipt reads check current actor permissions in the same database statement', {timeout:60000}, async()=>{
 const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();
 try {
  await db.exec('CREATE TABLE users(id text,company_id text,role text,is_active boolean); CREATE TABLE projects(id text,company_id text); CREATE TABLE time_entries(id text,user_id text,project_id text);');
  await db.exec(fs.readFileSync(path.join(root,'migrations/20261109_evidence_receipts.sql'),'utf8'));
  await db.exec("INSERT INTO users VALUES ('actor','company','manager',true),('employee','company','employee',true); INSERT INTO projects VALUES ('project','company'); INSERT INTO evidence_upload_receipts(company_id,actor_id,request_key,fingerprint,user_id,project_id,state,response) VALUES ('company','actor','stable-request-key','hash','employee','project','completed','{}');");
  const source=fs.readFileSync(path.join(root,'src/routes/photoRoutes.ts'),'utf8');
  const sql=source.match(/return pool.query\(`(SELECT r.state,r.response[\s\S]*?)`,/)[1];
  const read=()=>db.query(sql,['company','actor','stable-request-key']);
  assert.equal((await read()).rows.length,1);
  await db.exec("UPDATE users SET role='employee' WHERE id='actor'");assert.equal((await read()).rows.length,0);
  await db.exec("UPDATE users SET role='manager',is_active=false WHERE id='actor'");assert.equal((await read()).rows.length,0);
  await db.exec("UPDATE users SET is_active=true,company_id='other' WHERE id='actor'");assert.equal((await read()).rows.length,0);
  await db.exec("UPDATE users SET company_id='company' WHERE id='actor'; UPDATE projects SET company_id='other'");assert.equal((await read()).rows.length,0);
 } finally {await db.close();}
});
