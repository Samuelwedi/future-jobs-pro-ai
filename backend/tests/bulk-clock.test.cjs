const {test,before,after}=require('node:test');const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');const {pool}=require('../dist/config/database');
const {bulkClockIn}=require('../dist/services/bulkClockService');
const db=new PGlite();const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let failGps=false,gpsWrites=0;const statements=[];
before(async()=>{
 await db.exec(`CREATE TABLE users(id uuid primary key,company_id uuid,role text,is_active boolean);
 CREATE TABLE projects(id uuid primary key,company_id uuid);
 CREATE TABLE time_entries(id uuid primary key default gen_random_uuid(),user_id uuid,project_id uuid,clock_in timestamptz,clock_out timestamptz,latitude numeric,longitude numeric,created_at timestamptz,status text);
 CREATE TABLE gps_tracking(user_id uuid,time_entry_id uuid,project_id uuid,latitude numeric,longitude numeric,timestamp timestamptz);`);
 for(const [n,c,r,a] of [[1,10,'boss',true],[2,10,'employee',true],[3,10,'employee',true],[4,11,'employee',true],[5,10,'employee',false]])await db.query('INSERT INTO users VALUES($1,$2,$3,$4)',[id(n),id(c),r,a]);
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
