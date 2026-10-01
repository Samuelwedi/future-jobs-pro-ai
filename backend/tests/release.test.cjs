const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs');
process.env.JWT_SECRET='release-test-key-only-do-not-deploy';
const jwt=require('jsonwebtoken');
const express=require('express');
const {resolveCalendar,validDate,validateRange}=require('../dist/services/payPeriodCalendar');
const {pool}=require('../dist/config/database');
const db=new PGlite();let server,base,resetLink,simulateResetEmailFailure=false;
const ids={company:'00000000-0000-4000-a000-000000000001',other:'00000000-0000-4000-a000-000000000002',expiredCompany:'ed1887d9-3ffd-46e4-b281-338c8ad03a66',boss:'00000000-0000-4000-a000-000000000011',worker:'00000000-0000-4000-a000-000000000012',outsider:'00000000-0000-4000-a000-000000000013',expiredUser:'00000000-0000-4000-a000-000000000014',project:'00000000-0000-4000-a000-000000000021',entry:'00000000-0000-4000-a000-000000000031'};
const query=async(sql,params)=>{const r=await db.query(sql,params);return {rows:r.rows,rowCount:r.rows.length || r.affectedRows || 0};};
const token=(id)=>jwt.sign({id},process.env.JWT_SECRET,{expiresIn:'1h'});
const request=async(path,user=ids.boss,method='GET',body)=>{
 const r=await fetch(base+'/api'+path,{method,headers:{...(user?{Authorization:'Bearer '+token(user)}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:r.status,data};
};
before(async()=>{
 await db.exec(`
	 CREATE TABLE companies(id uuid primary key default gen_random_uuid(),name text,payroll_schedule text,timezone text default 'UTC',overtime_multiplier numeric default 1.5);
	 CREATE TABLE users(id uuid primary key default gen_random_uuid(),company_id uuid,role text,is_active boolean default true,first_name text,last_name text,full_name text,email text,vacation_pay_rate numeric default 4,vacation_pay_method text default 'accrue',vacation_pay_balance numeric default 0,last_login timestamptz);
 CREATE TABLE projects(id uuid primary key,company_id uuid,name text,client_name text,address text,status text);
 CREATE TABLE time_entries(id uuid primary key,user_id uuid,project_id uuid,clock_in timestamptz,clock_out timestamptz,break_minutes integer default 0,regular_hours numeric,overtime_hours numeric,total_wage numeric,approval_status text,status text,payroll_locked_at timestamptz);
 CREATE TABLE tasks(id uuid primary key default gen_random_uuid(),company_id uuid,assigned_to uuid,description text,status text,created_at timestamptz default now());
 CREATE TABLE pto_requests(id uuid primary key default gen_random_uuid(),company_id uuid,user_id uuid,start_date date,end_date date,type text,status text,created_at timestamptz default now());
 CREATE TABLE payrolls(id uuid primary key default gen_random_uuid(),company_id uuid,period_start date,period_end date,total_hours numeric,total_pay numeric,created_by uuid,status text,created_at timestamptz default now(),updated_at timestamptz default now(),notes text);
 CREATE TABLE payroll_items(id uuid primary key default gen_random_uuid(),payroll_id uuid references payrolls(id) on delete cascade,employee_id uuid,hours numeric,hourly_rate numeric,adjustments numeric,cpp_deduction numeric,ei_deduction numeric,tax_deduction numeric,timesheet_ids uuid[],vacation_hours numeric,banked_hours numeric,vacation_pay numeric);
 CREATE TABLE compensation_history(id uuid default gen_random_uuid(),user_id uuid,hourly_rate numeric,effective_date date,created_at timestamptz default now());
 CREATE TABLE approvals(id uuid primary key default gen_random_uuid(),user_id uuid,action_type text,action_payload jsonb,status text,created_at timestamptz default now(),resolved_at timestamptz);
 CREATE TABLE lucy_conversations(id uuid default gen_random_uuid(),user_id uuid,role text,content text,created_at timestamptz default now());
 ALTER TABLE users ADD COLUMN password_hash text; ALTER TABLE users ADD COLUMN must_change_password boolean default false; ALTER TABLE users ADD COLUMN updated_at timestamptz default now();
 CREATE TABLE attachments(id uuid primary key,company_id uuid,uploaded_by uuid,file_url text);
 CREATE TABLE shifts(id uuid primary key,created_by uuid,date date,start_time time,end_time time,name text);
	 CREATE TABLE shift_assignments(shift_id uuid NOT NULL,user_id uuid NOT NULL,assigned_at timestamptz default now(),PRIMARY KEY(shift_id,user_id));
 CREATE TABLE invoices(id uuid primary key,company_id uuid,project_id uuid,invoice_number text,issue_date date,due_date date,subtotal numeric,tax_rate numeric,notes text,created_by uuid,status text);
 CREATE TABLE invoice_items(id uuid default gen_random_uuid(),invoice_id uuid,description text,quantity numeric,unit_price numeric,time_entry_ids uuid[]);
 CREATE TABLE payments(id uuid primary key,invoice_id uuid);

 `);
	 await db.exec(fs.readFileSync(require('path').join(__dirname,'../migrations/20260922_shift_assignment_identity.sql'),'utf8'));
	 await db.exec(fs.readFileSync(require('path').join(__dirname,'../migrations/20260922_shift_assignment_identity.sql'),'utf8'));
	 await db.exec(fs.readFileSync(require('path').join(__dirname,'../migrations/20260923_command_center.sql'),'utf8'));
 await db.exec(fs.readFileSync(require('path').join(__dirname,'../migrations/20260923_command_center.sql'),'utf8'));
 await db.exec(fs.readFileSync(require('path').join(__dirname,'../migrations/20260924_operations.sql'),'utf8'));
	 await db.exec(fs.readFileSync(require('path').join(__dirname,'../migrations/20260924_operations.sql'),'utf8'));
	 await db.exec(fs.readFileSync(require('path').join(__dirname,'../migrations/20260925_subscription_enforcement.sql'),'utf8'));
	 await db.exec(fs.readFileSync(require('path').join(__dirname,'../migrations/20260925_subscription_enforcement.sql'),'utf8'));
	 await query("INSERT INTO companies(id,name,payroll_schedule,subscription_status,subscription_tier,subscription_current_period_end) VALUES($1,'Test Company','monthly','active','professional',now()+interval '30 days'),($2,'Other Company','monthly','active','professional',now()+interval '30 days'),($3,'Expired Company','monthly','inactive','trial',now()-interval '1 day')",[ids.company,ids.other,ids.expiredCompany]);
	 for(const [id,company,role,name] of [[ids.boss,ids.company,'boss','Manager'],[ids.worker,ids.company,'employee','Employee'],[ids.outsider,ids.other,'boss','Other'],[ids.expiredUser,ids.expiredCompany,'boss','Expired']])await query('INSERT INTO users(id,company_id,role,first_name,last_name,full_name,email) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,company,role,name,'Test',name+' Test',name+'@example.test']);
 await query("INSERT INTO projects(id,company_id,name,status) VALUES($1,$2,'North site','active')",[ids.project,ids.company]);
 await query("INSERT INTO time_entries(id,user_id,project_id,clock_in,clock_out,regular_hours,overtime_hours,total_wage,approval_status,status) VALUES($1,$2,$3,$4::timestamptz,$5::timestamptz,8,2,220,'approved','completed')",[ids.entry,ids.worker,ids.project,new Date().toISOString().slice(0,7)+'-15T01:00:00Z',new Date().toISOString().slice(0,7)+'-15T11:00:00Z']);
 await query("INSERT INTO compensation_history(user_id,hourly_rate,effective_date) VALUES($1,20,'2020-01-01')",[ids.worker]);
 await db.exec(fs.readFileSync(require('path').join(__dirname,'../migrations/20260930_payroll_rules.sql'),'utf8'));
 pool.query=query;pool.connect=async()=>({query,release(){}});
 const email=require('../dist/services/emailService');email.sendPasswordResetEmail=async(_email,link)=>{resetLink=link;if(simulateResetEmailFailure)throw new Error('Simulated SMTP outage');};
 await query('UPDATE users SET password_hash=$1',[await require('bcryptjs').hash('OldPassword123!',10)]);
	 const app=express();app.use(express.json());
	 app.use('/api',require('../dist/middleware/trialMiddleware').subscriptionGate);
	 for(const [path,file] of [['/subscriptions','subscriptionRoutes'],['/team','teamRoutes'],['/operations','operationsRoutes'],['/legacy-invoices','invoiceRouter'],['/auth','authRoutes'],['/command','commandCenterRoutes'],['/expenses','expenseRoutes'],['/lucy','lucyJarvisRoutes'],['/payroll','payrollRouter'],['/payouts','payoutRoutes'],['/gps','gpsRoutes'],['/companies','companyRoutes'],['/forms','formRoutes'],['/dispute','disputeRoutes'],['/kiosk','kioskRoutes'],['/admin','adminRoutes']])app.use('/api'+path,require('../dist/routes/'+file).default);
	 app.use('/api',(_req,res)=>res.status(404).json({success:false,message:'API endpoint not found'}));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{if(server)await new Promise(r=>server.close(r));await db.close();await pool.end();});
test('calendar uses company date across UTC midnight',()=>{
 const p=resolveCalendar({schedule:'monthly',timezone:'America/Edmonton'},'this pay period',new Date('2026-03-01T02:00:00Z'));
 assert.equal(p.start,'2026-02-01');assert.equal(p.end,'2026-02-28');
});
test('weekly configured Sunday and previous period',()=>{const p=resolveCalendar({schedule:'weekly',timezone:'UTC',weekStart:0},'previous pay period',new Date('2026-09-23'));assert.equal(p.start,'2026-09-13');assert.equal(p.end,'2026-09-19');});
test('biweekly needs explicit anchor and supports dates before anchor',()=>{assert.throws(()=>resolveCalendar({schedule:'biweekly',timezone:'UTC'}),/anchor|period start/);const p=resolveCalendar({schedule:'biweekly',timezone:'UTC',anchor:'2026-09-21'},'this pay period',new Date('2026-09-20'));assert.equal(p.start,'2026-09-07');});
test('semimonthly previous period spans year boundary',()=>{const p=resolveCalendar({schedule:'semimonthly',timezone:'UTC'},'previous pay period',new Date('2026-01-03'));assert.equal(p.start,'2025-12-16');assert.equal(p.end,'2025-12-31');});
test('calendar rejects invalid dates, timezone, reversed and ambiguous requests',()=>{assert.equal(validDate('2026-02-30'),false);assert.throws(()=>validateRange('2026-02-30','2026-03-02'));assert.throws(()=>validateRange('2026-03-02','2026-03-01'));assert.throws(()=>resolveCalendar({schedule:'weekly',timezone:'Bad/Zone'}));assert.throws(()=>resolveCalendar({schedule:'weekly',timezone:'UTC'},'sometime soon'));});
test('legacy shift assignments receive stable identity and status idempotently',async()=>{
 const columns=(await query("SELECT column_name,is_nullable FROM information_schema.columns WHERE table_name='shift_assignments'")).rows;
 assert.equal(columns.find(x=>x.column_name==='id').is_nullable,'NO');assert.equal(columns.find(x=>x.column_name==='status').is_nullable,'NO');
 const indexes=(await query("SELECT indexname FROM pg_indexes WHERE tablename='shift_assignments'")).rows.map(x=>x.indexname);
 assert.ok(indexes.includes('shift_assignments_pkey'));assert.ok(indexes.includes('ux_shift_assignments_id'));
});
test('subscription gate protects unknown and known APIs without a tenant bypass',async()=>{
 assert.equal((await request('/command/overview',ids.expiredUser)).status,402);
 assert.equal((await request('/not-a-real-route',null)).status,401);
 assert.equal((await request('/not-a-real-route',ids.boss)).status,404);
 assert.equal((await request('/auth/not-a-real-route',null)).status,404);
 const stale=jwt.sign({id:ids.boss,companyId:ids.other},process.env.JWT_SECRET,{expiresIn:'1h'});
 const response=await fetch(base+'/api/command/overview',{headers:{Authorization:'Bearer '+stale}});
 assert.equal(response.status,401);
});
test('company, form, dispute and kiosk routes reject cross-company identifiers',async()=>{
 assert.equal((await request('/companies/'+ids.other)).status,403);
 assert.equal((await request('/forms/templates/'+ids.other)).status,403);
 assert.equal((await request('/dispute/high-risk/'+ids.other)).status,403);
 assert.equal((await request('/kiosk/status/'+ids.other)).status,403);
 const previousAdminKey=process.env.ADMIN_API_KEY;
 try{
  process.env.ADMIN_API_KEY='release-test-admin-key-only-do-not-deploy';
  assert.equal((await request('/admin/companies',null)).status,403);
  delete process.env.ADMIN_API_KEY;
  assert.equal((await request('/admin/companies',null)).status,503);
 }finally{
  if(previousAdminKey===undefined)delete process.env.ADMIN_API_KEY;
  else process.env.ADMIN_API_KEY=previousAdminKey;
 }
});
test('protected routes reject missing authentication',async()=>{for(const path of ['/command/overview','/expenses','/payroll','/payouts/capabilities','/gps/active/'+ids.company])assert.equal((await request(path,null)).status,401);});
test('employee denied payroll and payouts, and other-company GPS denied',async()=>{assert.equal((await request('/payroll',ids.worker)).status,403);assert.equal((await request('/payouts/capabilities',ids.worker)).status,403);assert.equal((await request('/gps/active/'+ids.company,ids.outsider)).status,403);});
test('GPS spoofed user and project rejected, including valid zero coordinates',async()=>{assert.equal((await request('/gps/update',ids.outsider,'POST',{userId:ids.worker,timeEntryId:ids.entry,projectId:ids.project,latitude:0,longitude:0})).status,403);});
test('overview has actual totals, employee restricted rows, other company empty',async()=>{let r=await request('/command/overview');assert.equal(r.status,200);for(const section of Object.values(r.data.sections))assert.equal(section.status,'ready',JSON.stringify(section));assert.equal(r.data.payPeriod.totals.totalHours,10);r=await request('/command/overview',ids.worker);assert.equal(r.data.sections.workforce.rows.length,1);assert.equal(r.data.payPeriod,null);r=await request('/command/overview',ids.outsider);assert.equal(r.data.sections.approvals.rows.length,0);});
test('calendar settings reject employee and invalid anchor',async()=>{assert.equal((await request('/command/calendar',ids.worker,'PUT',{schedule:'weekly',timezone:'UTC',weekStart:1})).status,403);assert.equal((await request('/command/calendar',ids.boss,'PUT',{schedule:'biweekly',timezone:'UTC',weekStart:1})).status,400);});
test('expense submit, duplicate detection, tenant isolation, review and no self approval',async()=>{const body={vendor:'Hardware shop',amount:25.2,currency:'CAD',spentOn:'2026-09-22',notes:'Parts'};const a=await request('/expenses',ids.worker,'POST',body);assert.equal(a.status,201,JSON.stringify(a));assert.equal((await request('/expenses',ids.worker,'POST',body)).status,409);assert.equal((await request('/expenses',ids.outsider)).data.expenses.length,0);assert.equal((await request('/expenses/'+a.data.id+'/review',ids.outsider,'POST',{status:'approved'})).status,409);assert.equal((await request('/expenses/'+a.data.id+'/review',ids.boss,'POST',{status:'approved'})).status,200);assert.equal((await request('/expenses/'+a.data.id+'/review',ids.boss,'POST',{status:'approved'})).status,409);const own=await request('/expenses',ids.boss,'POST',body);assert.equal((await request('/expenses/'+own.data.id+'/review',ids.boss,'POST',{status:'approved'})).status,409);});
test('Lucy period export works without model credentials and is tenant scoped',async()=>{const r=await request('/lucy',ids.boss,'POST',{message:'Show this pay period'});assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.data.actions[0].type,'timesheet_report');const url=r.data.actions[0].download.url.replace('/lucy-v2','/lucy');const exportResult=await request(url);assert.equal(exportResult.status,200);assert.match(exportResult.data,/Employee Test/);const other=await request(url,ids.outsider);assert.doesNotMatch(other.data,/Employee Test/);});
test('Lucy preparation then spoken yes creates exactly one draft and leaves vacation balance unchanged',async()=>{let r=await request('/lucy',ids.boss,'POST',{message:'Prepare payroll for this pay period'});assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.data.actions[0].status,'pending');r=await request('/lucy',ids.boss,'POST',{message:'yes, run it'});assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.data.actions[0].status,'completed');const rows=await query('SELECT status,total_pay FROM payrolls');assert.equal(rows.rows.length,1);assert.equal(rows.rows[0].status,'draft');assert.equal(Number(rows.rows[0].total_pay),220);assert.equal(Number((await query('SELECT vacation_pay_balance FROM users WHERE id=$1',[ids.worker])).rows[0].vacation_pay_balance),0);r=await request('/lucy',ids.boss,'POST',{message:'yes, run it'});assert.notEqual(r.status,200);assert.equal((await query('SELECT * FROM payrolls')).rowCount,1);});
test('direct payroll duplicate request cannot pay entries twice',async()=>{const period=resolveCalendar({schedule:'monthly',timezone:'UTC'});const r=await request('/payroll/generate',ids.boss,'POST',{periodStart:period.start,periodEnd:period.end});assert.notEqual(r.status,201);assert.equal((await query('SELECT * FROM payrolls')).rowCount,1);});
test('access tokens cannot be substituted with reset tokens',()=>{const {verifyToken}=require('../dist/utils/auth');const reset=jwt.sign({userId:ids.boss,purpose:'password-reset'},process.env.JWT_SECRET);assert.throws(()=>verifyToken({headers:{authorization:'Bearer '+reset}}),/Invalid token/);});

test('QuickBooks OAuth uses fixed provider endpoints without the vulnerable SDK',async()=>{
 const previous={id:process.env.QUICKBOOKS_CLIENT_ID,secret:process.env.QUICKBOOKS_CLIENT_SECRET,redirect:process.env.QUICKBOOKS_REDIRECT_URI,fetch:global.fetch};
 process.env.QUICKBOOKS_CLIENT_ID='quickbooks-test-client';process.env.QUICKBOOKS_CLIENT_SECRET='quickbooks-test-secret';process.env.QUICKBOOKS_REDIRECT_URI='https://api.example.test/api/integrations/quickbooks/callback';
 const oauth=require('../dist/services/quickbooksOAuth');
 try{
  const authorization=new URL(oauth.createQuickBooksAuthorizationUrl('state-value'));
  assert.equal(authorization.origin,'https://appcenter.intuit.com');assert.equal(authorization.pathname,'/connect/oauth2');assert.equal(authorization.searchParams.get('client_id'),'quickbooks-test-client');assert.equal(authorization.searchParams.get('scope'),'com.intuit.quickbooks.accounting');assert.equal(authorization.searchParams.get('state'),'state-value');
  let request;global.fetch=async(url,options)=>{request={url:String(url),options};return new Response(JSON.stringify({access_token:'access-token',refresh_token:'refresh-token',expires_in:3600}),{status:200,headers:{'Content-Type':'application/json'}});};
  const tokenResponse=await oauth.exchangeQuickBooksAuthorizationCode('authorization-code');assert.equal(tokenResponse.access_token,'access-token');
  assert.equal(request.url,'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer');assert.equal(request.options.method,'POST');assert.equal(request.options.redirect,'error');assert.equal(request.options.headers.Authorization,'Basic '+Buffer.from('quickbooks-test-client:quickbooks-test-secret').toString('base64'));
  const body=new URLSearchParams(request.options.body);assert.equal(body.get('grant_type'),'authorization_code');assert.equal(body.get('code'),'authorization-code');assert.equal(body.get('redirect_uri'),process.env.QUICKBOOKS_REDIRECT_URI);
  await assert.rejects(()=>oauth.callQuickBooksApi('token','not-a-realm','query','GET'),/company ID is invalid/);
 }finally{
  global.fetch=previous.fetch;for(const [name,value] of [['QUICKBOOKS_CLIENT_ID',previous.id],['QUICKBOOKS_CLIENT_SECRET',previous.secret],['QUICKBOOKS_REDIRECT_URI',previous.redirect]]){if(value===undefined)delete process.env[name];else process.env[name]=value;}
 }
});

test('password reset link single-use and invalid tokens rejected',async()=>{
 let r=await request('/auth/forgot-password',null,'POST',{email:'Manager@example.test'});assert.equal(r.status,200);assert.ok(resetLink);const t=new URL(resetLink).searchParams.get('token');
 r=await request('/auth/reset-password',null,'POST',{token:t,newPassword:'NewPassword123!'});assert.equal(r.status,200,JSON.stringify(r));
 const changedHash=(await query('SELECT password_hash FROM users WHERE id=$1',[ids.boss])).rows[0].password_hash;assert.match(changedHash,/^\$2[aby]\$12\$/);
 r=await request('/auth/reset-password',null,'POST',{token:t,newPassword:'OtherPassword123!'});assert.equal(r.status,400);
 r=await request('/auth/reset-password',null,'POST',{token:'invalid',newPassword:'NewPassword123!'});assert.equal(r.status,400);
 const fingerprint=require('node:crypto').createHash('sha256').update(changedHash).digest('hex');
 const expired=jwt.sign({userId:ids.boss,purpose:'password-reset',fingerprint},process.env.JWT_SECRET,{expiresIn:-1,issuer:'future-jobs-pro-ai',audience:'password-reset'});
 r=await request('/auth/reset-password',null,'POST',{token:expired,newPassword:'AnotherPassword123!'});assert.equal(r.status,400);assert.match(r.data.message,/expired/i);
 r=await request('/auth/reset-password',null,'POST',{token:t,newPassword:'😀'.repeat(19)});assert.equal(r.status,400);
 simulateResetEmailFailure=true;
 try{r=await request('/auth/forgot-password',null,'POST',{email:'manager@example.test'});assert.equal(r.status,200);assert.equal(r.data.message,'If that email exists, a reset link has been sent.');}
 finally{simulateResetEmailFailure=false;}
});
test('registration creates one linked company trial atomically and exposes no test-email endpoint',async()=>{
 const email='new-owner@example.test';const r=await request('/auth/register',null,'POST',{firstName:'New',lastName:'Owner',email,password:'CorrectHorse123!'});assert.equal(r.status,201,JSON.stringify(r));
 const state=(await query(`SELECT u.company_id,c.subscription_status,c.subscription_tier,c.subscription_provider,c.subscription_current_period_end,u.trial_ends_at FROM users u JOIN companies c ON c.id=u.company_id WHERE u.email=$1`,[email])).rows[0];
 assert.equal(state.company_id,r.data.user.companyId);assert.equal(state.subscription_status,'trialing');assert.equal(state.subscription_tier,'trial');assert.equal(state.subscription_provider,'internal');assert.ok(new Date(state.subscription_current_period_end)>new Date());assert.ok(new Date(state.trial_ends_at)>new Date());
 assert.equal((await request('/auth/register',null,'POST',{firstName:'New',lastName:'Owner',email,password:'CorrectHorse123!'})).status,409);
 assert.equal((await request('/auth/test-email',null,'POST',{})).status,404);
});
test('deleting a draft unlocks its entries and removes only the company draft',async()=>{
 const draft=(await query('SELECT id FROM payrolls')).rows[0].id;
 assert.equal((await request('/payroll/'+draft,ids.outsider,'DELETE')).status,404);
 assert.equal((await request('/payroll/'+draft,ids.boss,'DELETE')).status,200);
 assert.equal((await query('SELECT * FROM payrolls')).rowCount,0);
 assert.equal((await query('SELECT payroll_locked_at FROM time_entries WHERE id=$1',[ids.entry])).rows[0].payroll_locked_at,null);
});

test('operations fail closed for anonymous, employee and unconfigured allowances',async()=>{
 assert.equal((await request('/operations/overview',null)).status,401);
 assert.equal((await request('/operations/overview',ids.worker)).status,403);
 const body={title:'Policy',body:'Wear boots.',audience:'company',requestKey:'first'};
 assert.equal((await request('/operations/documents',ids.boss,'POST',body)).status,409);
 await query('INSERT INTO ops_limits(company_id,employees,monthly_ai_requests,document_bytes) VALUES($1,10,2,500000)',[ids.company]);
 assert.equal((await request('/operations/overview')).status,200);
});
test('knowledge enforces audience, tenant scope, duplicate keys, and undo',async()=>{
 const b={title:'PPE policy',body:'Safety boots are required at every site.',audience:'company',requestKey:'doc-ppe'};
 const first=await request('/operations/documents',ids.boss,'POST',b);assert.equal(first.status,200,JSON.stringify(first));
 const repeat=await request('/operations/documents',ids.boss,'POST',b);assert.equal(repeat.status,200);assert.equal(repeat.data.actionId,first.data.actionId);
 assert.equal((await request('/operations/documents',ids.boss,'POST',{...b,title:'Different'})).status,409);
 assert.equal((await request('/operations/documents/search?q=boots',ids.worker)).data.sources.length,1);
 assert.equal((await request('/operations/documents/search?q=boots',ids.outsider)).data.sources.length,0);
 await request('/operations/documents',ids.boss,'POST',{title:'Manager procedure',body:'Manager confidential bonus review.',audience:'managers',requestKey:'doc-private'});
 assert.equal((await request('/operations/documents/search?q=bonus',ids.worker)).data.sources.length,0);
 assert.equal((await request('/operations/documents/search?q=bonus')).data.sources.length,1);
 assert.equal((await request('/operations/actions/'+first.data.actionId+'/undo',ids.outsider,'POST',{})).status,404);
 assert.equal((await request('/operations/actions/'+first.data.actionId+'/undo',ids.boss,'POST',{})).status,200);
 assert.equal((await request('/operations/documents/search?q=boots',ids.worker)).data.sources.length,0);
 assert.equal((await request('/operations/actions/'+first.data.actionId+'/undo',ids.boss,'POST',{})).status,409);
});
test('profitability computes explicit linear forecast, rejects invalid progress and foreign projects',async()=>{
 const body={revenue:1000,budget:600,progress:50,currency:'CAD',overheadPercent:10};
 assert.equal((await request('/operations/budgets/'+ids.project,ids.outsider,'PUT',body)).status,404);
 assert.equal((await request('/operations/budgets/'+ids.project,ids.boss,'PUT',{...body,progress:0})).status,400);
 assert.equal((await request('/operations/budgets/'+ids.project,ids.boss,'PUT',body)).status,200);
 const r=await request('/operations/profitability');assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.data[0].actualCost,242);assert.equal(r.data[0].forecastCost,484);assert.equal(r.data[0].forecastProfit,516);
});
test('invoice draft links approved labor, rejects stale preview, retries safely and supports draft-only undo',async()=>{
 const date=(await query('SELECT (clock_in AT TIME ZONE c.timezone)::date::text d FROM time_entries t JOIN users u ON u.id=t.user_id JOIN companies c ON c.id=u.company_id WHERE t.id=$1',[ids.entry])).rows[0].d,b={projectId:ids.project,from:date,to:date,rate:50,dueDate:date};
 const p=await request('/operations/invoices/preview',ids.boss,'POST',b);assert.equal(p.status,200,JSON.stringify(p));assert.equal(p.data.subtotal,500);
 assert.equal((await request('/operations/invoices/preview',ids.outsider,'POST',b)).status,404);
 assert.equal((await request('/operations/invoices/confirm',ids.boss,'POST',{...b,fingerprint:'stale',requestKey:'bad-invoice'})).status,409);
 const body={...b,fingerprint:p.data.fingerprint,requestKey:'invoice-1'};const r=await request('/operations/invoices/confirm',ids.boss,'POST',body);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.data.subtotal,500);
 const repeat=await request('/operations/invoices/confirm',ids.boss,'POST',body);assert.equal(repeat.data.invoiceId,r.data.invoiceId);
 assert.equal((await request('/operations/invoices/preview',ids.boss,'POST',b)).status,409);
 await query("UPDATE invoices SET status='sent' WHERE id=$1",[r.data.invoiceId]);assert.equal((await request('/operations/actions/'+r.data.actionId+'/undo',ids.boss,'POST',{})).status,409);
 await query("UPDATE invoices SET status='draft' WHERE id=$1",[r.data.invoiceId]);assert.equal((await request('/operations/actions/'+r.data.actionId+'/undo',ids.boss,'POST',{})).status,200);
 assert.equal((await query('SELECT * FROM invoice_items')).rowCount,0);
});
test('staff cover checks skills, availability, overlapping shifts and weekly limits; assignment undo',async()=>{
 const sid='00000000-0000-4000-a000-000000000099';await query("INSERT INTO shifts VALUES($1,$2,current_date+7,'09:00','17:00','Future shift')",[sid,ids.boss]);
 let r=await request('/operations/staffing/preview',ids.boss,'POST',{shiftId:sid,skills:['electrical']});assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.data.rows.find(x=>x.id===ids.worker).eligible,false);
 await request('/operations/profiles/'+ids.worker,ids.boss,'PUT',{skills:['electrical'],weeklyLimit:40});
 r=await request('/operations/staffing/preview',ids.boss,'POST',{shiftId:sid,skills:['electrical']});assert.equal(r.data.rows.find(x=>x.id===ids.worker).eligible,true);
 const assigned=await request('/operations/staffing/assign',ids.boss,'POST',{shiftId:sid,userId:ids.worker,skills:['electrical'],requestKey:'assign-1'});assert.equal(assigned.status,200,JSON.stringify(assigned));
 assert.equal((await request('/operations/actions/'+assigned.data.actionId+'/undo',ids.boss,'POST',{})).status,200);
 const next=(await query('SELECT date::text FROM shifts WHERE id=$1',[sid])).rows[0].date;
 const absent=await request('/operations/availability',ids.worker,'POST',{startsAt:next+'T08:00:00Z',endsAt:next+'T18:00:00Z'});assert.equal(absent.status,201);
 r=await request('/operations/staffing/preview',ids.boss,'POST',{shiftId:sid,skills:['electrical']});assert.equal(r.data.rows.find(x=>x.id===ids.worker).eligible,false);
 assert.equal((await request('/operations/staffing/assign',ids.boss,'POST',{shiftId:sid,userId:ids.worker,skills:[],requestKey:'assign-blocked'})).status,409);
 assert.equal((await request('/operations/staffing/preview',ids.outsider,'POST',{shiftId:sid,skills:[]})).status,404);
 await request('/operations/availability/'+absent.data.id,ids.worker,'DELETE');
 await request('/operations/profiles/'+ids.worker,ids.boss,'PUT',{skills:['electrical'],weeklyLimit:4});
 r=await request('/operations/staffing/preview',ids.boss,'POST',{shiftId:sid,skills:[]});assert.ok(r.data.rows.find(x=>x.id===ids.worker).reasons.includes('Weekly scheduled-hour limit'));
 await request('/operations/profiles/'+ids.worker,ids.boss,'PUT',{skills:['electrical'],weeklyLimit:40});
 const clash='00000000-0000-4000-a000-000000000098';await query("INSERT INTO shifts VALUES($1,$2,current_date+7,'12:00','20:00','Clashing shift')",[clash,ids.boss]);await query("INSERT INTO shift_assignments(id,shift_id,user_id,status) VALUES(gen_random_uuid(),$1,$2,'assigned')",[clash,ids.worker]);
 r=await request('/operations/staffing/preview',ids.boss,'POST',{shiftId:sid,skills:[]});assert.ok(r.data.rows.find(x=>x.id===ids.worker).reasons.includes('Overlapping shift'));
 await query('DELETE FROM shift_assignments WHERE shift_id=$1',[clash]);await query('DELETE FROM shifts WHERE id=$1',[clash]);
 await request('/operations/staffing/'+sid+'/requirements',ids.boss,'PUT',{skills:['special-certification']});
 r=await request('/operations/staffing/preview',ids.boss,'POST',{shiftId:sid,skills:[]});assert.ok(r.data.rows.find(x=>x.id===ids.worker).reasons.includes('Required skill missing'));
 await request('/operations/staffing/'+sid+'/requirements',ids.boss,'PUT',{skills:[]});
});
test('CSV invites validate, import atomically, enforce capacity and accept once without elevated role',async()=>{
 const csv='first_name,last_name,email\nNew,Worker,new@example.test';
 assert.equal((await request('/operations/imports/preview',ids.boss,'POST',{csv})).status,200);
 assert.equal((await request('/operations/imports/preview',ids.boss,'POST',{csv:csv+'\nOther,Worker,new@example.test'})).status,400);
 const r=await request('/operations/imports/commit',ids.boss,'POST',{csv});assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.data.invitations.length,1);
 assert.equal((await request('/operations/imports/commit',ids.boss,'POST',{csv})).status,409);
 const token=r.data.invitations[0].path.split('#')[1];let accepted=await request('/operations/accept-invite',null,'POST',{token,password:'Correct horse 27!'});assert.equal(accepted.status,201,JSON.stringify(accepted));
 assert.equal((await request('/operations/accept-invite',null,'POST',{token,password:'Correct horse 27!'})).status,409);
 const user=(await query('SELECT * FROM users WHERE id=$1',[accepted.data.userId])).rows[0];assert.equal(user.role,'employee');assert.equal(user.company_id,ids.company);assert.ok(user.password_hash.startsWith('$2'));
 await query('UPDATE ops_limits SET employees=3 WHERE company_id=$1',[ids.company]);assert.equal((await request('/operations/imports/commit',ids.boss,'POST',{csv:'first_name,last_name,email\nLimit,Reached,limit@example.test'})).status,409);
});
test('scheduled reports run once and stop after undo, no fake time savings',async()=>{
 const nextAt=new Date(Date.now()+3600000).toISOString();const r=await request('/operations/reports/schedule',ids.boss,'POST',{cadence:'daily',nextAt,requestKey:'schedule-1'});assert.equal(r.status,200,JSON.stringify(r));
 await query("UPDATE ops_report_schedules SET next_at=now()-interval '1 minute' WHERE id=$1",[r.data.scheduleId]);const {runDueReports}=require('../dist/services/operationsCore');assert.equal(await runDueReports(),1);assert.equal(await runDueReports(),0);
 assert.equal((await query('SELECT * FROM ops_reports')).rowCount,1);
 const body={actionId:r.data.actionId,manualSeconds:300,assistedSeconds:60,note:'Timed the same report on sample records'};assert.equal((await request('/operations/studies',ids.boss,'POST',body)).status,201);assert.equal((await request('/operations/studies',ids.boss,'POST',body)).status,409);
 assert.equal(Number((await request('/operations/overview')).data.studies.reported_seconds_saved),240);
 await request('/operations/actions/'+r.data.actionId+'/undo',ids.boss,'POST',{});await query("UPDATE ops_report_schedules SET next_at=now()-interval '1 minute'");assert.equal(await runDueReports(),0);
});
test('AI limits are atomic, receipt provider absence is explicit, site coordinates reject invalid values',async()=>{
 const {consumeAI}=require('../dist/services/operationsCore'),a={id:ids.boss,company_id:ids.company,role:'boss'};await consumeAI(a);await consumeAI(a);await assert.rejects(()=>consumeAI(a),/allowance reached/);
 assert.equal((await request('/operations/receipts/extract',ids.worker,'POST',{image:'anything'})).status,503);
 assert.equal((await request('/operations/sites/'+ids.project,ids.boss,'PUT',{latitude:95,longitude:10})).status,400);
 assert.equal((await request('/operations/sites/'+ids.project,ids.boss,'PUT',{latitude:0,longitude:0,accuracyM:20})).status,200);
 assert.equal((await request('/operations/sites/'+ids.project,ids.outsider,'PUT',{latitude:1,longitude:1})).status,404);
});

