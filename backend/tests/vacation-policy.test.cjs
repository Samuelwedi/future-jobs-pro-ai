const {test}=require('node:test');
const assert=require('node:assert/strict');
test('vacation policies persist validated company settings and reject unauthorized edits',async()=>{
 process.env.JWT_SECRET='overtime-isolated-test-only';process.env.DATABASE_URL='postgres://unused:unused@127.0.0.1:1/unused';
 const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();
 const {pool}=require('../dist/config/database');const oldQuery=pool.query;
 const query=async(sql,args)=>{const r=await db.query(sql,args);return {rows:r.rows,rowCount:r.rows.length||r.affectedRows||0};};
 const ids=Array.from({length:7},(_,i)=>`00000000-0000-4000-a000-${String(i+1).padStart(12,'0')}`);
 const [company,other,boss,worker,foreign,manager,inactive]=ids;let server;
 try{
  await db.exec(`CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,role text,is_active boolean DEFAULT true,first_name text,last_name text,email text,password_hash text,vacation_pay_rate numeric(5,2) DEFAULT 4,vacation_pay_method text DEFAULT 'accrue',vacation_pay_balance numeric(12,2) DEFAULT 0,vacation_hours_balance numeric(10,2) DEFAULT 0);`);
  for(const [id,c,role] of [[boss,company,'boss'],[worker,company,'employee'],[foreign,other,'employee'],[manager,company,'manager'],[inactive,company,'employee']])await query('INSERT INTO users(id,company_id,role,password_hash) VALUES($1,$2,$3,$4)',[id,c,role,'must-never-be-returned']);
  await query('UPDATE users SET is_active=false WHERE id=$1',[inactive]);pool.query=query;
  const express=require('express'),jwt=require('jsonwebtoken');const app=express();app.use(express.json());app.use('/api/workforce-operations',require('../dist/routes/workforceOperationsRoutes').default);
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const base=`http://127.0.0.1:${server.address().port}/api/workforce-operations`;
  const request=async(path,id,method='GET',body)=>fetch(base+path,{method,headers:{'Content-Type':'application/json',...(id?{Authorization:'Bearer '+jwt.sign({id},process.env.JWT_SECRET)}:{})},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal((await request('/vacation-policies',null)).status,401);
  assert.equal((await request('/vacation-policies',worker)).status,403);
  const list=await request('/vacation-policies',boss);assert.equal(list.status,200);const data=await list.json();assert.equal(data.employees.length,3);assert.ok(data.employees.every(x=>x.id!==foreign&&x.id!==inactive&&!('password_hash' in x)));
  const body={rate:6,method:'each_pay',payBalance:123.45,hoursBalance:8.5};
  assert.equal((await request(`/employees/${worker}/vacation`,worker,'PATCH',body)).status,403);
  assert.equal((await request(`/employees/${foreign}/vacation`,boss,'PATCH',body)).status,404);
  assert.equal((await request(`/employees/${inactive}/vacation`,boss,'PATCH',body)).status,404);
  for(const change of [{rate:-1},{rate:101},{rate:'6'},{method:'invalid'},{payBalance:-1},{hoursBalance:1.234},{rate:null}])assert.equal((await request(`/employees/${worker}/vacation`,boss,'PATCH',{...body,...change})).status,400);
  assert.equal((await request(`/employees/${worker}/vacation`,manager,'PATCH',body)).status,200);
  const saved=(await (await request('/vacation-policies',boss)).json()).employees.find(x=>x.id===worker);
  assert.equal(Number(saved.vacation_pay_rate),6);assert.equal(saved.vacation_pay_method,'each_pay');assert.equal(Number(saved.vacation_pay_balance),123.45);assert.equal(Number(saved.vacation_hours_balance),8.5);
  assert.equal((await request(`/employees/${worker}/vacation`,boss,'PATCH',{...body,method:'accrue',rate:4})).status,200);
  assert.equal(Number((await query('SELECT vacation_pay_balance FROM users WHERE id=$1',[foreign])).rows[0].vacation_pay_balance),0);
 }finally{if(server)await new Promise(resolve=>server.close(resolve));pool.query=oldQuery;await db.close();}
});
