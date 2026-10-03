const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readOvertimePolicy,calculateOvertime,weekOf}=require('../dist/services/overtimePolicy');
const policy=(fields={})=>readOvertimePolicy(fields);
const shift=(id,start,hours,breaks=0)=>({id,clock_in:start,clock_out:new Date(Date.parse(start)+hours*3600000).toISOString(),break_minutes:breaks});
const week=(hours=9)=>Array.from({length:5},(_,i)=>shift(String(i),`2026-09-${21+i}T08:00:00Z`,hours));
const totals=(entries,p)=>[...calculateOvertime(entries,p).values()].reduce((t,x)=>({regular:t.regular+x.regular,overtime:t.overtime+x.overtime,total:t.total+x.total}),{regular:0,overtime:0,total:0});
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
test('weekly overtime accepts 40 and 44.5 hours across separate shifts',()=>{
 assert.deepEqual(totals(week(),policy()),{regular:40,overtime:5,total:45});
 assert.deepEqual(totals(week(),policy({overtime_threshold_hours:44.5})),{regular:44.5,overtime:.5,total:45});
});
test('daily overtime accepts 8, 10 and fractional thresholds and aggregates split shifts',()=>{
 for(const [threshold,regular,ot] of [[8,8,3],[10,10,1],[8.5,8.5,2.5]]){
  const x=totals([shift('a','2026-09-21T06:00:00Z',5),shift('b','2026-09-21T12:00:00Z',6)],policy({overtime_mode:'daily',overtime_daily_threshold_hours:threshold}));
  close(x.regular,regular);close(x.overtime,ot);
 }
});
test('combined rules pay the greater of daily or weekly overtime without duplicate hours',()=>{
 const entries=[...week(10),shift('sat','2026-09-26T08:00:00Z',10)];
 assert.deepEqual(totals(entries,policy({overtime_mode:'daily_weekly'})),{regular:40,overtime:20,total:60});
 assert.deepEqual(totals(week(),policy({overtime_mode:'daily_weekly',overtime_threshold_hours:44.5})),{regular:40,overtime:5,total:45});
 assert.deepEqual(totals(week(),policy({overtime_mode:'daily_weekly',overtime_daily_threshold_hours:10,overtime_threshold_hours:44.5})),{regular:44.5,overtime:.5,total:45});
});
test('disabled overtime and unpaid breaks conserve net hours',()=>{
 assert.deepEqual(totals(week(10),policy({overtime_enabled:false})),{regular:50,overtime:0,total:50});
 assert.deepEqual(totals([shift('x','2026-09-21T08:00:00Z',9,60)],policy({overtime_mode:'daily'})),{regular:8,overtime:0,total:8});
 assert.deepEqual(totals([shift('x','2026-09-21T08:00:00Z',1,60)],policy()),{regular:0,overtime:0,total:0});
});
test('overnight hours use local days and proportional breaks',()=>{
 const entries=[shift('night','2026-09-22T03:00:00Z',12,120),shift('day','2026-09-22T16:00:00Z',4)];
 // Edmonton: 3h before midnight, 9h after; break allocation yields 2.5h + 7.5h.
 const x=totals(entries,policy({overtime_mode:'daily',timezone:'America/Edmonton'}));
 close(x.total,14);close(x.regular,10.5);close(x.overtime,3.5);
});
test('DST spring and autumn use actual elapsed hours rather than fixed 24-hour days',()=>{
 // Historical DST dates stay valid when future timezone legislation changes.
 const p=policy({overtime_mode:'daily',timezone:'America/Edmonton'});
 assert.deepEqual(totals([shift('spring','2025-03-09T07:00:00Z',23)],p),{regular:8,overtime:15,total:23});
 assert.deepEqual(totals([shift('fall','2025-11-02T06:00:00Z',25)],p),{regular:8,overtime:17,total:25});
});
test('workweek start changes the boundary and resets weekly hours',()=>{
 assert.equal(weekOf('2026-09-27',1),'2026-09-21');assert.equal(weekOf('2026-09-27',0),'2026-09-27');
 const entries=[...week(8),shift('sun','2026-09-27T08:00:00Z',5)];
 assert.equal(totals(entries,policy()).overtime,5);
 assert.equal(totals(entries,policy({overtime_week_start:0})).overtime,0);
});
test('invalid policies, overlapping shifts and excessive breaks are rejected',()=>{
 for(const values of [{overtime_threshold_hours:0},{overtime_threshold_hours:Infinity},{overtime_threshold_hours:'44.5bad'},{overtime_daily_threshold_hours:25},{overtime_multiplier:.5},{overtime_mode:'shift'},{overtime_week_start:7},{timezone:'Not/AZone'},{overtime_enabled:'false'}])assert.throws(()=>policy(values));
 assert.throws(()=>calculateOvertime([shift('a','2026-09-21T08:00:00Z',1,90)],policy()),/Break/);
 assert.throws(()=>calculateOvertime([shift('a','2026-09-21T08:00:00Z',5),shift('b','2026-09-21T12:00:00Z',2)],policy()),/Overlapping/);
});
test('combined allocation agrees with the independent weekly total formula',()=>{
 let seed=12345;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
 for(let run=0;run<150;run++){
  const hours=Array.from({length:7},()=>Math.floor(random()*48)/4),daily=4+random()*8,weekly=20+random()*40;
  const entries=hours.map((h,i)=>shift(String(i),`2026-09-${21+i}T04:00:00Z`,h)).filter((e,i)=>hours[i]>0);
  const x=totals(entries,policy({overtime_mode:'daily_weekly',overtime_daily_threshold_hours:daily,overtime_threshold_hours:weekly}));
  const sum=hours.reduce((a,b)=>a+b,0),expected=Math.max(hours.reduce((a,b)=>a+Math.max(0,b-daily),0),sum-weekly,0);
  close(x.overtime,expected);close(x.regular+x.overtime,sum);
 }
});

