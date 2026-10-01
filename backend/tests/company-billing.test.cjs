const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
process.env.JWT_SECRET='company-billing-local-tests-only';
process.env.DATABASE_URL='postgres://unused:unused@127.0.0.1:1/unused';
const {pool}=require('../dist/config/database');
const db=new PGlite();
const ids=Array.from({length:8},(_,i)=>`00000000-0000-4000-a000-${String(i+1).padStart(12,'0')}`);
const [company,other,boss,manager,employee,outsider,otherBoss,admin]=ids;
const query=async(sql,p)=>{const r=await db.query(sql,p);return {rows:r.rows,rowCount:r.rows.length||r.affectedRows||0};};
const previous=process.env.COMPLIMENTARY_TESTER_IDENTITY;
let server,base;
before(async()=>{
 await db.exec(`CREATE TABLE companies(id uuid primary key,name text,stripe_customer_id text,stripe_subscription_id text,stripe_trial_used_at timestamptz,is_active boolean default true,subscription_status text default 'inactive',subscription_tier text default 'trial',subscription_provider text,subscription_current_period_end timestamptz,subscription_expires_at timestamptz);
 CREATE TABLE users(id uuid primary key,company_id uuid,role text,is_active boolean default true,first_name text default 'Test',last_name text default 'User',email text);
 CREATE TABLE company_admin_audit_logs(id uuid primary key default gen_random_uuid(),company_id uuid,actor_id uuid,employee_id uuid,action text,details jsonb,created_at timestamptz default now());`);
 await query('INSERT INTO companies(id) VALUES($1),($2)',[company,other]);
 for(const [id,c,role] of [[boss,company,'boss'],[manager,company,'manager'],[employee,company,'employee'],[outsider,other,'manager'],[otherBoss,other,'boss'],[admin,company,'admin']])await query('INSERT INTO users(id,company_id,role) VALUES($1,$2,$3)',[id,c,role]);
 pool.query=query;pool.connect=async()=>({query,release(){}});
 const express=require('express');const app=express();app.use(express.json());app.use('/api/subscriptions',require('../dist/routes/subscriptionRoutes').default);
 app.use('/api/stripe',require('../dist/routes/stripeRoutes').default);
 app.use(require('../dist/middleware/trialMiddleware').subscriptionGate);app.get('/api/protected',(_q,r)=>r.json({success:true}));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{await new Promise(r=>server.close(r));await db.close();if(previous===undefined)delete process.env.COMPLIMENTARY_TESTER_IDENTITY;else process.env.COMPLIMENTARY_TESTER_IDENTITY=previous;});
async function req(path,id=employee,method='GET',body){const token=require('jsonwebtoken').sign({id},process.env.JWT_SECRET);const r=await fetch(base+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}
test('tester company access covers active boss, manager and employee; excludes other companies',async()=>{
 process.env.COMPLIMENTARY_TESTER_IDENTITY=`${boss}:${company}`;
 for(const id of [boss,manager,employee])assert.equal((await req('/api/protected',id)).status,200);
 assert.equal((await req('/api/protected',outsider)).status,402);
 assert.equal((await req('/api/subscriptions/status',employee)).body.subscription.complimentary,true);
 assert.equal((await req('/api/stripe/status',employee)).body.subscription.complimentary,true);
});
test('inactive member or sponsor cannot inherit complimentary access',async()=>{
 await query('UPDATE users SET is_active=false WHERE id=$1',[employee]);assert.equal((await req('/api/protected')).status,401);
 await query('UPDATE users SET is_active=true WHERE id=$1',[employee]);
 await query('UPDATE users SET is_active=false WHERE id=$1',[boss]);assert.equal((await req('/api/protected')).status,402);
 await query('UPDATE users SET is_active=true WHERE id=$1',[boss]);
});
test('paid company access is shared without employee billing authority',async()=>{
 delete process.env.COMPLIMENTARY_TESTER_IDENTITY;
 await query("UPDATE companies SET subscription_status='active' WHERE id=$1",[company]);
 assert.equal((await req('/api/protected')).status,200);
 const c=(await req('/api/subscriptions/capabilities')).body;assert.equal(c.entitled,true);assert.equal(c.canPurchase,false);assert.equal(c.canManageBilling,false);
});
test('employees, unapproved managers and admins are denied billing mutations',async()=>{
 for(const id of [employee,manager,admin])for(const path of ['/api/stripe/create-checkout','/api/stripe/billing-portal','/api/stripe/cancel-subscription','/api/stripe/resume-subscription','/api/subscriptions/verify'])assert.equal((await req(path,id,'POST',{plan:'team_10'})).status,403,`${id} ${path}`);
});
test('only boss can grant manager billing; employees and foreign users are rejected',async()=>{
 const grant=(actor,target)=>req(`/api/subscriptions/billing-managers/${target}`,actor,'PUT',{enabled:true});
 assert.equal((await grant(manager,manager)).status,403);assert.equal((await grant(employee,manager)).status,403);
 assert.equal((await grant(boss,employee)).status,403);assert.equal((await grant(boss,outsider)).status,403);
 assert.equal((await grant(boss,manager)).status,200);
 const c=(await req('/api/subscriptions/capabilities',manager)).body;assert.equal(c.canPurchase,true);assert.equal(c.canDelegateBilling,false);
});
test('revocation takes effect immediately and grant is auditable',async()=>{
 assert.equal((await req(`/api/subscriptions/billing-managers/${manager}`,boss,'PUT',{enabled:false})).status,200);
 assert.equal((await req('/api/subscriptions/capabilities',manager)).body.canPurchase,false);
 assert.equal((await req('/api/stripe/create-checkout',manager,'POST',{plan:'team_10'})).status,403);
 assert.equal((await query('SELECT count(*)::int n FROM company_admin_audit_logs')).rows[0].n,2);
});
test('complimentary boss and delegated manager cannot accidentally start a paid checkout',async()=>{
 process.env.COMPLIMENTARY_TESTER_IDENTITY=`${boss}:${company}`;
 assert.equal((await req('/api/subscriptions/capabilities',boss)).body.canPurchase,false);
 assert.equal((await req('/api/stripe/create-checkout',boss,'POST',{plan:'team_10'})).status,400);
 assert.equal((await req('/api/subscriptions/verify',boss,'POST',{platform:'ios'})).status,409);
});
