const {test,before,after}=require('node:test');const assert=require('node:assert/strict');const express=require('express');
const {PGlite}=require('@electric-sql/pglite');const {pool}=require('../dist/config/database');const auth=require('../dist/utils/auth');
const {createPTORequest,getUserPTOBalance,validatePTORequest}=require('../dist/services/ptoService');
const db=new PGlite();let server,base,actor='employee',failInsert=false;let statements=[];
before(async()=>{
 await db.exec(`CREATE TABLE users(id text,company_id text,role text,is_active boolean,first_name text,last_name text);
 INSERT INTO users VALUES('employee','company','employee',true,'A','One'),('colleague','company','employee',true,'B','Two'),('boss','company','boss',true,'C','Three'),('foreign','other','boss',true,'D','Four');
 CREATE TABLE pto_requests(id uuid primary key default gen_random_uuid(),user_id text,company_id text,start_date date,end_date date,type text,reason text,status text);
 CREATE TABLE pto_balances(user_id text,company_id text,year integer,vacation_days numeric,sick_days numeric,personal_days numeric);`);
 pool.query=async(sql,args)=>{const r=await db.query(sql,args);return {...r,rowCount:r.rows.length || r.affectedRows || 0};};
 pool.connect=async()=>({query:async(sql,args)=>{statements.push(sql);if(failInsert&&sql.startsWith('INSERT INTO pto_requests'))throw Error('write failed');return pool.query(sql,args);},release(){}});
 auth.verifyToken=()=>({id:actor});const app=express();app.use(express.json());app.use(require('../dist/routes/ptoRoutes').default);server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{await new Promise(r=>server.close(r));await db.close();await pool.end();});
test('PTO rejects impossible dates, oversized ranges and invalid reasons before writing',()=>{
 for(const args of [['2026-02-30','2026-03-02','sick',''],['2026-1-01','2026-01-02','sick',''],['2026-01-02','2026-01-01','sick',''],['2026-01-01','2027-01-02','sick',''],['2026-01-01','2026-01-02','sick',{}]])assert.throws(()=>validatePTORequest(...args),e=>e.status===400);
 assert.equal(validatePTORequest('2028-02-29','2028-03-01','unpaid','').days,2);
});
test('PTO submission locks membership, rolls back failed inserts and rejects overlaps',async()=>{
 failInsert=true;await assert.rejects(createPTORequest('employee','company','2026-11-10','2026-11-12','sick'));failInsert=false;
 assert.equal((await db.query('SELECT * FROM pto_requests')).rows.length,0);assert.ok(statements.some(s=>s.includes('FOR UPDATE')));assert.ok(statements.includes('ROLLBACK'));
 await assert.rejects(createPTORequest('employee','other','2026-11-10','2026-11-12','sick'),e=>e.status===403);
 const created=await createPTORequest('employee','company','2026-11-10','2026-11-12','sick');assert.equal(created.calendar_days,3);
 await assert.rejects(createPTORequest('employee','company','2026-11-12','2026-11-13','sick'),e=>e.status===409);
 await createPTORequest('colleague','company','2026-11-10','2026-11-12','vacation');await createPTORequest('foreign','other','2026-11-10','2026-11-12','vacation');
});
test('legacy list endpoint restricts employees to self and managers to their company',async()=>{
 async function list(id){actor=id;const r=await fetch(base,{headers:{Authorization:'Bearer test'}});assert.equal(r.status,200);return (await r.json()).requests;}
 assert.deepEqual((await list('employee')).map(r=>r.user_id),['employee']);assert.equal((await list('boss')).length,2);assert.deepEqual((await list('foreign')).map(r=>r.user_id),['foreign']);
});
test('unconfigured balances stay unknown and balances cannot cross company boundaries',async()=>{
 assert.equal(await getUserPTOBalance('employee','company'),null);
 await db.query('INSERT INTO pto_balances VALUES ($1,$2,$3,8,2,1)',['employee','company',new Date().getFullYear()]);
 assert.equal((await getUserPTOBalance('employee','company')).vacation_days,8);assert.equal(await getUserPTOBalance('employee','other'),null);
});
