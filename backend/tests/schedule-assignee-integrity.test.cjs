const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const express = require('express'), jwt = require('jsonwebtoken'), ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
process.env.JWT_SECRET = 'local-schedule-assignee-integrity-test-key';
process.env.TS_NODE_PROJECT = path.join(__dirname, '../tsconfig.json');
require('ts-node/register/transpile-only');
const { pool } = require('../src/config/database');
const id = n => `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`;
const ids = { company: id(1), other: id(2), boss: id(11), worker: id(12), coworker: id(13), foreign: id(14), manager: id(15), admin: id(16), inactive: id(17), inactiveWorker: id(18), project: id(21), project2: id(22), foreignProject: id(23) };
let db, server, base, queries;
const query = async (sql, args) => {
  queries.push(sql);
  const result = await db.query(sql, args);
  return { ...result, rowCount: result.rows.length || result.affectedRows || 0 };
};
async function request(route, { method = 'GET', body, actor = ids.boss, token } = {}) {
  const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(actor ? { Authorization: 'Bearer ' + (token || jwt.sign({ id: actor, companyId: ids.other, role: 'boss' }, process.env.JWT_SECRET)) } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}
const read = (target = ids.worker, actor = ids.boss, dates = {}) => request(`/my-shifts?${new URLSearchParams({ userId: target, start: '2026-11-11', end: '2026-11-11', ...dates })}`, { actor });
const payload = (changes = {}) => ({ name: 'Crew shift', date: '2026-11-11', startTime: '09:00', endTime: '17:00', projectId: ids.project, employeeIds: [ids.worker, ids.coworker], ...changes });
async function shift(n, options = {}) {
  await query(`INSERT INTO shifts(id, name, date, start_time, end_time, project_id, user_id, created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$7)`, [id(n), options.name || 'Crew shift', options.date || '2026-11-11', '09:00', '17:00', 'project' in options ? options.project : ids.project, options.creator || ids.boss]);
  for (const employee of options.employees || [ids.worker, ids.coworker]) await query('INSERT INTO shift_assignments VALUES($1,$2)', [id(n), employee]);
}
const assigned = shift => [...(shift.assigned_user_ids || [])].sort();
const rowIds = result => result.data.shifts.map(row => row.id).sort();

// Execute the actual mobile edit initializer and save handler, with HTTP API
// calls against this router. Native rendering and file uploads are not simulated.
const screen = fs.readFileSync(path.join(__dirname, '../../mobile/src/screens/CreateShiftScreen.tsx'), 'utf8');
const ast = ts.createSourceFile('CreateShiftScreen.tsx', screen, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let selectedInitializer, saveHandler;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast).includes('selectedEmployeeIds')) selectedInitializer = node.initializer.arguments[0].getText(ast);
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleCreate') saveHandler = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
const evaluate = (source, context) => vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context);
async function editFromRead(editing) {
  const calls = [], alerts = [];
  const context = { editing, result: undefined, selectedEmployeeIds: undefined, uploading: false, selectedProjectId: editing.project_id, shiftName: 'Updated crew shift', date: new Date(editing.date), startTime: '10:00', endTime: '18:00', notes: 'Edited without changing employees', selectedFile: null,
    calendarDate: () => editing.date, setUploading() {}, t: value => value, console,
    Alert: { alert: (...args) => alerts.push(args) }, navigation: { goBack() {} },
    api: { put: async (route, body) => { const response = await request(route.replace('/schedule', ''), { method: 'PUT', body }); calls.push({ body, response }); return response.data; }, post() { throw Error('Editing must not create a shift'); } },
  };
  evaluate('selectedEmployeeIds = ' + selectedInitializer, context);
  await evaluate('result = ' + saveHandler, context)();
  return { calls, alerts, selected: Array.from(context.selectedEmployeeIds) };
}