test('company overtime database and API integration',async t=>{
 const {PGlite}=require('@electric-sql/pglite');const fs=require('node:fs');const path=require('node:path');
 process.env.JWT_SECRET='overtime-isolated-test-only';process.env.DATABASE_URL='postgres://unused:unused@127.0.0.1:1/unused';
 const {pool}=require('../dist/config/database');const savedQuery=pool.query,savedConnect=pool.connect;
 const db=new PGlite();const query=async(sql,args)=>{const r=await db.query(sql,args);return{rows:r.rows,rowCount:r.rows.length||r.affectedRows||0};};
 let server;
 try{
  await db.exec(`CREATE TABLE companies(id uuid PRIMARY KEY,timezone text DEFAULT 'UTC',overtime_multiplier numeric DEFAULT 1.5);
   CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid REFERENCES companies(id),role text,is_active boolean DEFAULT true,first_name text,last_name text,vacation_pay_rate numeric DEFAULT 0,vacation_pay_method text DEFAULT 'accrue');
   CREATE TABLE projects(id uuid PRIMARY KEY,name text,address text);
   CREATE TABLE compensation_history(user_id uuid,hourly_rate numeric,effective_date date,created_at timestamptz DEFAULT now());
   CREATE TABLE time_entries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES users(id),project_id uuid,clock_in timestamptz,clock_out timestamptz,break_minutes numeric DEFAULT 0,regular_hours numeric DEFAULT 0,overtime_hours numeric DEFAULT 0,total_wage numeric,approval_status text DEFAULT 'approved',status text DEFAULT 'completed',payroll_locked_at timestamptz,latitude_out numeric,longitude_out numeric,clock_out_latitude numeric,clock_out_longitude numeric,is_manual boolean,correction_reason text,updated_at timestamptz);
   CREATE TABLE time_entry_audit_logs(time_entry_id uuid,company_id uuid,actor_id uuid,action text,before_values jsonb,after_values jsonb,reason text);
   CREATE TABLE payrolls(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,period_start date,period_end date,total_hours numeric,total_pay numeric,created_by uuid,status text);
   CREATE TABLE payroll_items(payroll_id uuid,employee_id uuid,hours numeric,hourly_rate numeric,adjustments numeric,cpp_deduction numeric,ei_deduction numeric,tax_deduction numeric,timesheet_ids uuid[],vacation_hours numeric,banked_hours numeric,vacation_pay numeric);`);
  const migration=fs.readFileSync(path.join(__dirname,'../migrations/20261002_company_overtime_policy.sql'),'utf8');await db.exec(migration);await db.exec(migration);
  const c='aaaaaaaa-0000-4000-a000-000000000001',other='aaaaaaaa-0000-4000-a000-000000000002';
  const boss='bbbbbbbb-0000-4000-a000-000000000001',worker='bbbbbbbb-0000-4000-a000-000000000002',outsider='bbbbbbbb-0000-4000-a000-000000000003',manager='bbbbbbbb-0000-4000-a000-000000000004';
  await query('INSERT INTO companies(id) VALUES($1),($2)',[c,other]);
  for(const [id,company,role] of [[boss,c,'boss'],[worker,c,'employee'],[outsider,other,'boss'],[manager,c,'manager']])await query('INSERT INTO users(id,company_id,role) VALUES($1,$2,$3)',[id,company,role]);
  await query("INSERT INTO compensation_history(user_id,hourly_rate,effective_date) VALUES($1,20,'2020-01-01')",[worker]);
  pool.query=query;pool.connect=async()=>({query,release(){}});
  const express=require('express'),jwt=require('jsonwebtoken');const app=express();app.use(express.json());
  app.use('/companies',require('../dist/routes/companyRoutes').default);app.use('/time-entries',require('../dist/routes/timeEntryRoutes').default);app.use('/workforce',require('../dist/routes/workforceOperationsRoutes').default);
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
  const request=async(url,id=boss,method='GET',body)=>{const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(id?{Authorization:'Bearer '+jwt.sign({id},process.env.JWT_SECRET,{expiresIn:'1h'})}:{})},...(body?{body:JSON.stringify(body)}:{})});const txt=await r.text();let data;try{data=JSON.parse(txt);}catch{data=txt;}return{status:r.status,data};};
  const insert=async(start,hours,breaks=0)=> (await query("INSERT INTO time_entries(user_id,clock_in,clock_out,break_minutes) VALUES($1,$2,$3,$4) RETURNING id",[worker,start,new Date(Date.parse(start)+hours*3600000).toISOString(),breaks])).rows[0].id;
  const {refreshEmployeeOvertime,completeTimeEntry}=require('../dist/services/overtimeService');
  await t.test('migration runs twice and manager settings persist decimals with audit',async()=>{
   let r=await request(`/companies/${c}/settings`,manager,'PUT',{overtime_mode:'daily_weekly',overtime_threshold_hours:44.5,overtime_daily_threshold_hours:10,overtime_multiplier:2,overtime_week_start:0,timezone:'America/Edmonton',default_hourly_rate:25});
   assert.equal(r.status,200,JSON.stringify(r));r=await request(`/companies/${c}/settings`,worker);assert.equal(r.data.settings.overtime_threshold_hours,44.5);assert.equal(r.data.settings.overtime_daily_threshold_hours,10);assert.equal(r.data.settings.overtime_mode,'daily_weekly');assert.equal(r.data.settings.overtime_week_start,0);assert.equal(r.data.settings.default_hourly_rate,25);
   assert.equal((await query('SELECT * FROM company_overtime_policy_audit')).rows.length,1);
  });
  await t.test('employees, outsiders and anonymous callers cannot edit the policy',async()=>{
   for(const id of [worker,outsider,null]){const r=await request(`/companies/${c}/settings`,id,'PUT',{overtime_threshold_hours:5});assert.ok([401,403].includes(r.status));}
   assert.equal((await query('SELECT * FROM company_overtime_policy_audit')).rows.length,1);
  });
  await t.test('invalid inputs roll back without changing the policy or audit',async()=>{
   for(const body of [{overtime_threshold_hours:'44.5oops'},{overtime_threshold_hours:0},{overtime_daily_threshold_hours:25},{overtime_multiplier:null},{overtime_week_start:1.5},{timezone:'BAD'},{overtime_enabled:'false'}]){
    const r=await request(`/companies/${c}/settings`,boss,'PUT',body);assert.equal(r.status,400,JSON.stringify({body,r}));
   }
   assert.equal((await query('SELECT * FROM company_overtime_policy_audit')).rows.length,1);
  });
  await t.test('read-only timesheet and CSV agree and include the final day of the requested range',async()=>{
   await request(`/companies/${c}/settings`,boss,'PUT',{overtime_mode:'weekly',overtime_threshold_hours:44.5,overtime_multiplier:1.5,overtime_week_start:1,timezone:'UTC'});
   for(let i=0;i<5;i++)await insert(`2026-09-${21+i}T08:00:00Z`,9);
   const url=`?userId=${worker}&start=2026-09-21&end=2026-09-25`;
   const r=await request('/time-entries'+url,worker);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.data.entries.length,5);assert.equal(r.data.entries[0].overtimeHours,'0.50');assert.equal(r.data.entries[0].regularHours,'8.50');
   const csv=await request('/time-entries/export'+url,worker);assert.equal(csv.status,200);assert.match(csv.data,/9\.00,8\.50,0\.50,185\.00/);
   assert.equal(Number((await query('SELECT SUM(overtime_hours) hours FROM time_entries')).rows[0].hours),0,'GET must not change recorded rows');
  });
  await t.test('payroll recalculates weekly overtime and does not restart the week at a partial pay period',async()=>{
   const {generatePayroll}=require('../dist/services/payrollGenerator');
   const result=await generatePayroll(c,'2026-09-25','2026-09-25',boss);
   assert.equal(result.totalHours,9);assert.equal(result.totalPay,185);
   const item=(await query('SELECT * FROM payroll_items')).rows[0];assert.equal(Number(item.adjustments),5);assert.equal(Number(item.hours),9);
  });
  await t.test('locked hours remain unchanged and incompatible policy changes block payroll recalculation',async()=>{
   const before=(await query('SELECT * FROM time_entries WHERE payroll_locked_at IS NOT NULL')).rows[0];
   await request(`/companies/${c}/settings`,boss,'PUT',{overtime_threshold_hours:40});
   await assert.rejects(()=>refreshEmployeeOvertime({query},c,worker,'2026-09-21','2026-09-25'),/payroll-locked/);
   const after=(await query('SELECT * FROM time_entries WHERE id=$1',[before.id])).rows[0];assert.equal(after.regular_hours,before.regular_hours);assert.equal(after.overtime_hours,before.overtime_hours);
  });
  await t.test('corrections recalculate other shifts that share the day',async()=>{
   await query('DELETE FROM time_entries');await request(`/companies/${c}/settings`,boss,'PUT',{overtime_mode:'daily',overtime_daily_threshold_hours:8});
   const first=await insert('2026-09-21T06:00:00Z',4);const second=await insert('2026-09-21T12:00:00Z',6);
   const r=await request(`/workforce/time-entries/${first}`,boss,'PATCH',{clockIn:'2026-09-21T06:00:00Z',clockOut:'2026-09-21T11:00:00Z',breakMinutes:0,reason:'Correct original clock-out'});
   assert.equal(r.status,200,JSON.stringify(r));assert.equal(Number((await query('SELECT overtime_hours FROM time_entries WHERE id=$1',[second])).rows[0].overtime_hours),3);
   assert.equal((await query('SELECT * FROM time_entry_audit_logs')).rows.length,1);
  });
  await t.test('saving new rules recalculates unlocked hours and wages immediately',async()=>{
   await query('DELETE FROM time_entries');const id=await insert('2026-09-21T06:00:00Z',10);
   const r=await request(`/companies/${c}/settings`,boss,'PUT',{overtime_mode:'daily',overtime_daily_threshold_hours:9,overtime_multiplier:2});
   assert.equal(r.status,200,JSON.stringify(r));const entry=(await query('SELECT * FROM time_entries WHERE id=$1',[id])).rows[0];
   assert.equal(Number(entry.regular_hours),9);assert.equal(Number(entry.overtime_hours),1);assert.equal(Number(entry.total_wage),220);
   assert.equal(entry.approval_status,'needs_review','changed approved pay must be reviewed again');
  });
  await t.test('unapproved workweek entries prevent a partial payroll from overstating overtime',async()=>{
   await query('DELETE FROM time_entries');await query('DELETE FROM payrolls');
   const id=await insert('2026-09-21T08:00:00Z',9);await insert('2026-09-22T08:00:00Z',9);
   await query("UPDATE time_entries SET approval_status='needs_review' WHERE id=$1",[id]);
   await assert.rejects(()=>require('../dist/services/payrollGenerator').generatePayroll(c,'2026-09-22','2026-09-22',boss),/Approve all completed/);
   assert.equal((await query('SELECT * FROM payrolls')).rows.length,0);
  });
  await t.test('clock-out and kiosk completion use the same daily policy and subtract breaks',async()=>{
   await query('DELETE FROM time_entries');
   await request(`/companies/${c}/settings`,boss,'PUT',{overtime_mode:'daily',overtime_daily_threshold_hours:8,overtime_multiplier:1.5});
   for(const kiosk of [false,true]){
    await query('DELETE FROM time_entries');
    const id=(await query("INSERT INTO time_entries(user_id,clock_in,clock_out,break_minutes,status) VALUES($1,now()-interval '10 hours',null,60,'active') RETURNING id",[worker])).rows[0].id;
    const entry=await completeTimeEntry(c,worker,id,0,0,kiosk);
    close(Number(entry.regular_hours),8);assert.ok(Math.abs(Number(entry.overtime_hours)-1)<.01);assert.ok(Math.abs(Number(entry.total_wage)-190)<.1);assert.equal(entry.status,'completed');
   }
  });
  await t.test('a mid-period raise uses the rate effective on each shift',async()=>{
   await query('DELETE FROM time_entries');
   await request(`/companies/${c}/settings`,boss,'PUT',{overtime_mode:'weekly',overtime_threshold_hours:40,overtime_multiplier:1.5,timezone:'UTC'});
   await query("INSERT INTO compensation_history(user_id,hourly_rate,effective_date) VALUES($1,30,'2026-09-22')",[worker]);
   await insert('2026-09-21T08:00:00Z',8);
   await insert('2026-09-22T08:00:00Z',8);
   const result=await require('../dist/services/payrollGenerator').generatePayroll(c,'2026-09-21','2026-09-22',boss);
   assert.equal(result.totalPay,400);
   const item=(await query('SELECT * FROM payroll_items WHERE payroll_id=$1',[result.payrollId])).rows[0];
   assert.equal(Number(item.hourly_rate),30);
   assert.equal(Number(item.adjustments),-80);
   assert.equal(Number(item.hours)*Number(item.hourly_rate)+Number(item.adjustments),400);
  });
 }finally{if(server)await new Promise(r=>server.close(r));pool.query=savedQuery;pool.connect=savedConnect;await db.close();await pool.end();}
});
