const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const express = require('express');
const jwt = require('jsonwebtoken');
process.env.TS_NODE_PROJECT = path.join(__dirname, '../tsconfig.json');
process.env.JWT_SECRET = 'isolated-project-tests';
require('ts-node/register/transpile-only');
const { pool } = require('../src/config/database');
let db, server, base, statements, onBegin, failWrite;
const migration = fs.readFileSync(path.join(__dirname, '../migrations/20261111_project_archive.sql'), 'utf8');
async function query(sql, args) {
  statements.push(sql);
  if (sql === 'BEGIN' && onBegin) { const change = onBegin; onBegin = null; await db.exec(change); }
  if (failWrite && /UPDATE projects/.test(sql)) throw Error('Injected write failure');
  const r = await db.query(sql, args);
  return { ...r, rowCount: r.rows.length || r.affectedRows || 0 };
}
pool.query = query;
pool.connect = async () => ({ query, release() {} });
before(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, company_id TEXT, role TEXT, is_active BOOLEAN);
    CREATE TABLE projects (id TEXT PRIMARY KEY, company_id TEXT, name TEXT, client_name TEXT, address TEXT,
      latitude NUMERIC, longitude NUMERIC, geofence_radius INTEGER, status TEXT);
    CREATE TABLE project_history (id TEXT, project_id TEXT REFERENCES projects(id), details TEXT);
    CREATE TABLE project_media (id TEXT, project_id TEXT REFERENCES projects(id), url TEXT);
    INSERT INTO projects (id,company_id,name,status) VALUES ('legacy','a','Legacy','completed');`);
  await db.exec(migration); await db.exec(migration);
  assert.equal((await db.query("SELECT archived_at FROM projects WHERE id='legacy'")).rows[0].archived_at, null);
  const app = express(); app.use(express.json()); app.use('/projects', require('../src/routes/projectRoutes').default);
  server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
  statements = []; onBegin = null; failWrite = false;
  await db.exec(`TRUNCATE project_history,project_media,projects,users;
    INSERT INTO users VALUES ('manager','a','manager',TRUE),('boss','a','boss',TRUE),('admin','a','admin',TRUE),
      ('worker','a','worker',TRUE),('owner','a','owner',TRUE),('foreign','b','manager',TRUE),('inactive','a','manager',FALSE);
    INSERT INTO projects (id,company_id,name,status) VALUES ('active','a','Active','active'), ('hold','a','Hold','on_hold'),
      ('done','a','Done','completed'), ('foreign','b','Foreign','active');
    INSERT INTO project_history VALUES ('history','hold','Preserved history');
    INSERT INTO project_media VALUES ('media','hold','https://example.test/media');`);
});
after(async () => { if (server) await new Promise(r => server.close(r)); if (db) await db.close(); await pool.end(); });
async function request(method, route, user = 'manager', body) {
  const token = user ? jwt.sign({ id: user, companyId: 'a', role: 'boss' }, process.env.JWT_SECRET) : null;
  const r = await fetch(base + '/projects' + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: r.status, data: await r.json() };
}
async function project(id = 'hold') { return (await db.query('SELECT * FROM projects WHERE id=$1', [id])).rows[0]; }
test('archive/restore are idempotent and preserve completion state, history and media', async () => {
  for (const [id, role] of [['active','boss'],['hold','manager'],['done','admin']]) {
    const before = await project(id);
    const first = await request('DELETE', '/' + id, role); assert.equal(first.status, 200); assert.ok(first.data.project.archived_at);
    assert.equal((await request('DELETE', '/' + id, role)).data.project.archived_at, first.data.project.archived_at);
    assert.equal((await project(id)).status, before.status);
    assert.equal((await request('POST', '/' + id + '/restore', role)).status, 200);
    assert.equal((await request('POST', '/' + id + '/restore', role)).status, 200);
    assert.deepEqual(await project(id), before);
  }
  assert.equal((await db.query('SELECT details FROM project_history')).rows[0].details, 'Preserved history');
  assert.equal((await db.query('SELECT url FROM project_media')).rows[0].url, 'https://example.test/media');
  assert.ok(statements.some(s => /users.*FOR UPDATE/.test(s))); assert.ok(statements.includes('COMMIT'));
});
test('tenant, existing role allowlist and inactive authentication apply even on retries', async () => {
  for (const [user, status] of [['worker',403],['owner',403],['foreign',404],['inactive',401],[null,401]]) {
    for (const [method, route] of [['DELETE','/hold'],['POST','/hold/restore']]) assert.equal((await request(method,route,user)).status, status);
  }
  assert.equal((await request('DELETE','/foreign')).status,404);
  assert.equal((await request('POST','/missing/restore')).status,404);
  assert.equal((await project()).archived_at,null);
});
test('revalidates role, active flag and tenant inside write transaction', async () => {
  for (const [change, expected] of [["role='worker'",403],["is_active=FALSE",401],["company_id='b'",404]]) {
    await db.exec("UPDATE users SET role='manager',is_active=TRUE,company_id='a' WHERE id='manager'");
    onBegin = `UPDATE users SET ${change} WHERE id='manager'`;
    assert.equal((await request('DELETE','/hold')).status,expected);
    assert.equal((await project()).archived_at,null);
  }
  await db.exec("UPDATE users SET role='manager',is_active=TRUE,company_id='a' WHERE id='manager'");
  await request('DELETE','/hold');
  onBegin = "UPDATE users SET role='worker' WHERE id='manager'";
  assert.equal((await request('POST','/hold/restore')).status,403); assert.ok((await project()).archived_at);
});
test('default, explicit and active listings are tenant scoped; archived flag is strict', async () => {
  await request('DELETE','/hold'); await request('DELETE','/active');
  const ids = r => r.data.projects.map(p => p.id).sort();
  assert.deepEqual(ids(await request('GET','')),['done']);
  assert.deepEqual(ids(await request('GET','?archived=false')),['done']);
  assert.deepEqual(ids(await request('GET','?archived=true')),['active','hold']);
  assert.deepEqual(ids(await request('GET','/active')),[]);
  for (const q of ['1','TRUE','','false&archived=true','true&archived=true']) assert.equal((await request('GET','?archived='+q)).status,400);
  await request('POST','/active/restore'); assert.deepEqual(ids(await request('GET','/active')),['active']);
});
test('ordinary edits and geofence never restore or reset omitted status', async () => {
  await request('DELETE','/hold'); const old = await project();
  const update = await request('PUT','/hold','manager',{ name:'Renamed', archived_at:null }); assert.equal(update.status,200);
  assert.equal((await project()).status,'on_hold'); assert.deepEqual((await project()).archived_at,old.archived_at);
  assert.equal((await request('PUT','/hold/geofence','manager',{latitude:20,longitude:30,geofence_radius:200})).status,200);
  assert.deepEqual((await project()).archived_at,old.archived_at);
  assert.equal((await request('PUT','/hold','manager',{name:'Renamed',status:'invalid'})).status,400);
  assert.equal((await request('PUT','/hold','manager',{name:'Renamed',status:'completed'})).status,200);
  assert.deepEqual((await project()).archived_at,old.archived_at); assert.equal((await project()).status,'completed');
});
test('failed archive rolls back; migration reruns preserve an existing archive', async () => {
  failWrite = true; assert.equal((await request('DELETE','/hold')).status,500); assert.ok(statements.includes('ROLLBACK')); assert.equal((await project()).archived_at,null);
  failWrite = false; await request('DELETE','/hold'); const old = await project(); await db.exec(migration); await db.exec(migration); assert.deepEqual(await project(),old);
  const { steps, run } = require('../scripts/run-release-predeploy.cjs'); assert.ok(steps.includes('run-project-archive-migration.cjs'));
  const called = []; run((_exe,args) => { called.push(path.basename(args[0])); return {status:0}; }); assert.deepEqual(called,steps);
});