before(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE users(id UUID PRIMARY KEY, company_id UUID, role TEXT, is_active BOOLEAN);
    CREATE TABLE projects(id UUID PRIMARY KEY, company_id UUID, name TEXT, address TEXT);
    CREATE TABLE shifts(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT, date DATE, start_time TIME, end_time TIME, project_id UUID, user_id UUID, created_by UUID, notes TEXT, attachment_url TEXT, attachment_type TEXT, recurring_shift_id UUID);
    CREATE TABLE shift_assignments(shift_id UUID REFERENCES shifts(id) ON DELETE CASCADE, user_id UUID, PRIMARY KEY(shift_id,user_id));`);
  pool.query = query; pool.connect = async () => ({ query, release() {} });
  const app = express(); app.use(express.json()); app.use(require('../src/routes/scheduleRoutes').default);
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
  queries = [];
  await db.exec('TRUNCATE users, projects, shifts, shift_assignments');
  for (const [person, company, role, active] of [[ids.boss, ids.company, 'boss', true], [ids.manager, ids.company, 'manager', true], [ids.admin, ids.company, 'admin', true], [ids.worker, ids.company, 'employee', true], [ids.coworker, ids.company, 'employee', true], [ids.foreign, ids.other, 'boss', true], [ids.inactive, ids.company, 'manager', false], [ids.inactiveWorker, ids.company, 'employee', false]]) {
    await query('INSERT INTO users VALUES($1,$2,$3,$4)', [person, company, role, active]);
  }
  for (const [project, company] of [[ids.project, ids.company], [ids.project2, ids.company], [ids.foreignProject, ids.other]]) await query('INSERT INTO projects VALUES($1,$2,$3,$4)', [project, company, company === ids.other ? 'Private foreign project' : 'Company project', 'Project address']);
  queries = [];
});
after(async () => { await new Promise(resolve => server.close(resolve)); await db.close(); await pool.end(); });

test('HTTP create, selected-worker read and actual mobile edit preserve every explicit assignee', async () => {
  const created = await request('/shifts', { method: 'POST', body: payload() });
  assert.equal(created.status, 201);
  const result = await read(); assert.equal(result.status, 200); assert.equal(result.data.shifts.length, 1);
  const edited = await editFromRead(result.data.shifts[0]);
  assert.equal(edited.calls.length, 1); assert.equal(edited.calls[0].response.status, 200);
  const saved = await query('SELECT user_id FROM shift_assignments WHERE shift_id=$1 ORDER BY user_id', [created.data.shift.id]);
  assert.deepEqual(saved.rows.map(row => row.user_id), [ids.worker, ids.coworker], 'An unrelated edit must not delete the unselected coworker');
  assert.deepEqual(edited.selected.sort(), [ids.worker, ids.coworker]);
  assert.equal((await read(ids.coworker)).data.shifts[0].name, 'Updated crew shift');
});

test('all database manager roles receive the complete set for either selected worker, without writes', async () => {
  await shift(100);
  for (const actor of [ids.boss, ids.manager, ids.admin]) for (const target of [ids.worker, ids.coworker, ids.boss]) {
    queries = []; const result = await read(target, actor); assert.equal(result.status, 200);
    assert.deepEqual(assigned(result.data.shifts[0]), [ids.worker, ids.coworker]);
    assert.ok(queries.every(sql => !/\b(INSERT|UPDATE|DELETE|ALTER|DROP)\b/i.test(sql)));
  }
});

test('exact employee and inclusive calendar-date restrictions survive independent aggregation', async () => {
  await shift(100); await shift(101, { date: '2026-11-10' }); await shift(102, { date: '2026-11-12' });
  await shift(103, { project: ids.project2 }); await shift(104, { employees: [ids.coworker] });
  await shift(105, { creator: ids.worker, employees: [] });
  assert.deepEqual(rowIds(await read()), [id(100), id(103), id(105)]);
  assert.deepEqual(rowIds(await read(ids.worker, ids.boss, { start: '2026-11-10', end: '2026-11-12' })), [id(100), id(101), id(102), id(103), id(105)]);
});

test('employee self reads do not gain coworker IDs, including legacy creator rows', async () => {
  await shift(100); await shift(101, { creator: ids.worker, employees: [ids.coworker] });
  const result = await read(ids.worker, ids.worker); assert.equal(result.status, 200);
  assert.deepEqual(rowIds(result), [id(100), id(101)]);
  assert.deepEqual(assigned(result.data.shifts.find(row => row.id === id(100))), [ids.worker]);
  assert.deepEqual(assigned(result.data.shifts.find(row => row.id === id(101))), []);
  assert.equal((await read(ids.coworker, ids.worker)).status, 403);
  assert.equal((await request('/shifts/' + id(100), { method: 'PUT', actor: ids.worker, body: payload() })).status, 403);
});

test('creator eligibility never fabricates assignment IDs or restores the removed mobile fallback', async () => {
  await shift(100, { employees: [] });
  const result = await read(ids.boss); assert.equal(result.status, 200); assert.equal(result.data.shifts.length, 1);
  assert.deepEqual(assigned(result.data.shifts[0]), []);
  const edited = await editFromRead(result.data.shifts[0]);
  assert.deepEqual(edited.selected, []); assert.equal(edited.calls.length, 0);
  assert.match(JSON.stringify(edited.alerts), /select at least one employee/);
  assert.deepEqual(rowIds(await read(ids.worker)), []);
});

test('inactive same-company assignments and targets remain intact during an unrelated edit', async () => {
  await shift(100, { employees: [ids.worker, ids.inactiveWorker] });
  for (const target of [ids.worker, ids.inactiveWorker]) {
    const result = await read(target); assert.equal(result.status, 200);
    assert.deepEqual(assigned(result.data.shifts[0]), [ids.worker, ids.inactiveWorker]);
    const edited = await editFromRead(result.data.shifts[0]); assert.equal(edited.calls[0].response.status, 200);
  }
  assert.deepEqual((await query('SELECT user_id FROM shift_assignments ORDER BY user_id')).rows.map(row => row.user_id), [ids.worker, ids.inactiveWorker]);
});

test('foreign, moved and missing assignees are excluded without hiding valid same-company assignments', async () => {
  await shift(100, { employees: [ids.worker, ids.coworker, ids.foreign, id(999)] });
  await query('UPDATE users SET company_id=$1 WHERE id=$2', [ids.other, ids.coworker]);
  const result = await read(); assert.equal(result.status, 200);
  assert.deepEqual(assigned(result.data.shifts[0]), [ids.worker]);
  assert.equal((await read(ids.coworker)).status, 403);
  assert.equal((await read(ids.foreign)).status, 403);
  assert.deepEqual(rowIds(await read(ids.coworker, ids.coworker)), []);
});

test('stale creator or employee links cannot reveal a foreign-company project or its shift details', async () => {
  await shift(100); await shift(101, { project: ids.foreignProject, name: 'Private foreign shift' });
  await shift(102, { project: ids.foreignProject, creator: ids.worker, employees: [] });
  for (const actor of [ids.boss, ids.worker]) {
    const result = await read(ids.worker, actor); assert.equal(result.status, 200);
    assert.deepEqual(rowIds(result), [id(100)]); assert.doesNotMatch(JSON.stringify(result.data), /Private foreign/);
  }
});

test('projectless and missing-project legacy rows fail closed rather than infer company from a movable creator', async () => {
  await shift(100, { project: null }); await shift(101, { project: id(999) }); await shift(102);
  for (const [target, actor] of [[ids.worker, ids.boss], [ids.boss, ids.boss], [ids.worker, ids.worker]]) {
    assert.deepEqual(rowIds(await read(target, actor)), [id(102)]);
  }
});

test('active database identity, role and company govern reads instead of token claims', async () => {
  await shift(100);
  for (const actor of [null, ids.inactive, id(999)]) assert.notEqual((await read(ids.worker, actor)).status, 200);
  assert.equal((await request(`/my-shifts?userId=${ids.worker}&start=2026-11-11&end=2026-11-11`, { token: 'invalid-token' })).status, 401);
  await query('UPDATE users SET role=$1 WHERE id=$2', ['employee', ids.boss]);
  assert.equal((await read()).status, 403);
  const self = await read(ids.boss, ids.boss); assert.equal(self.status, 200); assert.deepEqual(assigned(self.data.shifts[0]), []);
  await query('UPDATE users SET role=$1, company_id=$2 WHERE id=$3', ['boss', ids.other, ids.boss]);
  assert.equal((await read()).status, 403); assert.deepEqual(rowIds(await read(ids.boss, ids.boss)), []);
  await query('UPDATE users SET company_id=NULL WHERE id=$1', [ids.boss]);
  assert.equal((await read(ids.boss, ids.boss)).status, 401);
});
