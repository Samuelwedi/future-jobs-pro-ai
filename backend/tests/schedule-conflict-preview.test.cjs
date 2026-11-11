const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const jwt = require('jsonwebtoken');
const { PGlite } = require('@electric-sql/pglite');
process.env.JWT_SECRET = 'local-schedule-preview-test-key';
process.env.TS_NODE_PROJECT = path.join(__dirname, '../tsconfig.json');
require('ts-node/register/transpile-only');
const { pool } = require('../src/config/database');
const id = n => `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`;
const ids = { company: id(1), other: id(2), boss: id(11), worker: id(12), coworker: id(13), foreign: id(14), manager: id(15), admin: id(16), inactive: id(17), project: id(21), project2: id(22), foreignProject: id(23) };
let db, server, base, queries, failSummary;
const query = async (sql, args) => {
  queries.push(sql);
  if (failSummary && sql.includes('WITH candidates')) throw new Error('private database detail');
  const result = await db.query(sql, args);
  return { ...result, rowCount: result.rows.length || result.affectedRows || 0 };
};
const payload = (changes = {}) => ({ date: '2026-11-11', startTime: '09:00', endTime: '17:00', projectId: ids.project, employeeIds: [ids.worker], ...changes });
async function preview(changes = {}, actor = ids.boss, token) {
  const response = await fetch(base + '/conflicts', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(actor ? { Authorization: 'Bearer ' + (token || jwt.sign({ id: actor, companyId: ids.other, role: 'employee' }, process.env.JWT_SECRET)) } : {}) }, body: JSON.stringify(payload(changes)) });
  return { status: response.status, data: await response.json() };
}
async function shift(n, start = '10:00', end = '11:00', options = {}) {
  await query(`INSERT INTO shifts(id, date, start_time, end_time, project_id, user_id, recurring_shift_id)
    VALUES($1,$2,$3,$4,$5,$6,$7)`, [id(n), options.date || '2026-11-11', start, end, options.project || ids.project, options.creator || ids.boss, options.recurring || null]);
  for (const employee of options.employees || [ids.worker]) await query('INSERT INTO shift_assignments VALUES($1,$2)', [id(n), employee]);
}
before(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE users(id UUID PRIMARY KEY, company_id UUID, role TEXT, is_active BOOLEAN);
    CREATE TABLE projects(id UUID PRIMARY KEY, company_id UUID);
    CREATE TABLE shifts(id UUID PRIMARY KEY, date DATE, start_time TIME, end_time TIME, project_id UUID, user_id UUID, recurring_shift_id UUID);
    CREATE TABLE shift_assignments(shift_id UUID, user_id UUID, PRIMARY KEY(shift_id,user_id));`);
  pool.query = query;
  const app = express(); app.use(express.json()); app.use(require('../src/routes/scheduleRoutes').default);
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
  queries = []; failSummary = false;
  await db.exec('TRUNCATE users, projects, shifts, shift_assignments');
  for (const [person, company, role, active] of [[ids.boss, ids.company, 'boss', true], [ids.manager, ids.company, 'manager', true], [ids.admin, ids.company, 'admin', true], [ids.worker, ids.company, 'employee', true], [ids.coworker, ids.company, 'employee', true], [ids.foreign, ids.other, 'boss', true], [ids.inactive, ids.company, 'boss', false]]) {
    await query('INSERT INTO users VALUES($1,$2,$3,$4)', [person, company, role, active]);
  }
  for (const [project, company] of [[ids.project, ids.company], [ids.project2, ids.company], [ids.foreignProject, ids.other]]) await query('INSERT INTO projects VALUES($1,$2)', [project, company]);
  queries = [];
});
after(async () => { await new Promise(resolve => server.close(resolve)); await db.close(); await pool.end(); });

test('partial, contained, identical and second-precision overlaps count distinct selected employees and shifts', async () => {
  await shift(100, '08:00', '09:00:01', { employees: [ids.worker, ids.coworker] });
  await shift(101, '10:00', '11:00');
  await shift(102, '08:00', '18:00');
  await shift(103, '09:00', '17:00');
  await shift(104, '16:59:59.500000', '18:00');
  queries = [];
  const result = await preview({ employeeIds: [ids.worker, ids.coworker, ids.worker.toUpperCase()] });
  assert.equal(result.status, 200);
  assert.deepEqual(result.data, { success: true, coverage: 'saved_same_day_assignments', applicable: true, conflictingEmployeeCount: 2, conflictingShiftCount: 5, uncheckedShiftCount: 0 });
  assert.ok(queries.every(sql => !/\b(INSERT|UPDATE|DELETE|ALTER|DROP)\b/i.test(sql)), 'preview must remain read-only');
});
test('touching endpoints, different dates and unrelated employees do not overlap', async () => {
  await shift(100, '07:00', '09:00'); await shift(101, '17:00', '18:00');
  await shift(102, '10:00', '11:00', { date: '2026-11-10' });
  await shift(103, '10:00', '11:00', { date: '2026-11-12' });
  await shift(104, '10:00', '11:00', { employees: [ids.coworker] });
  const result = await preview(); assert.equal(result.status, 200); assert.equal(result.data.conflictingShiftCount, 0);
});
test('checks all same-company projects, counts generated assignments, and never treats creator as an assignee', async () => {
  await shift(100, '10:00', '11:00', { project: ids.project2, recurring: id(900) });
  await shift(101, '10:00', '11:00', { creator: ids.worker, employees: [] });
  const result = await preview(); assert.equal(result.data.conflictingShiftCount, 1);
});
test('foreign projects and malformed cross-company assignments never leak into the summary', async () => {
  await shift(100, '10:00', '11:00', { project: ids.foreignProject });
  await shift(101, '10:00', '11:00', { employees: [ids.foreign] });
  const result = await preview(); assert.equal(result.data.conflictingShiftCount, 0);
  for (const changes of [{ projectId: ids.foreignProject }, { employeeIds: [ids.worker, ids.foreign] }]) {
    queries = []; const denied = await preview(changes); assert.equal(denied.status, 403); assert.equal(denied.data.conflictingShiftCount, undefined);
    assert.ok(!queries.some(sql => sql.includes('WITH candidates')));
  }
});
test('editing excludes only an existing authorized shift; reassigning checks the new employees', async () => {
  await shift(100); await shift(101, '10:00', '11:00', { employees: [ids.coworker] });
  assert.equal((await preview({ excludeShiftId: id(100) })).data.conflictingShiftCount, 0);
  assert.equal((await preview({ excludeShiftId: id(100), employeeIds: [ids.coworker] })).data.conflictingShiftCount, 1);
  await shift(102, '10:00', '11:00', { project: ids.foreignProject });
  for (const excludeShiftId of [id(102), id(999)]) {
    queries = []; const result = await preview({ excludeShiftId }); assert.equal(result.status, 404);
    assert.ok(!queries.some(sql => sql.includes('WITH candidates')));
  }
});
test('overnight, equal and missing saved times produce partial coverage; no overnight intent is invented', async () => {
  await shift(100, '22:00', '06:00'); await shift(101, '09:00', '09:00'); await shift(102, null, '10:00');
  let result = await preview(); assert.equal(result.data.conflictingShiftCount, 0); assert.equal(result.data.uncheckedShiftCount, 3);
  for (const changes of [{ startTime: '22:00', endTime: '06:00' }, { startTime: '09:00', endTime: '09:00' }]) {
    result = await preview(changes); assert.equal(result.status, 200); assert.equal(result.data.applicable, false); assert.equal(result.data.conflictingShiftCount, 0);
  }
});
test('database roles and active membership govern access, not stale or forged token claims', async () => {
  for (const actor of [ids.boss, ids.manager, ids.admin]) assert.equal((await preview({}, actor)).status, 200);
  for (const actor of [null, ids.worker, ids.inactive, ids.foreign, id(999)]) {
    queries = []; const result = await preview({}, actor); assert.notEqual(result.status, 200);
    assert.ok(!queries.some(sql => sql.includes('WITH candidates')));
  }
  assert.equal((await preview({}, ids.boss, 'invalid-token')).status, 401);
  await query('UPDATE users SET role=$1 WHERE id=$2', ['employee', ids.boss]);
  assert.equal((await preview()).status, 403);
  await query('UPDATE users SET role=$1, company_id=$2 WHERE id=$3', ['boss', ids.other, ids.boss]);
  assert.equal((await preview()).status, 403);
});
test('strict date, time, UUID and input-size validation never becomes SQL casts or unbounded reads', async () => {
  const invalid = [{ date: '2026-02-29' }, { date: '2026-11-31' }, { date: '2026-11-11T00:00:00Z' }, { date: '0000-01-01' },
    { startTime: '24:00' }, { startTime: '9:00' }, { startTime: '09:60' }, { endTime: '09:00Z' }, { endTime: ['12:00'] },
    { projectId: 'not-a-uuid' }, { employeeIds: [] }, { employeeIds: [ids.worker, null] }, { employeeIds: Array(101).fill(ids.worker) }, { excludeShiftId: 'recurring-virtual-id' }];
  for (const value of invalid) {
    queries = []; const result = await preview(value); assert.equal(result.status, 400, JSON.stringify(value));
    assert.ok(!queries.some(sql => sql.includes('WITH candidates')));
  }
  assert.equal((await preview({ date: '2028-02-29', startTime: '09:00:00.000001', endTime: '09:00:00.000002' })).status, 200);
});
test('database outage is explicit and never reports an empty successful check or raw database detail', async () => {
  failSummary = true; const result = await preview(); assert.equal(result.status, 503); assert.equal(result.data.success, false);
  assert.equal(result.data.conflictingShiftCount, undefined); assert.doesNotMatch(JSON.stringify(result), /private database detail/);
});
