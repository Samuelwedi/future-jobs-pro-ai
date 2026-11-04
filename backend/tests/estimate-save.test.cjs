const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const {pool}=require('../dist/config/database');
const {saveEstimate}=require('../dist/services/estimateSaveService');
const db=new PGlite();let fail=false;
const input=()=>({clientId:'client',projectId:'project',issueDate:'2026-11-04',expiryDate:'2026-12-04',taxRate:5,items:[{description:'Work',quantity:2,unit_price:25}]});
before(async()=>{
 await db.exec(`CREATE TABLE projects(id text,company_id text);CREATE TABLE users(id text,company_id text);
 INSERT INTO projects VALUES('project','company'),('foreign','other');INSERT INTO users VALUES('client','company'),('foreign','other');
 CREATE TABLE estimates(id uuid primary key default gen_random_uuid(),company_id text,project_id text,client_id text,issue_date date,expiry_date date,tax_rate numeric,subtotal numeric,notes text,client_notes text,created_by text,status text default 'draft');
 CREATE TABLE estimate_items(estimate_id uuid references estimates(id),description text,quantity numeric,unit_price numeric);`);
 pool.connect=async()=>({query:async(sql,args)=>{if(fail&&sql.startsWith('INSERT INTO estimate_items'))throw Error('item write failed');return db.query(sql,args);},release(){}});
});
after(async()=>{await db.close();await pool.end();});
test('invalid dates, amounts and cross-company references are rejected',async()=>{
 for(const patch of [{issueDate:'2026-02-30'},{expiryDate:'2026-01-01'},{taxRate:Infinity},{items:[{description:'x',quantity:-1,unit_price:10}]},{clientId:'foreign'},{projectId:'foreign'}]) {
  await assert.rejects(saveEstimate('company','actor',{...input(),...patch}),e=>e.status===400);
 }
 assert.equal((await db.query('SELECT * FROM estimates')).rows.length,0);
});
test('failed creation rolls back the estimate and its items',async()=>{
 fail=true;await assert.rejects(saveEstimate('company','actor',input()));fail=false;
 assert.equal((await db.query('SELECT * FROM estimates')).rows.length,0);
});
test('draft edit preserves original data on failure and rejects foreign or sent records',async()=>{
 const created=await saveEstimate('company','actor',input());assert.equal(Number(created.subtotal),50);assert.equal(created.created_by,'actor');
 fail=true;await assert.rejects(saveEstimate('company','actor',{...input(),notes:'changed'},created.id));fail=false;
 assert.equal((await db.query('SELECT notes FROM estimates')).rows[0].notes,null);
 assert.equal((await db.query('SELECT * FROM estimate_items')).rows.length,1);
 const updated=await saveEstimate('company','actor',{...input(),notes:'saved',items:[{description:'Updated',quantity:3,unit_price:10}]},created.id);
 assert.equal(updated.notes,'saved');assert.equal(Number(updated.subtotal),30);assert.equal((await db.query('SELECT * FROM estimate_items')).rows.length,1);
 await assert.rejects(saveEstimate('other','actor',input(),created.id),e=>e.status===404);
 await db.query("UPDATE estimates SET status='sent'");
 await assert.rejects(saveEstimate('company','actor',input(),created.id),e=>e.status===409);
});
