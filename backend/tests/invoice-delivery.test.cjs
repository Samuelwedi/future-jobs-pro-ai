const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const {pool}=require('../dist/config/database');
const mail=require('../dist/services/emailService');
const {deliverInvoice}=require('../dist/services/invoiceDeliveryService');
const db=new PGlite(); let calls=[],fail=false;
before(async()=>{
 await db.exec(`CREATE TABLE companies(id text primary key,name text);
 CREATE TABLE users(id text primary key,company_id text,email text);
 CREATE TABLE invoices(id text primary key,company_id text,client_id text,status text,total numeric,due_date date,invoice_number text,client_notes text,sent_at timestamptz,payment_link text);
 CREATE TABLE invoice_items(id integer,invoice_id text,description text,quantity numeric,unit_price numeric);
 INSERT INTO companies VALUES('company','<Company>'),('other','Other');
 INSERT INTO users VALUES('client','company','client@example.test'),('foreign','other','foreign@example.test');
 INSERT INTO invoices VALUES('invoice','company','client','draft',25,'2026-11-10','INV-1','<script>bad</script>',NULL,NULL);
 INSERT INTO invoice_items VALUES(1,'invoice','<img src=x>',1,25);`);
 pool.connect=async()=>({query:async(sql,args)=>{const r=await db.query(sql,args);return {rows:r.rows,rowCount:r.rows.length};},release(){}});
 mail.sendEmail=async(...args)=>{calls.push(args);if(fail)throw Error('SMTP failed');};
});
after(async()=>{await db.close();await pool.end();});
test('tenant mismatch and foreign client never send email',async()=>{
 await assert.rejects(deliverInvoice('invoice','other'),e=>e.status===404);
 await db.exec("UPDATE invoices SET client_id='foreign'");
 await assert.rejects(deliverInvoice('invoice','company'),e=>e.status===409);
 assert.equal(calls.length,0);await db.exec("UPDATE invoices SET client_id='client'");
});
test('provider failure preserves draft and sent_at',async()=>{
 fail=true;await assert.rejects(deliverInvoice('invoice','company'),e=>e.status===503);
 const row=(await db.query('SELECT * FROM invoices')).rows[0];assert.equal(row.status,'draft');assert.equal(row.sent_at,null);fail=false;calls=[];
});
test('accepted delivery escapes content and does not fabricate a payment URL',async()=>{
 const invoice=await deliverInvoice('invoice','company');assert.equal(invoice.status,'sent');assert.ok(invoice.sent_at);assert.equal(invoice.payment_link,null);
 assert.equal(calls.length,1);assert.equal(calls[0][0],'client@example.test');assert.match(calls[0][2],/&lt;img src=x&gt;/);assert.match(calls[0][2],/&lt;script&gt;/);assert.ok(!calls[0][2].includes('/pay/invoice/'));
 await assert.rejects(deliverInvoice('invoice','company'),e=>e.status===409);assert.equal(calls.length,1);
});
test('paid invoices cannot be reset to sent',async()=>{
 await db.exec("UPDATE invoices SET status='paid'");await assert.rejects(deliverInvoice('invoice','company'),e=>e.status===409);assert.equal(calls.length,1);
  await assert.rejects(deliverInvoice('invoice','company',true),e=>e.status===409);assert.equal(calls.length,1);
});
test('explicit reminders preserve overdue status and prevent rapid duplicates',async()=>{
 await db.exec("UPDATE invoices SET status='overdue',sent_at=NOW()-INTERVAL '2 minutes'");
 const invoice=await deliverInvoice('invoice','company',true);assert.equal(invoice.status,'overdue');assert.equal(calls.length,2);
 await assert.rejects(deliverInvoice('invoice','company',true),e=>e.status===429);assert.equal(calls.length,2);
});
