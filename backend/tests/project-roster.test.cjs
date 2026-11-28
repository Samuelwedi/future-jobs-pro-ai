const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const express = require('express');
const jwt = require('jsonwebtoken');
process.env.TS_NODE_PROJECT = path.join(__dirname, '../tsconfig.json');
process.env.JWT_SECRET = 'isolated-project-roster-tests';
require('ts-node/register/transpile-only');
const { pool } = require('../src/config/database');
const uuid = n => '6cb2f513-8d6b-4ff7-8a01-' + n.toString(16).padStart(12, '0');
const [company, other, worker, manager, admin, inactive, outsider, boss, project, archive, foreign] = Array.from({length:11}, (_, i) => uuid(i+1));
let db, server, base, fail, beforeTransaction, statements;
const migration = fs.readFileSync(path.join(__dirname, '../migrations/20261128_project_roster.sql'), 'utf8');
async function query(sql, args) {
  statements.push(sql);
  if (sql === 'BEGIN' && beforeTransaction) await beforeTransaction();
  if (fail && sql.includes(fail)) throw Object.assign(Error('Injected database detail should not be disclosed'), { code: 'XX000' });
  const r = await db.query(sql, args);
  return { ...r, rowCount: r.rows.length || r.affectedRows || 0 };
}
before(async () => {
  statements = [];
  db = new PGlite();
  await db.exec(`CREATE TABLE companies (id uuid PRIMARY KEY);
    CREATE TABLE users (id uuid PRIMARY KEY, company_id uuid REFERENCES companies, role text, is_active boolean,
      full_name text, first_name text, last_name text, email text DEFAULT 'private@example.test', sin text DEFAULT 'redacted');
    CREATE TABLE projects (id uuid PRIMARY KEY, company_id uuid REFERENCES companies, archived_at timestamptz);
    INSERT INTO companies VALUES ('${company}'),('${other}');`);
  await db.exec(migration); await db.exec(migration);
  pool.connect = async () => ({ query, release() {} });
  const app = express(); app.use('/projects', require('../src/routes/projectRoutes').default);
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/projects`;
});
beforeEach(async () => {
  statements = []; fail = null; beforeTransaction = null;
  await db.exec(`TRUNCATE project_roster,projects,users;
    INSERT INTO users (id,company_id,role,is_active,full_name,first_name,last_name) VALUES
      ('${worker}','${company}','employee',TRUE,' ','Avery','Worker'),
      ('${manager}','${company}','manager',TRUE,'Mara Manager','Mary','Manager'),
      ('${admin}','${company}','admin',TRUE,null,'Lee','Admin'),
      ('${inactive}','${company}','employee',FALSE,'Inactive Worker',null,null),
      ('${outsider}','${other}','employee',TRUE,'Outside Worker',null,null),
      ('${boss}','${company}','boss',TRUE,'Blair Boss',null,null);
    INSERT INTO projects VALUES ('${project}','${company}',null),('${archive}','${company}',now()),('${foreign}','${other}',null);`);
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (db) await db.close(); await pool.end();
});
async function req(method, { p=project, target, actor=manager, expected=actor, organization=company }={}) {
  const headers = { 'X-Project-Actor': expected ?? '', 'X-Project-Company': organization };
  if (actor) headers.Authorization = 'Bearer ' + jwt.sign({id:actor,companyId:company,role:'boss'}, process.env.JWT_SECRET);
  const res = await fetch(`${base}/${p}/roster${target ? '/' + target : ''}`,{method,headers});
  return { status:res.status, data:await res.json(), cache:res.headers.get('cache-control') };
}
const saved = async () => (await db.query('SELECT user_id FROM project_roster ORDER BY user_id')).rows.map(x=>x.user_id);
test('reads only active company candidates with scoped name and role, without exposing sensitive fields',async()=>{
  const r=await req('GET');
  assert.equal(r.status,200); assert.equal(r.cache,'private, no-store');
  assert.deepEqual(r.data.members.map(x=>x.id).sort(),[worker,manager,admin,boss].sort());
  assert.deepEqual(r.data.members.find(x=>x.id===worker),{id:worker,name:'Avery Worker',role:'employee',assigned:false});
  assert.equal(r.data.members.find(x=>x.id===manager).name,'Mara Manager');
  for(const member of r.data.members) assert.deepEqual(Object.keys(member).sort(),['assigned','id','name','role']);
});
test('authorized managers add and remove individual employees/managers idempotently without touching company roles',async()=>{
  for(const actor of [manager,boss,admin]) {
    const t=actor===manager?worker:manager;
    for(let n=0;n<2;n++) assert.deepEqual((await req('PUT',{actor,target:t})).data,{success:true,assigned:true});
    assert.ok((await saved()).includes(t));
    assert.equal((await req('GET',{actor})).data.members[0].id,t);
    for(let n=0;n<2;n++) assert.deepEqual((await req('DELETE',{actor,target:t})).data,{success:true,assigned:false});
    assert.deepEqual(await saved(),[]);
  }
  assert.equal((await db.query('SELECT role FROM users WHERE id=$1',[worker])).rows[0].role,'employee');
});
test('wrong organization, archived project, inactive/foreign targets and stale identities cannot assign',async()=>{
  for(const method of ['GET','PUT','DELETE']) {
    const target=method==='GET' ? undefined : worker;
    for(const [options, code] of [[{actor:null},401],[{actor:worker},403],[{actor:inactive},401],
      [{p:foreign},404],[{p:archive},404],[{expected:admin},403],[{organization:other},403],[{p:'invalid'},404]]) {
      assert.equal((await req(method,{target,...options})).status,code,`${method} ${JSON.stringify(options)}`);
    }
  }
  assert.equal((await req('PUT',{target:outsider})).status,404);
  assert.equal((await req('PUT',{target:inactive})).status,404);
  assert.deepEqual(await saved(),[]);
});
test('tenant change before write denies even a formerly valid mobile session; failed write rolls back',async()=>{
  beforeTransaction=()=>db.query('UPDATE users SET company_id=$1 WHERE id=$2',[other,manager]);
  assert.equal((await req('PUT',{target:worker})).status,403); assert.deepEqual(await saved(),[]);
  beforeTransaction=null; await db.query('UPDATE users SET company_id=$1 WHERE id=$2',[company,manager]);
  fail='INSERT INTO project_roster';const res=await req('PUT',{target:worker});
  assert.equal(res.status,503);assert.equal(res.data.message,'Project team is unavailable. Try again later.');
  assert.ok(statements.includes('ROLLBACK'));assert.deepEqual(await saved(),[]);
});
test('deactivation and moving a user do not expose their membership; roster cleanup is reversible and scoped',async()=>{
  await req('PUT',{target:worker});
  await db.query('UPDATE users SET is_active=false WHERE id=$1',[worker]);
  assert.equal((await req('GET')).data.members.some(x=>x.id===worker),false);
  await db.query('UPDATE users SET is_active=true,company_id=$1 WHERE id=$2',[other,worker]);
  assert.equal((await req('GET')).data.members.some(x=>x.id===worker),false);
  assert.equal((await req('DELETE',{target:worker})).status,200);assert.deepEqual(await saved(),[]);
});
