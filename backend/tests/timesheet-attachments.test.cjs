const {test,before,beforeEach,after}=require('node:test');
const assert=require('node:assert/strict'),path=require('node:path');
const express=require('express'),jwt=require('jsonwebtoken');
const {PGlite}=require('@electric-sql/pglite');
process.env.TS_NODE_PROJECT=path.join(__dirname,'../tsconfig.json');process.env.JWT_SECRET='isolated-timesheet-attachment-tests';
require('ts-node/register/transpile-only');
const {pool}=require('../src/config/database');let db,server,base,attachmentReads;
pool.query=async(sql,args)=>{if(/FROM attachments/.test(sql))attachmentReads++;const r=await db.query(sql,args);return {...r,rowCount:r.rows.length||r.affectedRows||0};};
const overtime=require('../src/services/overtimeService');overtime.employeeOvertime=async()=>({policy:{timezone:'UTC'},hours:new Map()});
const ids=['00000000-0000-4000-a000-000000000001','00000000-0000-4000-a000-000000000002','00000000-0000-4000-a000-000000000003'];
before(async()=>{
 db=new PGlite();await db.exec(`CREATE TABLE users(id TEXT,company_id TEXT,role TEXT,is_active BOOLEAN);
 CREATE TABLE projects(id TEXT,name TEXT,address TEXT);
 CREATE TABLE time_entries(id UUID,user_id TEXT,project_id TEXT,clock_in TIMESTAMPTZ,clock_out TIMESTAMPTZ,payroll_locked_at TIMESTAMPTZ,regular_hours NUMERIC,overtime_hours NUMERIC,break_minutes INTEGER);
 CREATE TABLE attachments(id TEXT,company_id TEXT,time_entry_id UUID,file_name TEXT,file_url TEXT,file_type TEXT,file_size BIGINT,created_at TIMESTAMPTZ);`);
 const app=express();app.use('/time-entries',require('../src/routes/timeEntryRoutes').default);
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`;
});
beforeEach(async()=>{
 attachmentReads=0;await db.exec(`TRUNCATE users,projects,time_entries,attachments;
 INSERT INTO users VALUES ('worker','a','employee',TRUE),('other','a','employee',TRUE),('boss','a','boss',TRUE),('foreign','b','boss',TRUE),('inactive','a','boss',FALSE);
 INSERT INTO projects VALUES ('project','Fixture','Address');
 INSERT INTO time_entries(id,user_id,project_id,clock_in,clock_out) VALUES
 ('${ids[0]}','worker','project','2026-11-11T12:00:00Z','2026-11-11T20:00:00Z'),
 ('${ids[1]}','other','project','2026-11-11T12:00:00Z','2026-11-11T20:00:00Z'),
 ('${ids[2]}','worker','project','2026-10-01T12:00:00Z','2026-10-01T20:00:00Z');
 INSERT INTO attachments VALUES
 ('first','a','${ids[0]}','Older.pdf','https://example.test/older','application/pdf',10,'2026-11-11T12:00:00Z'),
 ('second','a','${ids[0]}','École.pdf','https://example.test/newer','application/pdf',20,'2026-11-11T13:00:00Z'),
 ('wrong-company','b','${ids[0]}','Private.pdf','https://example.test/private','application/pdf',30,'2026-11-11T14:00:00Z'),
 ('other-user','a','${ids[1]}','Other.pdf','https://example.test/other','application/pdf',40,'2026-11-11T14:00:00Z'),
 ('old-date','a','${ids[2]}','Old.pdf','https://example.test/old','application/pdf',50,'2026-10-01T14:00:00Z');`);
});
after(async()=>{await new Promise(r=>server.close(r));await db.close();await pool.end();});
async function read(actor='worker',target='worker',start='2026-11-11',end='2026-11-11'){
 const response=await fetch(`${base}/time-entries?userId=${target}&start=${start}&end=${end}`,{headers:actor?{Authorization:'Bearer '+jwt.sign({id:actor},process.env.JWT_SECRET)}:{}});
 return {status:response.status,data:await response.json()};
}
test('authorized listing recovers only returned-entry, current-company attachments in stable order',async()=>{
 const result=await read();assert.equal(result.status,200);assert.equal(result.data.entries.length,1);
 assert.deepEqual(result.data.entries[0].attachments.map(a=>a.id),['second','first']);
 assert.equal(result.data.entries[0].attachments[0].file_name,'École.pdf');assert.equal(result.data.entries[0].attachments[0].file_url,'https://example.test/newer');assert.equal(attachmentReads,1);
});
test('existing self/management/tenant/inactive authorization guards attachment queries',async()=>{
 for(const [actor,target,status] of [['other','worker',403],['foreign','worker',403],['inactive','worker',404],[null,'worker',401]]){
  attachmentReads=0;assert.equal((await read(actor,target)).status,status);assert.equal(attachmentReads,0);
 }
 assert.equal((await read('boss','worker')).data.entries[0].attachments.length,2);
});
test('empty results skip attachment query; entries without attachments retain an empty array',async()=>{
 const empty=await read('worker','worker','2026-12-01','2026-12-01');assert.deepEqual(empty.data.entries,[]);assert.equal(attachmentReads,0);
 await db.exec("DELETE FROM attachments WHERE company_id='a'");const result=await read();assert.deepEqual(result.data.entries[0].attachments,[]);
});
