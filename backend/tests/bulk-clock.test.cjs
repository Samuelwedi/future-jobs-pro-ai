const {test,before,after}=require('node:test');const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');const {pool}=require('../dist/config/database');
const {bulkClockIn,personalClockIn,kioskClockIn,publicKioskClockIn}=require('../dist/services/bulkClockService');
const db=new PGlite();const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let failGps=false,gpsWrites=0;const statements=[];
before(async()=>{
 await db.exec(`CREATE TABLE users(id uuid primary key,company_id uuid,role text,is_active boolean,pin text);
 CREATE TABLE companies(id uuid primary key,kiosk_enabled boolean,subscription_status text);
 CREATE TABLE projects(id uuid primary key,company_id uuid);
 CREATE TABLE time_entries(id uuid primary key default gen_random_uuid(),user_id uuid,project_id uuid,company_id uuid,clock_in_latitude numeric,clock_in_longitude numeric,clock_in timestamptz,clock_out timestamptz,latitude numeric,longitude numeric,created_at timestamptz,status text);
 CREATE TABLE gps_tracking(user_id uuid,time_entry_id uuid,project_id uuid,latitude numeric,longitude numeric,timestamp timestamptz);`);
 for(const [n,c,r,a] of [[1,10,'boss',true],[2,10,'employee',true],[3,10,'employee',true],[4,11,'employee',true],[5,10,'employee',false]])await db.query('INSERT INTO users(id,company_id,role,is_active) VALUES($1,$2,$3,$4)',[id(n),id(c),r,a]);
 await db.query("INSERT INTO companies VALUES($1,true,'active')",[id(10)]);
 await db.query("UPDATE users SET pin='1234' WHERE id=$1",[id(3)]);
 await db.query('INSERT INTO projects VALUES($1,$2),($3,$4)',[id(20),id(10),id(21),id(11)]);
 pool.connect=async()=>({query:async(sql,args)=>{statements.push(sql);if(failGps&&sql.includes('INSERT INTO gps_tracking')&&++gpsWrites===2)throw Error('GPS failed');return db.query(sql,args);},release(){}});
});
after(async()=>{await db.close();await pool.end();});
const input=(extra={})=>({userIds:[id(2),id(3)],projectId:id(20),latitude:51,longitude:-114,...extra});
test('bulk clock rejects invalid inputs and cross-company or inactive targets without writes',async()=>{
 for(const value of [input({latitude:null}),input({longitude:181}),input({userIds:['bad']}),input({userIds:[]})])await assert.rejects(bulkClockIn(id(1),value),e=>e.status===400);
 for(const value of [input({projectId:id(21)}),input({userIds:[id(2),id(4)]}),input({userIds:[id(5)]}),input({userIds:[id(99)]})])await assert.rejects(bulkClockIn(id(1),value),e=>e.status===403);
 await assert.rejects(bulkClockIn(id(2),input()),e=>e.status===403);
 assert.equal((await db.query('SELECT * FROM time_entries')).rows.length,0);
});
test('GPS failure rolls back the entire batch; retry creates one time/GPS pair per employee',async()=>{
 failGps=true;await assert.rejects(bulkClockIn(id(1),input()),/GPS failed/);failGps=false;
 assert.equal((await db.query('SELECT * FROM time_entries')).rows.length,0);
 assert.ok(statements.includes('ROLLBACK'));assert.ok(statements.some(s=>s.includes('ORDER BY id FOR UPDATE')));
 const results=await bulkClockIn(id(1),input({userIds:[id(2),id(3),id(2)]}));assert.equal(results.length,2);assert.ok(results.every(r=>r.success));
 assert.equal((await db.query('SELECT * FROM gps_tracking')).rows.length,2);
 const retry=await bulkClockIn(id(1),input());assert.ok(retry.every(r=>r.success===false));assert.equal((await db.query('SELECT * FROM time_entries')).rows.length,2);
});

test('personal clock-in shares duplicate checks and rejects foreign projects',async()=>{
 await db.exec('DELETE FROM gps_tracking;DELETE FROM time_entries');
 await assert.rejects(personalClockIn(id(2),input({projectId:id(21)})),e=>e.status===403);
 const entry=await personalClockIn(id(2),input());assert.equal(entry.user_id,id(2));
 const bulk=await bulkClockIn(id(1),input({userIds:[id(2)]}));assert.equal(bulk[0].success,false);
 await assert.rejects(personalClockIn(id(2),input()),e=>e.status===409);
});
test('kiosk checks current PIN and enablement, retains missing coordinates as unknown, and rejects repeats',async()=>{
 await assert.rejects(kioskClockIn(id(1),id(3),{...input(),pin:'wrong'}),e=>e.status===403);
 await db.query('UPDATE companies SET kiosk_enabled=false');
 await assert.rejects(kioskClockIn(id(1),id(3),{...input(),pin:'1234'}),e=>e.status===403);
 await db.query('UPDATE companies SET kiosk_enabled=true');
 const entry=await kioskClockIn(id(1),id(3),{projectId:id(20),pin:'1234'});assert.equal(entry.latitude,null);
 assert.equal((await db.query('SELECT * FROM gps_tracking WHERE user_id=$1',[id(3)])).rows.length,0);
 await assert.rejects(kioskClockIn(id(1),id(3),{projectId:id(20),pin:'1234'}),e=>e.status===409);
});

test('crew endpoints enforce authentication, manager role and company-owned shifts',async()=>{
 const express=require('express');const auth=require('../dist/utils/auth');let actor=null;
 auth.verifyToken=()=>{if(!actor)throw Error('No session');return {id:actor};};
 pool.query=(sql,args)=>db.query(sql,args);
 await db.exec('CREATE TABLE shifts(id uuid primary key,company_id uuid,project_id uuid); CREATE TABLE shift_assignments(shift_id uuid,user_id uuid);');
 await db.query('INSERT INTO shifts VALUES($1,$2,$3)',[id(30),id(11),id(21)]);
 const app=express();app.use(express.json());app.use(require('../dist/routes/crewRoutes').default);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try {
  const request=path=>fetch(`http://127.0.0.1:${server.address().port}${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({shiftId:id(30),latitude:51,longitude:-114})});
  for(const endpoint of ['/clock-in','/clock-out']) {
   actor=null;assert.equal((await request(endpoint)).status,401);
   actor=id(2);assert.equal((await request(endpoint)).status,403);
   actor=id(1);assert.equal((await request(endpoint)).status,404);
  }
 } finally {await new Promise(r=>server.close(r));}
});

test('public kiosk rechecks entitlement and PIN inside the shared clock transaction',async()=>{
 await db.exec('DELETE FROM gps_tracking; DELETE FROM time_entries');
 const request={companyId:id(10),projectId:id(20),pin:'1234'};
 await db.query("UPDATE companies SET subscription_status='inactive'");
 await assert.rejects(publicKioskClockIn(id(3),request),e=>e.status===402);
 await db.query("UPDATE companies SET subscription_status='active'");
 await assert.rejects(publicKioskClockIn(id(3),{...request,pin:'wrong'}),e=>e.status===403);
 const entry=await publicKioskClockIn(id(3),request);assert.equal(entry.company_id,id(10));
 await assert.rejects(personalClockIn(id(3),input()),e=>e.status===409);
});
