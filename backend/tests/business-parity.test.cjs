const {test,before,after}=require('node:test');const assert=require('node:assert/strict');const {PGlite}=require('@electric-sql/pglite');const fs=require('node:fs');
process.env.JWT_SECRET='business-parity-test-only';const jwt=require('jsonwebtoken');const express=require('express');const {pool}=require('../dist/config/database');const {validateInvoiceLines,validateInvoiceHeader}=require('../dist/services/invoiceValidation');
const db=new PGlite();let server,base,integrationCompany,failLine=false,failEstimate=false,failPayment=false,smtp=false;
const id={company:'00000000-0000-4000-a000-000000000001',other:'00000000-0000-4000-a000-000000000002',boss:'00000000-0000-4000-a000-000000000011',worker:'00000000-0000-4000-a000-000000000012',inactive:'00000000-0000-4000-a000-000000000013',foreign:'00000000-0000-4000-a000-000000000014',payroll:'00000000-0000-4000-a000-000000000021',otherPayroll:'00000000-0000-4000-a000-000000000022',invoice:'00000000-0000-4000-a000-000000000031',project:'00000000-0000-4000-a000-000000000041',time:'00000000-0000-4000-a000-000000000051'};
const query=async(sql,args)=>{if(failPayment&&sql.startsWith('UPDATE invoices SET paid_amount'))throw Error('Injected payment update failure');if(failEstimate&&sql.startsWith('INSERT INTO estimate_items'))throw Error('Injected estimate line failure');if(failLine&&sql.startsWith('INSERT INTO invoice_items'))throw Error('Injected item write failure');const result=await db.query(sql,args);return{rows:result.rows,rowCount:result.rows.length||result.affectedRows||0};};
before(async()=>{
 await db.exec(`CREATE TABLE companies(id uuid primary key);INSERT INTO companies VALUES('${id.company}'),('${id.other}');CREATE TABLE users(id uuid primary key,company_id uuid,role text,is_active boolean default true,first_name text,last_name text);CREATE TABLE projects(id uuid primary key,company_id uuid,client_id uuid,name text);
 CREATE TABLE payrolls(id uuid primary key,company_id uuid,period_start date,period_end date,status text);CREATE TABLE payroll_items(id uuid primary key,payroll_id uuid,employee_id uuid,hours numeric,hourly_rate numeric,adjustments numeric,cpp_deduction numeric,ei_deduction numeric,tax_deduction numeric,calculation_snapshot jsonb);
 CREATE TABLE invoices(id uuid primary key default gen_random_uuid(),company_id uuid,project_id uuid,client_id uuid,issue_date date,due_date date,tax_rate numeric,subtotal numeric,notes text,client_notes text,created_by uuid,is_recurring boolean,recurring_frequency text,recurring_end_date date,status text default 'draft');CREATE TABLE invoice_items(id uuid default gen_random_uuid(),invoice_id uuid,description text,quantity numeric,unit_price numeric,time_entry_ids uuid[]);CREATE TABLE payments(id uuid,invoice_id uuid);CREATE TABLE time_entries(id uuid,user_id uuid,project_id uuid,approval_status text,clock_out timestamptz);
 INSERT INTO users VALUES('${id.boss}','${id.company}','boss',true,'Owner','Test'),('${id.worker}','${id.company}','employee',true,'=PAYLOAD','Employee'),('${id.inactive}','${id.company}','boss',false,'Inactive','User'),('${id.foreign}','${id.other}','boss',true,'Foreign','Employee');
 INSERT INTO payrolls VALUES('${id.payroll}','${id.company}','2026-10-01','2026-10-31','draft'),('${id.otherPayroll}','${id.other}','2026-10-01','2026-10-31','draft');INSERT INTO payroll_items VALUES(gen_random_uuid(),'${id.payroll}','${id.worker}',10,20,0,0,0,0,NULL),(gen_random_uuid(),'${id.otherPayroll}','${id.foreign}',99,99,0,0,0,0,NULL);
 INSERT INTO invoices(id,company_id,issue_date,due_date,tax_rate,subtotal,notes) VALUES('${id.invoice}','${id.company}','2026-10-01','2026-10-31',5,20,'Original');INSERT INTO invoice_items(invoice_id,description,quantity,unit_price,time_entry_ids) VALUES('${id.invoice}','Original',1,20,'{}');`);
 await db.exec(fs.readFileSync('migrations/20261031_invoice_request_keys.sql','utf8'));
 await db.exec(`CREATE TABLE estimates(id uuid primary key default gen_random_uuid(),company_id uuid,project_id uuid,client_id uuid,estimate_number text,issue_date date,expiry_date date,status text default 'draft',subtotal numeric,tax_rate numeric,notes text,client_notes text,created_by uuid,sent_at timestamptz,accepted_at timestamptz,updated_at timestamptz,converted_to_invoice_id uuid);
 CREATE TABLE estimate_items(id uuid primary key default gen_random_uuid(),estimate_id uuid REFERENCES estimates(id) ON DELETE CASCADE,description text,quantity numeric,unit_price numeric);
 CREATE TABLE company_payroll_rule_versions(company_id uuid,rules jsonb,revision integer);
 ALTER TABLE companies ADD COLUMN name text;ALTER TABLE users ADD COLUMN employment_type text;ALTER TABLE users ADD COLUMN province text;
 CREATE TABLE generated_t4_slips(id uuid default gen_random_uuid(),employee_id uuid,tax_year integer,generated_at timestamptz default now(),box_14_employment_income numeric,box_16_cpp_withheld numeric,box_18_ei_withheld numeric,box_22_income_tax_withheld numeric,box_24_insurable_earnings numeric,box_26_pensionable_earnings numeric,employer_cpp_matching numeric,employer_ei_matching numeric,UNIQUE(employee_id,tax_year));
 CREATE TABLE generated_t4a_slips(id uuid,employee_id uuid,tax_year integer,generated_at timestamptz);CREATE TABLE generated_rl1_slips(id uuid,employee_id uuid,tax_year integer,generated_at timestamptz);`);
 await db.exec(fs.readFileSync('migrations/20261101_estimate_request_keys.sql','utf8'));
 await db.exec(`ALTER TABLE invoices ADD COLUMN paid_amount numeric default 0;ALTER TABLE invoices ADD COLUMN total numeric GENERATED ALWAYS AS (subtotal*(1+COALESCE(tax_rate,0)/100)) STORED;ALTER TABLE invoices ADD COLUMN paid_at timestamptz;ALTER TABLE invoices ADD COLUMN sent_at timestamptz;
 ALTER TABLE payments ALTER COLUMN id SET DEFAULT gen_random_uuid();ALTER TABLE payments ADD COLUMN amount numeric;ALTER TABLE payments ADD COLUMN payment_date date;ALTER TABLE payments ADD COLUMN method text;ALTER TABLE payments ADD COLUMN reference text;ALTER TABLE payments ADD COLUMN notes text;
 CREATE FUNCTION payment_sum() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN UPDATE invoices SET paid_amount=(SELECT COALESCE(SUM(amount),0) FROM payments WHERE invoice_id=NEW.invoice_id) WHERE id=NEW.invoice_id;RETURN NEW;END;$$;CREATE TRIGGER payment_sum_trigger AFTER INSERT ON payments FOR EACH ROW EXECUTE FUNCTION payment_sum();`);
 await db.exec(fs.readFileSync('migrations/20261101_invoice_payment_keys.sql','utf8'));
 await db.exec(`ALTER TABLE companies ADD COLUMN timezone text default 'UTC';ALTER TABLE invoices ADD COLUMN invoice_number text;`);
 await db.exec(fs.readFileSync('migrations/20261102_commercial_billing.sql','utf8'));
 await db.exec(fs.readFileSync('migrations/20261102_commercial_delivery.sql','utf8'));
 await db.exec(`ALTER TABLE users ADD COLUMN email text;UPDATE users SET email='client@example.test';`);



 require('../dist/services/yearEndService').compileT4Slip=async()=>({t4Manifest:{box14_employment_income:100,box16_cpp_withheld:5,box18_ei_withheld:2,box22_income_tax_withheld:10,box24_insurable_earnings:100,box26_pensionable_earnings:100},employerMetrics:{employer_cpp_matching:5,employer_ei_matching:2.8}});

 pool.query=query;pool.connect=async()=>({query,release(){}});
 require('../dist/services/emailService').commercialMailAvailable=()=>smtp;
 require('../dist/middleware/trialMiddleware').loadSubscriptionActor=async()=>({subscriptionStatus:'active',entitlementEndsAt:null});

 require('../dist/services/integrationService').getIntegrationStatus=async company=>{integrationCompany=company;return{quickbooks:{connected:false},stripe:{connected:false}};};
 const app=express();app.use(express.json());app.use('/api/integrations',require('../dist/routes/integrationRoutes').default);app.use('/api/reports',require('../dist/routes/reportRoutes').default);app.use('/api/payroll/export',require('../dist/routes/payrollExportRoutes').default);app.use('/api/invoices',require('../dist/routes/invoiceRouter').default);app.use('/api/estimates',require('../dist/routes/estimateRouter').default);app.use('/api/year-end',require('../dist/routes/yearEndRouter').default);app.use('/api/evidence-bundles',require('../dist/routes/evidenceBundleRoutes').default);
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

const estimateBody={issueDate:'2026-10-01',expiryDate:'2026-10-31',taxRate:5,items:[{description:'Scope',quantity:3,unit_price:.1}]};let estimateId;
test('estimates and financial archives reject employees and inactive accounts',async()=>{for(const path of ['/estimates','/year-end/finalized','/evidence-bundles/recent']){assert.equal((await request(path,id.worker)).status,403,path);assert.equal((await request(path,id.inactive)).status,401,path);}});
test('estimate creation is atomic, retry-safe and rejects foreign relationships',async()=>{
 failEstimate=true;assert.equal((await request('/estimates',id.boss,'POST',estimateBody)).status,400);failEstimate=false;assert.equal((await query('SELECT count(*) n FROM estimates')).rows[0].n,0);
 assert.equal((await request('/estimates',id.boss,'POST',{...estimateBody,clientId:id.foreign})).status,404);
 const body={...estimateBody,requestKey:'estimate-retry-key-1'};const first=await request('/estimates',id.boss,'POST',body);assert.equal(first.status,201,first.data);estimateId=JSON.parse(first.data).estimate.id;
 const again=await request('/estimates',id.boss,'POST',body);assert.equal(again.status,200);assert.equal(JSON.parse(again.data).estimate.id,estimateId);assert.equal((await request('/estimates',id.boss,'POST',{...body,notes:'Changed'})).status,409);assert.equal((await request('/estimates/'+estimateId,id.foreign)).status,404);
});
test('estimate edits preserve original lines after failure and enforce lifecycle',async()=>{
 failEstimate=true;assert.equal((await request('/estimates/'+estimateId,id.boss,'PUT',{...estimateBody,items:[{description:'New',quantity:1,unit_price:8}]})).status,400);failEstimate=false;
 assert.equal((await query('SELECT description FROM estimate_items WHERE estimate_id=$1',[estimateId])).rows[0].description,'Scope');assert.equal((await request('/estimates/'+estimateId,id.boss,'PUT',estimateBody)).status,200);
 assert.equal((await request('/estimates/'+estimateId+'/convert',id.boss,'POST',{})).status,409);assert.equal((await request('/estimates/'+estimateId+'/send',id.boss,'POST',{})).status,200);assert.equal((await request('/estimates/'+estimateId,id.boss,'PUT',estimateBody)).status,409);assert.equal((await request('/estimates/'+estimateId+'/accept',id.boss,'POST',{})).status,200);
});
test('conversion rollback retains accepted estimate; retries return one invoice',async()=>{
 const count=(await query('SELECT count(*) n FROM invoices')).rows[0].n;
 failLine=true;assert.equal((await request('/estimates/'+estimateId+'/convert',id.boss,'POST',{invoiceDate:'2026-10-31',dueDate:'2026-11-30'})).status,400);failLine=false;assert.equal((await query('SELECT count(*) n FROM invoices')).rows[0].n,count);assert.equal((await query('SELECT status FROM estimates WHERE id=$1',[estimateId])).rows[0].status,'accepted');
 const first=await request('/estimates/'+estimateId+'/convert',id.boss,'POST',{invoiceDate:'2026-10-31',dueDate:'2026-11-30'});assert.equal(first.status,200,first.data);const again=await request('/estimates/'+estimateId+'/convert',id.boss,'POST',{});assert.equal(again.status,200);assert.equal(JSON.parse(again.data).invoice.id,JSON.parse(first.data).invoice.id);assert.equal(JSON.parse(again.data).replayed,true);assert.equal((await query('SELECT count(*) n FROM invoices')).rows[0].n,count+1);
});
test('year-end finalization requires reviewed values and archive is company scoped',async()=>{
 const preview=await request('/year-end/preview?employeeId='+id.worker+'&taxYear=2026&formType=T4');assert.equal(preview.status,200,preview.data);const body={employeeId:id.worker,taxYear:2026,formType:'T4'};
 assert.equal((await request('/year-end/finalize',id.boss,'POST',body)).status,409);assert.equal((await request('/year-end/finalize',id.boss,'POST',{...body,previewHash:'stale'})).status,409);const saved=await request('/year-end/finalize',id.boss,'POST',{...body,previewHash:JSON.parse(preview.data).previewHash});assert.equal(saved.status,200,saved.data);
 assert.equal(JSON.parse((await request('/year-end/finalized?taxYear=2026')).data).slips.length,1);assert.equal(JSON.parse((await request('/year-end/finalized?taxYear=2026',id.foreign)).data).slips.length,0);
});

test('external invoice payments roll back, replay safely and never double-count trigger updates',async()=>{
 const created=await request('/invoices',id.boss,'POST',{issueDate:'2026-10-01',dueDate:'2026-10-31',items:[{description:'Service',quantity:1,unit_price:100}]});const invoiceId=JSON.parse(created.data).invoice.id;
 assert.equal((await request('/invoices/'+invoiceId+'/send',id.boss,'POST',{})).status,200);
 const path='/invoices/'+invoiceId+'/payments',body={requestKey:'payment-retry-fixture-1',confirmed:true,amount:50,paymentDate:'2026-10-31',method:'bank_transfer',reference:'BANK-TEST-ONLY'};
 failPayment=true;assert.equal((await request(path,id.boss,'POST',body)).status,400);failPayment=false;assert.equal((await query('SELECT count(*) n FROM payments WHERE invoice_id=$1',[invoiceId])).rows[0].n,0);
 const first=await request(path,id.boss,'POST',body);assert.equal(first.status,200,first.data);assert.equal(JSON.parse(first.data).invoice.status,'sent');assert.equal(Number(JSON.parse(first.data).invoice.paid_amount),50);
 assert.equal(JSON.parse((await request(path,id.boss,'POST',body)).data).replayed,true);
 assert.equal((await request(path,id.boss,'POST',{...body,amount:51})).status,409);
 assert.equal((await request(path,id.boss,'POST',{...body,requestKey:'payment-too-large-1',amount:51})).status,400);
 const last=await request(path,id.boss,'POST',{...body,requestKey:'payment-final-fixture-1'});assert.equal(last.status,200,last.data);assert.equal(JSON.parse(last.data).invoice.status,'paid');assert.equal(Number(JSON.parse(last.data).invoice.paid_amount),100);
 assert.equal((await request('/invoices/'+invoiceId+'/send',id.boss,'POST',{})).status,409);assert.equal((await request(path,id.foreign,'POST',body)).status,404);
});

test('invoice and estimate PDFs emit binary documents and exclude foreign companies',async()=>{for(const path of ['/estimates/'+estimateId+'/pdf','/invoices/'+id.invoice+'/pdf']){const pdf=await request(path);assert.equal(pdf.status,200,pdf.data);assert.ok(pdf.data.startsWith('%PDF-'));assert.equal((await request(path,id.foreign)).status,404);assert.equal((await request(path,id.worker)).status,403);}});

test('recurrence keeps calendar anchors and company-local billing dates',()=>{
 const {recurringDate,localBillingDay}=require('../dist/services/invoicePlanService');
 assert.equal(recurringDate('2024-01-31','monthly',1),'2024-02-29');assert.equal(recurringDate('2024-01-31','monthly',2),'2024-03-31');assert.equal(recurringDate('2026-11-30','quarterly',1),'2027-02-28');assert.equal(recurringDate('2026-12-28','weekly',1),'2027-01-04');
 assert.equal(localBillingDay('Pacific/Kiritimati',new Date('2026-10-31T12:00:00Z')),'2026-11-01');assert.throws(()=>recurringDate('2026-02-30','monthly',1));
});
test('recurring drafts reject early generation and replay the same occurrence after advancement',async()=>{
 const created=await request('/invoices',id.boss,'POST',{issueDate:'2024-01-31',dueDate:'2024-02-10',taxRate:0,isRecurring:true,recurringFrequency:'monthly',recurringEndDate:'2024-03-31',items:[{description:'Monthly service',quantity:1,unit_price:100}]});assert.equal(created.status,201,created.data);const root=JSON.parse(created.data).invoice.id;
 const {generateRecurring}=require('../dist/services/invoicePlanService');assert.equal((await request('/invoices/'+root+'/send',id.boss,'POST',{})).status,200);
 const early=await generateRecurring(id.company,root,1,id.boss,new Date('2024-02-28T12:00Z'));assert.equal(early.pending,true);
 failLine=true;await assert.rejects(generateRecurring(id.company,root,1,id.boss,new Date('2024-02-29T12:00Z')));failLine=false;assert.equal((await query('SELECT recurring_next_index FROM invoices WHERE id=$1',[root])).rows[0].recurring_next_index,1);
 const first=await generateRecurring(id.company,root,1,id.boss,new Date('2024-02-29T12:00Z'));assert.equal(new Date(first.invoice.issue_date).toISOString().slice(0,10),'2024-02-29');assert.equal(new Date(first.invoice.due_date).toISOString().slice(0,10),'2024-03-10');assert.equal(first.invoice.status,'draft');
 const replay=await generateRecurring(id.company,root,1,id.boss,new Date('2024-03-31T12:00Z'));assert.equal(replay.invoice.id,first.invoice.id);assert.equal(replay.replayed,true);
 const second=await generateRecurring(id.company,root,2,id.boss,new Date('2024-03-31T12:00Z'));assert.equal(new Date(second.invoice.issue_date).toISOString().slice(0,10),'2024-03-31');
 assert.equal((await generateRecurring(id.company,root,3,id.boss,new Date('2024-05-01T12:00Z'))).ended,true);
 assert.equal((await request('/invoices/'+root+'/billing-plan',id.foreign)).status,404);
});
test('milestones enforce contract subtotal and allocation and block issuing or editing the parent',async()=>{
 const base={issueDate:'2026-10-01',dueDate:'2026-10-31',taxRate:0,items:[{description:'Contract',quantity:1,unit_price:1000}]};const parent=JSON.parse((await request('/invoices',id.boss,'POST',base)).data).invoice.id;
 const body={...base,parent_invoice_id:parent,milestone_name:'Deposit',milestone_percentage:30,items:[{description:'Deposit',quantity:1,unit_price:300}]};const first=await request('/invoices',id.boss,'POST',body);assert.equal(first.status,201,first.data);
 assert.equal((await request('/invoices',id.boss,'POST',{...body,milestone_percentage:80,items:[{description:'Too much',quantity:1,unit_price:800}]})).status,400);
 assert.equal((await request('/invoices',id.boss,'POST',{...body,items:[{description:'Wrong amount',quantity:1,unit_price:200}]})).status,400);
 assert.equal((await request('/invoices/'+parent+'/send',id.boss,'POST',{})).status,409);assert.equal((await request('/invoices/'+parent,id.boss,'PUT',base)).status,400);
 const remaining=await request('/invoices',id.boss,'POST',{...body,milestone_name:'Completion',milestone_percentage:70,items:[{description:'Completion',quantity:1,unit_price:700}]});assert.equal(remaining.status,201,remaining.data);
 const plan=JSON.parse((await request('/invoices/'+parent+'/billing-plan')).data);assert.equal(plan.milestones.length,2);
});

async function mailFixture(){const response=await request('/invoices',id.boss,'POST',{issueDate:'2026-10-01',dueDate:'2026-10-31',clientId:id.worker,items:[{description:'Email fixture',quantity:1,unit_price:10}]});assert.equal(response.status,201,response.data);return JSON.parse(response.data).invoice.id;}
async function emailBody(path,requestKey){const options=JSON.parse((await request(path)).data);return{confirmed:true,requestKey,recipient:options.recipient,fingerprint:options.fingerprint};}
test('commercial email requires SMTP and consent, freezes pending documents and reuses one queue job',async()=>{
 const record=await mailFixture(),path='/invoices/'+record+'/email',body=await emailBody(path,'email-fixture-request-1');
 smtp=false;assert.equal((await request(path,id.boss,'POST',body)).status,503);smtp=true;
 assert.equal((await request(path,id.boss,'POST',{...body,confirmed:false})).status,400);
 const first=await request(path,id.boss,'POST',body);assert.equal(first.status,202,first.data);const job=JSON.parse(first.data).job;
 assert.equal((await request(path,id.boss,'POST',body)).status,200);assert.equal((await request(path,id.boss,'POST',{...body,requestKey:'different-key-pending'})).status,409);
 assert.equal((await request('/invoices/'+record,id.boss,'PUT',{notes:'Must not edit while queued'})).status,409);assert.equal((await request('/invoices/'+record,id.boss,'DELETE')).status,409);
 assert.equal((await request(path,id.foreign)).status,404);let sends=0;
 await require('../dist/services/commercialDeliveryService').runCommercialEmailTick(async(to,subject,text,pdf,filename,messageId)=>{sends++;assert.equal(to,'client@example.test');assert.ok(pdf.subarray(0,5).toString()==='%PDF-');assert.ok(messageId.includes(job.id));});
 assert.equal(sends,1);const latest=JSON.parse((await request(path)).data).jobs[0];assert.equal(latest.status,'sent');assert.equal((await query('SELECT status FROM invoices WHERE id=$1',[record])).rows[0].status,'sent');
 await require('../dist/services/commercialDeliveryService').runCommercialEmailTick(async()=>{sends++;});assert.equal(sends,1);
});
test('uncertain email sends do not repeat and require verified manager resolution',async()=>{
 const record=await mailFixture(),path='/invoices/'+record+'/email';const queued=await request(path,id.boss,'POST',await emailBody(path,'email-uncertain-fixture'));const job=JSON.parse(queued.data).job;let attempts=0;const service=require('../dist/services/commercialDeliveryService');
 await assert.rejects(service.runCommercialEmailTick(async()=>{attempts++;throw Error('Synthetic ambiguous SMTP response');}));
 assert.equal(JSON.parse((await request(path)).data).jobs[0].status,'uncertain');await service.runCommercialEmailTick(async()=>{attempts++;});assert.equal(attempts,1);
 assert.equal((await request(path+'/'+job.id,id.boss,'POST',{action:'resolve',delivered:false})).status,400);
 assert.equal((await request(path+'/'+job.id,id.boss,'POST',{action:'resolve',delivered:false,confirmed:true})).status,200);
 assert.equal((await request('/invoices/'+record,id.boss,'PUT',{notes:'Resolved after verification'})).status,200);
});
test('queued mail cancels when its recipient or source changes instead of sending stale records',async()=>{
 const record=await mailFixture(),path='/invoices/'+record+'/email';await request(path,id.boss,'POST',await emailBody(path,'email-changed-source'));
 await query("UPDATE users SET email='changed@example.test' WHERE id=$1",[id.worker]);let sends=0;await require('../dist/services/commercialDeliveryService').runCommercialEmailTick(async()=>{sends++;});assert.equal(sends,0);assert.equal(JSON.parse((await request(path)).data).jobs[0].status,'cancelled');await query("UPDATE users SET email='client@example.test' WHERE id=$1",[id.worker]);
});
test('stale in-progress mail becomes uncertain without an automatic retry',async()=>{
 const record=await mailFixture(),path='/invoices/'+record+'/email';const queued=await request(path,id.boss,'POST',await emailBody(path,'email-interrupted-source'));const job=JSON.parse(queued.data).job;
 await query("UPDATE commercial_delivery_jobs SET status='sending',started_at=NOW()-interval '11 minutes' WHERE id=$1",[job.id]);let sends=0;await require('../dist/services/commercialDeliveryService').runCommercialEmailTick(async()=>{sends++;});assert.equal(sends,0);assert.equal(JSON.parse((await request(path)).data).jobs[0].status,'uncertain');
 assert.equal((await request(path+'/'+job.id,id.boss,'POST',{action:'resolve',delivered:true,confirmed:true})).status,200);assert.equal((await query('SELECT status FROM invoices WHERE id=$1',[record])).rows[0].status,'sent');smtp=false;
});

test('commercial email cancels after workspace entitlement ends',async()=>{
 smtp=true;const record=await mailFixture(),path='/invoices/'+record+'/email';await request(path,id.boss,'POST',await emailBody(path,'expired-entitlement-email'));
 const middleware=require('../dist/middleware/trialMiddleware');middleware.loadSubscriptionActor=async()=>({subscriptionStatus:'trialing',entitlementEndsAt:new Date('2000-01-01')});let sends=0;
 await require('../dist/services/commercialDeliveryService').runCommercialEmailTick(async()=>{sends++;});assert.equal(sends,0);assert.equal(JSON.parse((await request(path)).data).jobs[0].status,'cancelled');middleware.loadSubscriptionActor=async()=>({subscriptionStatus:'active',entitlementEndsAt:null});smtp=false;
});

test('email confirmation is bound to the displayed recipient and financial document',async()=>{
 smtp=true;const record=await mailFixture(),path='/invoices/'+record+'/email',body=await emailBody(path,'bound-email-proof-1');
 assert.equal((await request(path,id.boss,'POST',{...body,recipient:'someoneelse@example.test'})).status,409);
 assert.equal((await request(path,id.boss,'POST',{...body,fingerprint:'stale'})).status,409);
 assert.equal((await query('SELECT count(*) n FROM commercial_delivery_jobs WHERE record_id=$1',[record])).rows[0].n,0);smtp=false;
});
