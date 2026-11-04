const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const express=require('express');const jwt=require('jsonwebtoken');
process.env.JWT_SECRET='estimate-conversion-local-test';
const {pool}=require('../dist/config/database');
const db=new PGlite();let server,base,fail=false;
const query=async(sql,args)=>{if(fail&&sql.includes('INSERT INTO invoice_items'))throw Error('copy failed');return db.query(sql,args);};
before(async()=>{
 await db.exec(`CREATE TABLE users(id text,company_id text);INSERT INTO users VALUES('actor','company');
 CREATE TABLE estimates(id text primary key,company_id text,project_id text,client_id text,tax_rate numeric,subtotal numeric,notes text,client_notes text,created_by text,status text,converted_to_invoice_id uuid,accepted_at timestamptz);
 CREATE TABLE estimate_items(estimate_id text,description text,quantity numeric,unit_price numeric);
 CREATE TABLE invoices(id uuid primary key default gen_random_uuid(),company_id text,project_id text,client_id text,issue_date date,due_date date,tax_rate numeric,subtotal numeric,notes text,client_notes text,created_by text);
 CREATE TABLE invoice_items(invoice_id uuid references invoices(id),description text,quantity numeric,unit_price numeric);
 INSERT INTO estimates(id,company_id,status,subtotal) VALUES('estimate','company','sent',50);
 INSERT INTO estimate_items VALUES('estimate','Work',2,25);`);
 pool.query=query;pool.connect=async()=>({query,release(){}});
 const app=express();app.use(express.json());app.use(require('../dist/routes/estimateRouter').default);server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{await new Promise(r=>server.close(r));await db.close();await pool.end();});
async function call(action){const response=await fetch(`${base}/estimate/${action}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+jwt.sign({id:'actor'},process.env.JWT_SECRET)},body:'{}'});return {status:response.status,data:await response.json()};}
test('failed invoice item copy rolls back entire conversion; retries reuse the invoice',async()=>{
 fail=true;assert.equal((await call('convert')).status,500);fail=false;
 assert.equal((await db.query('SELECT * FROM invoices')).rows.length,0);
 assert.equal((await db.query('SELECT status FROM estimates')).rows[0].status,'sent');
 const converted=await call('convert');assert.equal(converted.status,200);assert.ok(converted.data.invoice.id);
 const retry=await call('convert');assert.equal(retry.status,200);assert.equal(retry.data.invoice.id,converted.data.invoice.id);
 assert.equal((await db.query('SELECT * FROM invoices')).rows.length,1);
 assert.equal((await call('accept')).status,409);
 assert.equal((await db.query('SELECT status FROM estimates')).rows[0].status,'converted');
});
