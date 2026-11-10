const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {PGlite}=require('@electric-sql/pglite'),{pool}=require('../dist/config/database'),auth=require('../dist/utils/auth');
require('../dist/services/employeeCompensation').employeeCompensation=async()=>({});
const db=new PGlite();let actor='employee',server,base,beforeWrite;
before(async()=>{
 await db.exec(`CREATE TABLE users(id text primary key,company_id text,role text,is_active boolean,email text,first_name text,last_name text,full_name text,profile_pic text,sin text,date_of_birth date,updated_at timestamp);
 INSERT INTO users(id,company_id,role,is_active,sin,date_of_birth) VALUES ('employee','c','employee',true,'123456789','1990-01-01'),('peer','c','employee',true,'987654321','1991-01-01'),('boss','c','boss',true,NULL,NULL),('manager','c','manager',true,NULL,NULL),('foreign','other','employee',true,NULL,NULL),('admin','c','admin',true,'555444333','1980-01-01'),('owner','c','owner',true,'555444333','1980-01-01');
 CREATE TABLE compensation_history(user_id text,hourly_rate numeric,effective_date date,created_at timestamp);
 CREATE TABLE company_admin_audit_logs(company_id text,actor_id text,employee_id text,action text,details jsonb);`);
 pool.query=async(sql,args)=>{if(sql.includes(' value FROM '))return {rows:[{value:0}],rowCount:1};if(sql.startsWith('UPDATE users SET sin')&&beforeWrite){const f=beforeWrite;beforeWrite=null;await f();}const r=await db.query(sql,args);return {...r,rowCount:r.rows.length||r.affectedRows||0};};
 auth.verifyToken=()=>({id:actor,companyId:'c',role:'boss'});
 const app=express();app.use(express.json());app.use('/users',require('../dist/routes/userRoutes').default);app.use('/admin',require('../dist/routes/companyAdminRoutes').default);app.use('/year-end',require('../dist/routes/yearEndRouter').default);
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{await new Promise(r=>server.close(r));await db.close();await pool.end();});
async function request(path,body,method='PUT'){const r=await fetch(base+path,{method:body===undefined?'GET':method,headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
test('directories redact sensitive fields, employee self read redacts them, cross-company denied',async()=>{
 for(const path of ['/users/company','/users/company/c']){const r=await request(path);assert.equal(r.status,200);assert.ok(r.body.users.length);for(const row of r.body.users){assert.equal('sin' in row,false);assert.equal('date_of_birth' in row,false);}}
 const self=await request('/users/me');assert.equal('sin' in self.body.user,false);assert.equal('date_of_birth' in self.body.user,false);assert.equal((await request('/users/company/other')).status,403);
});
test('only current boss and manager roles receive self and overview tax fields',async()=>{
 for(const role of ['employee','admin','owner','boss','manager']) {
  actor=role;const allowed=['boss','manager'].includes(role);
  const self=await request('/users/me');assert.equal(self.status,200);assert.equal('sin' in self.body.user,allowed);assert.equal('date_of_birth' in self.body.user,allowed);
  const updated=await request('/users/profile',{firstName:'Synthetic',lastName:'Person',sin:'',dateOfBirth:null});assert.equal(updated.status,200);assert.equal('sin' in updated.body.user,allowed);assert.equal('date_of_birth' in updated.body.user,allowed);
  const overview=await request('/admin/overview');assert.equal(overview.status,allowed?200:403);
  if(allowed) {assert.ok(overview.body.employees.length);for(const row of overview.body.employees)assert.equal('sin' in row,false);}
  else { const archive=await request('/year-end/finalized');assert.equal(archive.status,403); }
 }
 assert.equal((await db.query("SELECT sin FROM users WHERE id='employee'")).rows[0].sin,'123456789');
 assert.equal((await db.query("SELECT date_of_birth::text dob FROM users WHERE id='employee'")).rows[0].dob,'1990-01-01');
 actor='employee';
});
test('legacy self-only writes and existing admin flow preserve tenant and owner restrictions',async()=>{
 assert.equal((await request('/users/employee/tax-info',{dateOfBirth:'1990-02-01'})).status,200);
 for(const target of ['peer','foreign','missing'])assert.equal((await request(`/users/${target}/tax-info`,{sin:'111222333'})).status,403);
 actor='boss';assert.equal((await request('/users/peer/tax-info',{sin:'111222333'})).status,403);
 actor='manager';assert.equal((await request('/admin/employees/peer/tax',{sin:'111222333'},'PATCH')).status,200);
 for(const target of ['foreign','boss'])assert.equal((await request(`/admin/employees/${target}/tax`,{sin:'111222333'},'PATCH')).status,400);
 actor='employee';assert.equal((await request('/admin/employees/peer/tax',{sin:'111222333'},'PATCH')).status,400);
 assert.deepEqual((await db.query('SELECT details FROM company_admin_audit_logs')).rows,[{details:{sinReplaced:true,dateOfBirthUpdated:false}}]);
});
test('tax mutation rechecks active state and errors do not echo submitted values',async()=>{
 actor='employee';beforeWrite=()=>db.exec("UPDATE users SET is_active=false WHERE id='employee'");
 assert.equal((await request('/users/employee/tax-info',{sin:'999888777'})).status,403);
 assert.equal((await db.query("SELECT sin FROM users WHERE id='employee'")).rows[0].sin,'123456789');
 await db.exec("UPDATE users SET is_active=true WHERE id='employee'");
 const invalid=await request('/users/employee/tax-info',{dateOfBirth:'private-invalid-date'});
 assert.equal(invalid.status,500);assert.equal(JSON.stringify(invalid.body).includes('private-invalid-date'),false);
});
test('inactive self denied and rejected writes do not change target data',async()=>{
 actor='employee';await db.exec("UPDATE users SET is_active=false WHERE id='employee'");assert.equal((await request('/users/me')).status,401);assert.equal((await request('/users/employee/tax-info',{sin:'111222333'})).status,401);
 assert.equal((await db.query("SELECT sin FROM users WHERE id='foreign'")).rows[0].sin,null);
});
