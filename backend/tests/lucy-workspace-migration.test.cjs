const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const {migrate}=require('../scripts/run-lucy-workspace-migration.cjs');
const {steps}=require('../scripts/run-release-predeploy.cjs');
test('Lucy workspace schema migration is idempotent and included in release predeploy',async()=>{
 const db=new PGlite();
 try{
  await db.exec('CREATE TABLE companies(id uuid primary key); CREATE TABLE users(id uuid primary key);');
  const client={query:sql=>db.exec(sql)};await migrate(client);await migrate(client);
  const tables=await db.query("SELECT table_name FROM information_schema.tables WHERE table_name IN ('lucy_background_work','lucy_user_preferences','lucy_request_ledger')");assert.equal(tables.rows.length,3);
  assert.ok(steps.includes('run-lucy-workspace-migration.cjs'));
 }finally{await db.close();}
});
test('Lucy workspace migration rolls back all tables on verification failure',async()=>{
 const db=new PGlite();
 try{
  await db.exec('CREATE TABLE companies(id uuid primary key); CREATE TABLE users(id uuid primary key);');
  await assert.rejects(()=>migrate({query:sql=>{if(sql.startsWith('SELECT id,'))throw new Error('Simulated verification failure');return db.exec(sql);}}),/verification/);
  const tables=await db.query("SELECT table_name FROM information_schema.tables WHERE table_name IN ('lucy_background_work','lucy_user_preferences','lucy_request_ledger')");assert.equal(tables.rows.length,0);
 }finally{await db.close();}
});

test('unsupported Unicode normalization stops predeploy before creating any Lucy tables',async()=>{
 const db=new PGlite();
 try{await db.exec('CREATE TABLE companies(id uuid primary key); CREATE TABLE users(id uuid primary key);');
  await assert.rejects(()=>migrate({query:sql=>{if(sql.startsWith('SELECT normalize'))throw new Error('Normalization unavailable');return db.exec(sql);}}),/Normalization unavailable/);
  const tables=await db.query("SELECT table_name FROM information_schema.tables WHERE table_name IN ('lucy_background_work','lucy_user_preferences','lucy_request_ledger')");assert.equal(tables.rows.length,0);
 }finally{await db.close();}
});

test('mode migration upgrades deployed three-table workspace without altering legacy jobs or retry identities',async()=>{
 const db=new PGlite();const fs=require('node:fs'),path=require('node:path');
 const company='00000000-0000-4000-a000-000000000001',user='00000000-0000-4000-a000-000000000002',job='00000000-0000-4000-a000-000000000003';
 try{
  await db.exec('CREATE TABLE companies(id uuid primary key); CREATE TABLE users(id uuid primary key);');
  for(const file of ['20261108_lucy_background_work.sql','20261108_lucy_user_preferences.sql','20261108_lucy_request_ledger.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../migrations',file),'utf8'));
  await db.query('INSERT INTO companies VALUES($1)',[company]);await db.query('INSERT INTO users VALUES($1)',[user]);
  await db.query("INSERT INTO lucy_background_work(id,company_id,user_id,actor_role,prompt,request_key,status,result) VALUES($1,$2,$3,'owner',$4,'legacy','completed',$5)",[job,company,user,'x'.repeat(4000),JSON.stringify({text:'Retained AI report'})]);
  const before=(await db.query('SELECT * FROM lucy_background_work WHERE id=$1',[job])).rows[0];
  await migrate({query:sql=>db.exec(sql)});await migrate({query:sql=>db.exec(sql)});
  const after=(await db.query('SELECT * FROM lucy_background_work WHERE id=$1',[job])).rows[0];assert.deepEqual(after,{...before,mode:'ai_research'});
  const legacyWriter=await db.query("INSERT INTO lucy_background_work(id,company_id,user_id,actor_role,prompt,request_key) VALUES(gen_random_uuid(),$1,$2,'owner','Old producer','old-writer') RETURNING mode",[company,user]);assert.equal(legacyWriter.rows[0].mode,'ai_research');
  await db.query("INSERT INTO lucy_background_work(id,company_id,user_id,actor_role,prompt,request_key,mode) VALUES(gen_random_uuid(),$1,$2,'owner',$3,'local','record_search')",[company,user,'x'.repeat(200)]);
  for(const [mode,prompt] of [['unknown','x'],[null,'x'],['record_search','x'.repeat(201)]])await assert.rejects(()=>db.query("INSERT INTO lucy_background_work(id,company_id,user_id,actor_role,prompt,request_key,mode) VALUES(gen_random_uuid(),$1,$2,'owner',$3,'bad',$4)",[company,user,prompt,mode]),/constraint/);
  await assert.rejects(()=>db.query("INSERT INTO lucy_background_work(id,company_id,user_id,actor_role,prompt,request_key,mode) VALUES(gen_random_uuid(),$1,$2,'owner','North','legacy','record_search')",[company,user]),/unique constraint/);
 }finally{await db.close();}
});

test('failed upgrade rolls back the new mode column and preserves deployed jobs',async()=>{
 const db=new PGlite();const fs=require('node:fs'),path=require('node:path');
 try{
  await db.exec('CREATE TABLE companies(id uuid primary key); CREATE TABLE users(id uuid primary key);');
  for(const file of ['20261108_lucy_background_work.sql','20261108_lucy_user_preferences.sql','20261108_lucy_request_ledger.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../migrations',file),'utf8'));
  await assert.rejects(()=>migrate({query:sql=>{if(sql.startsWith('SELECT id,'))throw new Error('Simulated mode verification failure');return db.exec(sql);}}),/verification/);
  const columns=await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='lucy_background_work' AND column_name='mode'");assert.equal(columns.rows.length,0);
  const tables=await db.query("SELECT table_name FROM information_schema.tables WHERE table_name IN ('lucy_background_work','lucy_user_preferences','lucy_request_ledger')");assert.equal(tables.rows.length,3);
 }finally{await db.close();}
});