test('legacy team test-header bypass removed; foreign membership and role escalation denied',async()=>{
 const r=await fetch(base+'/api/team',{headers:{'x-test-user':'samuel@test.com'}});assert.equal(r.status,401);
 assert.equal((await request('/team/members/'+ids.other)).status,403);
 assert.equal((await request('/team/'+ids.boss+'/role',ids.worker,'PUT',{companyId:ids.company,role:'manager'})).status,403);
 assert.equal((await request('/team/'+ids.boss+'/role',ids.boss,'PUT',{companyId:ids.company,role:'manager'})).status,403);
 assert.equal((await request('/legacy-invoices',ids.worker)).status,403);
});
test('replacement request requires recipient consent and manager approval; reassignment recorded',async()=>{
 const sid='00000000-0000-4000-a000-000000000099';await query("INSERT INTO shift_assignments(id,shift_id,user_id,status) VALUES(gen_random_uuid(),$1,$2,'assigned')",[sid,ids.worker]);
 const r=await request('/operations/swaps',ids.worker,'POST',{shiftId:sid,toUser:ids.boss});assert.equal(r.status,201,JSON.stringify(r));
 assert.equal((await request('/operations/swaps/'+r.data.id+'/approve',ids.boss,'POST',{requestKey:'swap-too-soon'})).status,409);
 assert.equal((await request('/operations/swaps/'+r.data.id+'/respond',ids.outsider,'POST',{status:'accepted'})).status,409);
 assert.equal((await request('/operations/swaps/'+r.data.id+'/respond',ids.boss,'POST',{status:'accepted'})).status,200);
 assert.equal((await request('/operations/swaps/'+r.data.id+'/approve',ids.boss,'POST',{requestKey:'swap-approved'})).status,200);
 assert.equal((await query('SELECT user_id FROM shift_assignments WHERE shift_id=$1',[sid])).rows[0].user_id,ids.boss);
});

