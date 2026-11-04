const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const {pool}=require('../dist/config/database');
const mail=require('../dist/services/emailService');
const {deliverEstimate}=require('../dist/services/estimateDeliveryService');
const db=new PGlite(); let calls=[],fail=false;
before(async()=>{
 await db.exec(`CREATE TABLE companies(id text primary key,name text);
 CREATE TABLE users(id text primary key,company_id text,email text);
 CREATE TABLE estimates(id text primary key,company_id text,client_id text,status text,total numeric,expiry_date date,estimate_number text,client_notes text,sent_at timestamptz);
 CREATE TABLE estimate_items(id integer,estimate_id text,description text,quantity numeric,unit_price numeric);
 INSERT INTO companies VALUES('company','<Company>'),('other','Other');
 INSERT INTO users VALUES('client','company','client@example.test'),('foreign','other','foreign@example.test');
 INSERT INTO estimates VALUES('estimate','company','client','draft',25,'2026-11-10','INV-1','<script>bad</script>',NULL);
 INSERT INTO estimate_items VALUES(1,'estimate','<img src=x>',1,25);`);
 pool.connect=async()=>({query:async(sql,args)=>{const r=await db.query(sql,args);return {rows:r.rows,rowCount:r.rows.length};},release(){}});
 mail.sendEmail=async(...args)=>{calls.push(args);if(fail)throw Error('SMTP failed');};
});
after(async()=>{await db.close();await pool.end();});
test('tenant mismatch and foreign client never send email',async()=>{
 await assert.rejects(deliverEstimate('estimate','other'),e=>e.status===404);
 await db.exec("UPDATE estimates SET client_id='foreign'");
 await assert.rejects(deliverEstimate('estimate','company'),e=>e.status===409);
 assert.equal(calls.length,0);await db.exec("UPDATE estimates SET client_id='client'");
});
test('provider failure preserves draft and sent_at',async()=>{
 fail=true;await assert.rejects(deliverEstimate('estimate','company'),e=>e.status===503);
 const row=(await db.query('SELECT * FROM estimates')).rows[0];assert.equal(row.status,'draft');assert.equal(row.sent_at,null);fail=false;calls=[];
});
test('accepted delivery escapes content and does not fabricate a payment URL',async()=>{
 const estimate=await deliverEstimate('estimate','company');assert.equal(estimate.status,'sent');assert.ok(estimate.sent_at);
 assert.equal(calls.length,1);assert.equal(calls[0][0],'client@example.test');assert.match(calls[0][2],/&lt;img src=x&gt;/);assert.match(calls[0][2],/&lt;script&gt;/);assert.ok(!calls[0][2].includes('/pay/estimate/'));
 await assert.rejects(deliverEstimate('estimate','company'),e=>e.status===409);assert.equal(calls.length,1);
});
test('accepted or rejected estimates cannot be reset to sent',async()=>{
 for (const status of ['accepted','rejected','expired']) {
  await db.query('UPDATE estimates SET status=$1',[status]);
  await assert.rejects(deliverEstimate('estimate','company'),e=>e.status===409);
 }
 assert.equal(calls.length,1);
});
