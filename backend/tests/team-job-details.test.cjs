const {test}=require('node:test'),assert=require('node:assert/strict'), fs=require('node:fs'),path=require('node:path'),jwt=require('jsonwebtoken');
const {PGlite}=require('@electric-sql/pglite'),express=require('express');
process.env.JWT_SECRET='fixture-job-details';process.env.TS_NODE_PROJECT=path.resolve(__dirname,'../tsconfig.json');
require('ts-node/register/transpile-only');
const {pool}=require('../src/config/database');
const uid=n=>'01010101-0101-4101-b101-'+String(n).padStart(12,'0');
const [company,other,boss,worker,manager,admin,cross,inactive]=Array.from({length:8},(_,i)=>uid(i));
const ddl=fs.readFileSync(path.join(__dirname,'../migrations/20261128_team_job_details.sql'),'utf8');
const fields=(title=null,department=null,description=null)=>({job_title:title,department,job_description:description});
test('job details compatibility and authenticated HTTP acceptance',async t=>{
 const db=new PGlite();let server;
 try {
  await db.exec(`CREATE TABLE users(id uuid primary key,company_id uuid,role text,is_active boolean,first_name text,last_name text,email text,sin text default 'fixture',created_at timestamptz default now(),department varchar(100));
   CREATE TABLE project_roster (user_id uuid,project_id text); CREATE TABLE payroll_records (user_id uuid,amount integer); CREATE TABLE chat_members (user_id uuid,room_id text);`);
  await db.query("INSERT INTO users(id,company_id,role,is_active,department) VALUES ($1,$2,'employee',true,'Field Service')",[worker,company]);
  await t.test('migration retains previous department and adds optional fields; rerun is safe',async()=>{
   await db.exec(ddl);await db.exec(ddl);
   assert.deepEqual((await db.query('SELECT job_title,department,job_description FROM users WHERE id=$1',[worker])).rows[0],fields(null,'Field Service'));
  });
  for(const [id,tenant,role,active] of [[boss,company,'boss',true],[manager,company,'manager',true],[admin,company,'admin',true],[inactive,company,'employee',false],[cross,other,'boss',true]])
   await db.query('INSERT INTO users (id,company_id,role,is_active) VALUES ($1,$2,$3,$4)',[id,tenant,role,active]);
  await db.query("INSERT INTO project_roster VALUES ($1,'project-a')",[worker]);
  await db.query("INSERT INTO payroll_records VALUES ($1,321)",[worker]);
  await db.query("INSERT INTO chat_members VALUES ($1,'room-a')",[worker]);
  const query=async(...args)=>{const r=await db.query(...args);return {...r,rowCount:r.rows.length||r.affectedRows||0};};
  pool.query=query;pool.connect=async()=>({query,release(){}});
  const app=express();app.use(express.json());app.use('/team',require('../src/routes/teamRoutes').default);
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const url='http://127.0.0.1:'+server.address().port+'/team';
  async function request(route,actor,body){
   const res=await fetch(url+route,{method:body?'PUT':'GET',headers:{authorization:'Bearer '+jwt.sign({id:actor,role:'boss'},process.env.JWT_SECRET),'content-type':'application/json'},
    ...(body?{body:JSON.stringify(body)}:{})});
   return {status:res.status,data:await res.json(),cache:res.headers.get('cache-control')};
  }
  const previous=fields(null,'Field Service'), details=fields('Manager','Field Service','Coordinates service calls.');
  const body=(actor=manager,extra={})=>({expectedActorId:actor,expectedCompanyId:company,previous,details,...extra});
  const change=(target,actor,payload)=>request('/'+target+'/job-details',actor,payload);
  await t.test('valid descriptions never modify role or legal, payroll, project and chat records',async()=>{
   const saved=await change(worker,manager,body());assert.equal(saved.status,200);
   assert.deepEqual(saved.data.details,{id:worker,...details});
   const read=await request('/members/'+company,worker);assert.equal(read.status,200);assert.equal(read.cache,'no-store');
   const row=read.data.members.find(x=>x.id===worker);assert.equal(row.role,'employee');assert.equal(row.job_title,'Manager');assert.equal('sin' in row,false);
   assert.equal((await db.query('SELECT sin FROM users WHERE id=$1',[worker])).rows[0].sin,'fixture');
   assert.equal((await db.query('SELECT project_id FROM project_roster WHERE user_id=$1',[worker])).rows[0].project_id,'project-a');
   assert.equal((await db.query('SELECT amount FROM payroll_records WHERE user_id=$1',[worker])).rows[0].amount,321);
   assert.equal((await db.query('SELECT room_id FROM chat_members WHERE user_id=$1',[worker])).rows[0].room_id,'room-a');
  });
  await t.test('idempotent retry, stale editor rejection, and independent clearing',async()=>{
   assert.equal((await change(worker,manager,body())).status,200);
   assert.equal((await change(worker,manager,body(manager,{details:{...details,department:'Shipping'}}))).status,409);
   const clear=await change(worker,manager,body(manager,{previous:details,details:{...details,job_title:''}}));
   assert.equal(clear.status,200);assert.deepEqual(clear.data.details,{id:worker,...details,job_title:null});
  });
  await t.test('tenant and current actor restrictions, privileged targets and foreign writes remain closed',async()=>{
   assert.equal((await change(worker,cross,body(cross))).status,403);
   assert.equal((await change(worker,worker,body(worker))).status,403);
   assert.equal((await change(worker,manager,body(admin))).status,403);
   assert.equal((await change(cross,manager,body())).status,404);
   assert.equal((await change(boss,admin,body(admin))).status,403);
   assert.equal((await change(manager,manager,body())).status,403);
   assert.equal((await change(inactive,boss,body(boss))).status,404);
   assert.equal((await request('/members/'+other,worker)).status,403);
  });
  await t.test('unknown role field and malformed or oversized job fields cannot write',async()=>{
   assert.equal((await change(worker,boss,body(boss,{role:'boss'}))).status,400);
   for(const title of ['a'.repeat(101), 'Bad\r\nTitle',12]){
    assert.equal((await change(worker,boss,body(boss,{details:{...details,job_title:title}}))).status,400);
   }
  });
 } finally {if(server) await new Promise(r=>server.close(r)); await db.close(); await pool.end();}
});
test('migration supports absent department and rejects incompatible department without type conversion',async()=>{
 for(const type of ['',',department integer',',department varchar(40)']){
  const db=new PGlite();try {
   await db.exec('CREATE TABLE users(id uuid primary key'+type+')');
   if(type) await assert.rejects(db.exec(ddl),/incompatible/);
   else {await db.exec(ddl);assert.equal((await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='department'")).rows.length,1);}
  }finally{await db.close();}
 }
});