test('store billing routes reject anonymous and employee purchases before provider calls',async()=>{
 assert.equal((await request('/subscriptions/verify',null,'POST',{})).status,401);
 assert.equal((await request('/subscriptions/verify',ids.worker,'POST',{})).status,403);
 const r=await request('/subscriptions/capabilities',ids.worker);assert.equal(r.status,200);assert.equal(r.data.canPurchase,false);
});
test('store billing routes reject stale company claims',async()=>{
 const stale=jwt.sign({id:ids.boss,companyId:ids.other},process.env.JWT_SECRET,{expiresIn:'1h'});
 const r=await fetch(base+'/api/subscriptions/verify',{method:'POST',headers:{Authorization:'Bearer '+stale,'Content-Type':'application/json'},body:'{}'});
 assert.equal(r.status,401);
});

test('permanent tester grant allows only the existing authenticated identity in its company',async()=>{
 const old=process.env.COMPLIMENTARY_TESTER_IDENTITY;
 try {
  process.env.COMPLIMENTARY_TESTER_IDENTITY=`${ids.expiredUser}:${ids.expiredCompany}`;
  const allowed=await request('/unknown-tester-probe',ids.expiredUser);
  assert.equal(allowed.status,404);
  assert.equal((await request('/unknown-tester-probe',null)).status,401);
  process.env.COMPLIMENTARY_TESTER_IDENTITY=`${ids.expiredUser}:${ids.other}`;
  assert.equal((await request('/unknown-tester-probe',ids.expiredUser)).status,402);
  delete process.env.COMPLIMENTARY_TESTER_IDENTITY;
  assert.equal((await request('/unknown-tester-probe',ids.expiredUser)).status,402);
 }finally{if(old===undefined)delete process.env.COMPLIMENTARY_TESTER_IDENTITY;else process.env.COMPLIMENTARY_TESTER_IDENTITY=old;}
});
