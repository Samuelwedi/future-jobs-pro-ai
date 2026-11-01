const {test,before,after}=require('node:test');const assert=require('node:assert/strict');const {PGlite}=require('@electric-sql/pglite');const fs=require('node:fs');
process.env.JWT_SECRET='business-parity-test-only';const jwt=require('jsonwebtoken');const express=require('express');const {pool}=require('../dist/config/database');const {validateInvoiceLines,validateInvoiceHeader}=require('../dist/services/invoiceValidation');
const db=new PGlite();let server,base,integrationCompany,failLine=false;
const id={company:'00000000-0000-4000-a000-000000000001',other:'00000000-0000-4000-a000-000000000002',boss:'00000000-0000-4000-a000-000000000011',worker:'00000000-0000-4000-a000-000000000012',inactive:'00000000-0000-4000-a000-000000000013',foreign:'00000000-0000-4000-a000-000000000014',payroll:'00000000-0000-4000-a000-000000000021',otherPayroll:'00000000-0000-4000-a000-000000000022',invoice:'00000000-0000-4000-a000-000000000031',project:'00000000-0000-4000-a000-000000000041',time:'00000000-0000-4000-a000-000000000051'};
const query=async(sql,args)=>{if(failLine&&sql.startsWith('INSERT INTO invoice_items'))throw Error('Injected item write failure');const result=await db.query(sql,args);return{rows:result.rows,rowCount:result.rows.length||result.affectedRows||0};};
before(async()=>{
 await db.exec(`CREATE TABLE companies(id uuid primary key);INSERT INTO companies VALUES('${id.company}'),('${id.other}');CREATE TABLE users(id uuid primary key,company_id uuid,role text,is_active boolean default true,first_name text,last_name text);CREATE TABLE projects(id uuid primary key,company_id uuid,client_id uuid,name text);
 CREATE TABLE payrolls(id uuid primary key,company_id uuid,period_start date,period_end date,status text);CREATE TABLE payroll_items(id uuid primary key,payroll_id uuid,employee_id uuid,hours numeric,hourly_rate numeric,adjustments numeric,cpp_deduction numeric,ei_deduction numeric,tax_deduction numeric,calculation_snapshot jsonb);
 CREATE TABLE invoices(id uuid primary key default gen_random_uuid(),company_id uuid,project_id uuid,client_id uuid,issue_date date,due_date date,tax_rate numeric,subtotal numeric,notes text,client_notes text,created_by uuid,is_recurring boolean,recurring_frequency text,recurring_end_date date,status text default 'draft');CREATE TABLE invoice_items(id uuid default gen_random_uuid(),invoice_id uuid,description text,quantity numeric,unit_price numeric,time_entry_ids uuid[]);CREATE TABLE payments(id uuid,invoice_id uuid);CREATE TABLE time_entries(id uuid,user_id uuid,project_id uuid,approval_status text,clock_out timestamptz);
 INSERT INTO users VALUES('${id.boss}','${id.company}','boss',true,'Owner','Test'),('${id.worker}','${id.company}','employee',true,'=PAYLOAD','Employee'),('${id.inactive}','${id.company}','boss',false,'Inactive','User'),('${id.foreign}','${id.other}','boss',true,'Foreign','Employee');
 INSERT INTO payrolls VALUES('${id.payroll}','${id.company}','2026-10-01','2026-10-31','draft'),('${id.otherPayroll}','${id.other}','2026-10-01','2026-10-31','draft');INSERT INTO payroll_items VALUES(gen_random_uuid(),'${id.payroll}','${id.worker}',10,20,0,0,0,0,NULL),(gen_random_uuid(),'${id.otherPayroll}','${id.foreign}',99,99,0,0,0,0,NULL);
 INSERT INTO invoices(id,company_id,issue_date,due_date,tax_rate,subtotal,notes) VALUES('${id.invoice}','${id.company}','2026-10-01','2026-10-31',5,20,'Original');INSERT INTO invoice_items(invoice_id,description,quantity,unit_price,time_entry_ids) VALUES('${id.invoice}','Original',1,20,'{}');`);
 await db.exec(fs.readFileSync('migrations/20261031_invoice_request_keys.sql','utf8'));
 pool.query=query;pool.connect=async()=>({query,release(){}});
 require('../dist/services/integrationService').getIntegrationStatus=async company=>{integrationCompany=company;return{quickbooks:{connected:false},stripe:{connected:false}};};
 const app=express();app.use(express.json());app.use('/api/integrations',require('../dist/routes/integrationRoutes').default);app.use('/api/reports',require('../dist/routes/reportRoutes').default);app.use('/api/payroll/export',require('../dist/routes/payrollExportRoutes').default);app.use('/api/invoices',require('../dist/routes/invoiceRouter').default);
 server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+server.address().port;
});
after(async()=>{await new Promise(resolve=>server.close(resolve));await db.close();await pool.end();});
async function request(path,user=id.boss,method='GET',body){const response=await fetch(base+'/api'+path,{method,headers:{Authorization:'Bearer '+jwt.sign({id:user,companyId:id.other},process.env.JWT_SECRET),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await response.text();return{status:response.status,data};}
test('reports and integrations enforce active manager role and current database company',async()=>{
 for(const path of ['/reports/summary','/integrations/status','/integrations/stripe/auth']){assert.equal((await request(path,id.worker)).status,403,path);assert.equal((await request(path,id.inactive)).status,401,path);}
 assert.equal((await request('/integrations/status')).status,200);assert.equal(integrationCompany,id.company);
});
test('payroll exports isolate companies, neutralize CSV cells, validate dates and emit real PDFs',async()=>{
 assert.equal((await request('/payroll/export?format=csv',id.worker)).status,403);
 const csv=await request('/payroll/export?format=csv');assert.equal(csv.status,200,csv.data);assert.ok(csv.data.includes("'=PAYLOAD Employee"));assert.ok(!csv.data.includes('Foreign Employee'));
 assert.equal((await request('/payroll/export?employeeId='+id.foreign)).status,403);
 assert.equal((await request('/payroll/export?start=2026-02-30&end=2026-03-31')).status,400);
 assert.equal((await request('/payroll/export?format=unsupported')).status,400);
 const pdf=await request('/payroll/export?format=pdf&start=2026-10-01&end=2026-10-31');assert.equal(pdf.status,200,pdf.data);assert.ok(pdf.data.startsWith('%PDF-'));
});
test('invoice edits are atomic, recalculate subtotal and reject status shortcuts',async()=>{
 const body={issueDate:'2026-10-01',dueDate:'2026-10-31',taxRate:5,notes:'Changed',items:[{description:'Replacement',quantity:3,unit_price:0.1}]};
 failLine=true;const failed=await request('/invoices/'+id.invoice,id.boss,'PUT',body);failLine=false;assert.equal(failed.status,400);
 assert.equal((await query('SELECT notes FROM invoices WHERE id=$1',[id.invoice])).rows[0].notes,'Original');assert.equal((await query('SELECT description FROM invoice_items WHERE invoice_id=$1',[id.invoice])).rows[0].description,'Original');
 assert.equal((await request('/invoices/'+id.invoice,id.boss,'PUT',body)).status,200);assert.equal(Number((await query('SELECT subtotal FROM invoices WHERE id=$1',[id.invoice])).rows[0].subtotal),0.3);
 assert.equal((await request('/invoices/'+id.invoice,id.boss,'PUT',{...body,status:'paid'})).status,400);
 assert.equal((await request('/invoices/'+id.invoice,id.foreign,'PUT',body)).status,404);
});
test('invoice creation rejects foreign or unapproved linked labor and rolls back',async()=>{
 const before=(await query('SELECT count(*) n FROM invoices')).rows[0].n;const response=await request('/invoices',id.boss,'POST',{issueDate:'2026-10-01',dueDate:'2026-10-31',items:[{description:'Labor',quantity:1,unit_price:20,timeEntryIds:[id.time]}]});assert.equal(response.status,400);assert.equal((await query('SELECT count(*) n FROM invoices')).rows[0].n,before);
});
test('invoice line and date validation rejects duplicate links and non-finite amounts',()=>{
 assert.equal(validateInvoiceLines([{description:'Parts',quantity:3,unit_price:.1}]).subtotal,.3);
 assert.throws(()=>validateInvoiceLines([{description:'Bad',quantity:1,unit_price:Infinity}]));
 assert.throws(()=>validateInvoiceLines([{description:'Labor',quantity:1,unit_price:1,timeEntryIds:[id.time,id.time]}]));
 assert.throws(()=>validateInvoiceHeader('2026-02-30','2026-03-01',5));
});

test('invoice creation retries reuse the draft and reject changed payloads',async()=>{const body={requestKey:'test-invoice-retry-1',issueDate:'2026-10-01',dueDate:'2026-10-31',items:[{description:'Supplies',quantity:2,unit_price:10}]};const first=await request('/invoices',id.boss,'POST',body);assert.equal(first.status,201,first.data);const repeated=await request('/invoices',id.boss,'POST',body);assert.equal(repeated.status,200,repeated.data);assert.equal(JSON.parse(first.data).invoice.id,JSON.parse(repeated.data).invoice.id);assert.equal((await request('/invoices',id.boss,'POST',{...body,notes:'Changed after creation'})).status,409);});
