const {test,before,after}=require('node:test');const assert=require('node:assert/strict');const {PGlite}=require('@electric-sql/pglite');const express=require('express');const jwt=require('jsonwebtoken');
process.env.JWT_SECRET='qa-test-key-only';
const {pool}=require('../dist/config/database');const db=new PGlite();let server,base,failAssignment=false;
const ids={company:'00000000-0000-4000-a000-000000000001',other:'00000000-0000-4000-a000-000000000002',boss:'00000000-0000-4000-a000-000000000011',worker:'00000000-0000-4000-a000-000000000012',outsider:'00000000-0000-4000-a000-000000000013',project:'00000000-0000-4000-a000-000000000021'};
const query=async(sql,args)=>{if(failAssignment&&/INSERT INTO shift_assignments/.test(sql))throw Error('simulated assignment failure');const r=await db.query(sql,args);return {rows:r.rows,rowCount:r.rows.length||r.affectedRows||0};};
async function request(path,method='GET',body,user=ids.boss){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+jwt.sign({id:user},process.env.JWT_SECRET)},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
const payload=()=>({name:'QA shift',date:'2026-10-31',startTime:'09:00',endTime:'17:00',projectId:ids.project,employeeIds:[ids.worker]});
before(async()=>{
 await db.exec(`CREATE TABLE users(id uuid primary key,company_id uuid,role text);CREATE TABLE projects(id uuid primary key,company_id uuid,name text,address text);CREATE TABLE shifts(id uuid primary key default gen_random_uuid(),name text,date date,start_time time,end_time time,project_id uuid,notes text,created_by uuid,attachment_url text,attachment_type text,user_id uuid,recurring_shift_id uuid);CREATE TABLE shift_assignments(shift_id uuid references shifts(id) ON DELETE CASCADE,user_id uuid,PRIMARY KEY(shift_id,user_id));`);
 for(const [id,company,role] of [[ids.boss,ids.company,'boss'],[ids.worker,ids.company,'employee'],[ids.outsider,ids.other,'employee']])await query('INSERT INTO users VALUES($1,$2,$3)',[id,company,role]);
 await query("INSERT INTO projects VALUES($1,$2,'QA site','QA address')",[ids.project,ids.company]);pool.query=query;pool.connect=async()=>({query,release(){}});
 const app=express();app.use(express.json());app.use(require('../dist/routes/scheduleRoutes').default);server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{await new Promise(r=>server.close(r));await db.close();await pool.end();});
test('assignment failure rolls back the shift so retry cannot leave a ghost row',async()=>{
 failAssignment=true;try{const r=await request('/shifts','POST',payload());assert.equal(r.status,500);assert.equal((await query('SELECT * FROM shifts')).rowCount,0);}finally{failAssignment=false;}
});
test('assigned shift is visible on its exact calendar day and supports manager edit/delete',async()=>{
 let r=await request('/shifts','POST',payload());assert.equal(r.status,201,JSON.stringify(r));const id=r.data.shift.id;
 r=await request(`/my-shifts?userId=${ids.worker}&start=2026-10-31&end=2026-10-31`);assert.equal(r.status,200);assert.equal(r.data.shifts.length,1);assert.equal(r.data.shifts[0].date,'2026-10-31');
 r=await request('/shifts/'+id,'PUT',{...payload(),date:'2026-11-01',employeeIds:[ids.outsider]});assert.equal(r.status,403);assert.equal((await query('SELECT date::text FROM shifts WHERE id=$1',[id])).rows[0].date,'2026-10-31');
 r=await request('/shifts/'+id,'PUT',{...payload(),name:'Edited',date:'2026-11-01'});assert.equal(r.status,200,JSON.stringify(r));
 r=await request('/shifts/'+id,'DELETE');assert.equal(r.status,200);assert.equal((await query('SELECT * FROM shifts')).rowCount,0);
});

test('empty transcription is rejected instead of returning a processed blank note',()=>{
 const {requireVoiceTranscript}=require('../dist/utils/voiceTranscript');
 for(const value of ['', '  \n ',null,undefined,{}])assert.throws(()=>requireVoiceTranscript(value),/not processed/);
 assert.equal(requireVoiceTranscript('  Finished the roof  '),'Finished the roof');
});
