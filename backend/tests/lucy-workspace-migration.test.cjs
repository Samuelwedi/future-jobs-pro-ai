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
