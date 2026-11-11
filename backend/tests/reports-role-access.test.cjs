'use strict';
// Execute the production Reports router, JWT verification, company role predicate,
// subscription gate and complimentary access SQL. Only the DB and PDF renderer
// are local substitutes; no live records, providers or application startup.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const ts = require('typescript');
const express = require('express');
const jwt = require('jsonwebtoken');
const { PGlite } = require('@electric-sql/pglite');
const secret = 'synthetic-reports-regression-secret';
const ids = {
  company: '10000000-0000-4000-8000-000000000001', foreignCompany: '10000000-0000-4000-8000-000000000002',
  requester: '20000000-0000-4000-8000-000000000001', coworker: '20000000-0000-4000-8000-000000000002',
  sponsor: '20000000-0000-4000-8000-000000000003', foreignUser: '20000000-0000-4000-8000-000000000004',
  missing: '20000000-0000-4000-8000-000000000099',
  project: '30000000-0000-4000-8000-000000000001', foreignProject: '30000000-0000-4000-8000-000000000002',
};
const endpoints = [['GET', '/summary'], ['GET', '/timesheet.csv'], ['POST', '/comprehensive']];
const source = name => fs.readFileSync(path.join(__dirname, '../src', name), 'utf8');
async function fixture() {
  const db = new PGlite();
  const state = { queries: [], rendered: [], failActor: false };
  const env = { JWT_SECRET: secret, COMPLIMENTARY_TESTER_IDENTITY: '' };
  const pool = { async query(sql, args = []) {
    state.queries.push(sql);
    if (state.failActor && /SELECT id, company_id, role FROM users/.test(sql)) throw Error('Synthetic DB unavailable');
    const result = await db.query(sql, args);
    return { ...result, rowCount: result.rows.length || result.affectedRows || 0 };
  } };
  function load(name, imports) {
    const module = { exports: {} };
    const code = ts.transpileModule(source(name), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, Buffer, process: { env },
      console: { log() {}, warn() {}, error() {} }, require(key) {
        assert(Object.hasOwn(imports, key), `Unstubbed dependency ${name}: ${key}`);
        return imports[key];
      } });
    return module.exports;
  }
  await db.exec(`
    CREATE TABLE companies(id uuid PRIMARY KEY,name text,legal_name text,address text,city text,province text,postal_code text,phone text,email text,
      is_active boolean DEFAULT true,subscription_status text DEFAULT 'active',subscription_tier text DEFAULT 'pro',subscription_provider text,
      subscription_current_period_end timestamptz DEFAULT now()+interval '1 day',subscription_expires_at timestamptz);
    CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid REFERENCES companies(id),role text,first_name text,last_name text,
      is_active boolean DEFAULT true,must_change_password boolean DEFAULT false);
    CREATE TABLE projects(id uuid PRIMARY KEY,company_id uuid REFERENCES companies(id),name text,address text,client_name text,status text);
    CREATE TABLE time_entries(id serial PRIMARY KEY,user_id uuid,project_id uuid,clock_in timestamptz,clock_out timestamptz,
      break_minutes integer,regular_hours numeric,overtime_hours numeric,total_wage numeric,approval_status text);
    CREATE TABLE photos(id serial PRIMARY KEY,user_id uuid,project_id uuid,company_id uuid,taken_at timestamptz,file_type text,verification_hash text,compliance_score numeric);
    CREATE TABLE voice_notes(id serial PRIMARY KEY,user_id uuid,project_id uuid,taken_at timestamptz,duration_seconds numeric,transcript text);
    CREATE TABLE gps_tracking(time_entry_id integer,latitude numeric,longitude numeric,timestamp timestamptz,accuracy numeric);
    CREATE TABLE attachments(id serial PRIMARY KEY,project_id uuid,company_id uuid,file_name text,file_type text,file_size integer,category text,created_at timestamptz);
    INSERT INTO companies(id,name) VALUES('${ids.company}','Synthetic Company'),('${ids.foreignCompany}','Foreign Company');
    INSERT INTO users(id,company_id,role,first_name,last_name) VALUES
      ('${ids.requester}','${ids.company}','employee','Requester','Fixture'),
      ('${ids.coworker}','${ids.company}','employee','Coworker','Private'),
      ('${ids.sponsor}','${ids.company}','boss','Sponsor','Fixture'),
      ('${ids.foreignUser}','${ids.foreignCompany}','manager','Foreign','Private');
    INSERT INTO projects(id,company_id,name,address,status) VALUES
      ('${ids.project}','${ids.company}','Synthetic Project','Synthetic Site','active'),
      ('${ids.foreignProject}','${ids.foreignCompany}','Foreign Project','Foreign Site','active');
    INSERT INTO time_entries(user_id,project_id,clock_in,clock_out,break_minutes,regular_hours,overtime_hours,total_wage,approval_status) VALUES
      ('${ids.coworker}','${ids.project}','2026-01-02 09:00Z','2026-01-02 17:00Z',0,8,0,321.09,'approved'),
      ('${ids.foreignUser}','${ids.project}','2026-01-02 09:00Z','2026-01-02 17:00Z',0,8,0,9999,'approved');
    INSERT INTO photos(user_id,project_id,company_id,taken_at,file_type) VALUES
      ('${ids.coworker}','${ids.project}','${ids.company}','2026-01-02 10:00Z','image/jpeg'),
      ('${ids.foreignUser}','${ids.project}','${ids.foreignCompany}','2026-01-02 10:00Z','image/jpeg');
    INSERT INTO voice_notes(user_id,project_id,taken_at,duration_seconds,transcript) VALUES
      ('${ids.coworker}','${ids.project}','2026-01-02 10:00Z',4,'Synthetic private voice'),
      ('${ids.foreignUser}','${ids.project}','2026-01-02 10:00Z',4,'Foreign private voice');
    INSERT INTO gps_tracking(time_entry_id,latitude,longitude,timestamp,accuracy) VALUES
      (1,45.1,-75.1,'2026-01-02 10:00Z',5),(2,55.1,-85.1,'2026-01-02 10:00Z',5);
    INSERT INTO attachments(project_id,company_id,file_name,created_at) VALUES
      ('${ids.project}','${ids.company}','synthetic.txt','2026-01-02 10:00Z'),
      ('${ids.project}','${ids.foreignCompany}','foreign.txt','2026-01-02 10:00Z');
  `);
  const auth = load('utils/auth.ts', { jsonwebtoken: jwt });
  const company = load('middleware/companyActor.ts', { '../config/database': { pool }, '../utils/auth': auth });
  const complimentary = load('services/complimentaryAccess.ts', { '../config/database': { pool } });
  const trial = load('middleware/trialMiddleware.ts', {
    '../config/database': { pool }, '../utils/auth': auth, '../services/complimentaryAccess': complimentary,
  });
  const reports = load('routes/reportRoutes.ts', { express, '../utils/auth': auth, '../config/database': { pool },
    '../middleware/companyActor': company, '../services/comprehensiveReportService': {
      async generateComprehensiveReport(data) { state.rendered.push(data); return Buffer.from('%PDF-synthetic'); },
    } });
  const app = express(); app.use(express.json()); app.use('/api', trial.subscriptionGate); app.use('/api/reports', reports.default);
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = (claims = {}, options = {}) => jwt.sign({ id: ids.requester, companyId: ids.company, ...claims }, secret, { expiresIn: '1h', ...options });
  async function request([method, route], accessToken = token(), fields = {}) {
    const params = { projectId: ids.project, startDate: '2026-01-01', endDate: '2026-01-03', ...fields };
    const response = await fetch(base + '/api/reports' + route + (method === 'POST' ? '' : '?' + new URLSearchParams(params)), {
      method, headers: { ...(accessToken && { Authorization: `Bearer ${accessToken}` }), ...(method === 'POST' && { 'Content-Type': 'application/json' }) },
      ...(method === 'POST' && { body: JSON.stringify(params) }),
    });
    const text = await response.text();
    return { status: response.status, text, headers: response.headers };
  }
  async function denied(status, accessToken = token(), fields = {}, routes = endpoints) {
    state.queries.length = 0; state.rendered.length = 0;
    for (const endpoint of routes) {
      const result = await request(endpoint, accessToken, fields);
      assert.equal(result.status, status, `${endpoint.join(' ')} ${result.text}`);
      assert(!/Coworker Private|321\.09|Synthetic private voice|latitude|workforce/.test(result.text));
    }
    assert.equal(state.rendered.length, 0, 'Denied requests must not invoke the PDF renderer');
    assert(!state.queries.some(sql => /FROM (time_entries|photos|voice_notes|gps_tracking|attachments)\b/i.test(sql)), 'Denied requests must not read report data');
  }
  async function role(value) { await db.query('UPDATE users SET role=$1 WHERE id=$2', [value, ids.requester]); }
  return { db, env, state, token, request, denied, role,
    async close() { await new Promise(resolve => server.close(resolve)); await db.close(); } };
}

test('legacy Reports current-role boundary on the production route and entitlement stack', { timeout: 30000 }, async t => {
  const f = await fixture(); t.after(() => f.close());
  await t.test('employees and non-management roles cannot read any report data or render PDFs', async () => {
    for (const role of ['employee', 'support_agent', 'agent', 'supervisor', 'godadmin', 'platform_owner', '', null]) {
      await f.role(role); await f.denied(403, f.token({ role: 'manager', isAdmin: true }));
    }
    await f.role('employee');
    await f.denied(403, f.token(), {}, [['HEAD', '/summary'], ['HEAD', '/timesheet.csv'], ['GET', '/SUMMARY/'], ['POST', '/COMPREHENSIVE/']]);
    await f.denied(403, f.token(), { projectId: ids.foreignProject });
  });
  await t.test('all established management roles retain same-company summaries, CSVs and PDFs', async () => {
    for (const role of ['boss', 'owner', 'manager', 'admin', 'MaNaGeR']) {
      await f.role(role);
      const summary = await f.request(endpoints[0], f.token({ role: 'employee' }));
      assert.equal(summary.status, 200); const body = JSON.parse(summary.text);
      assert.equal(body.workforce.length, 1); assert.equal(body.workforce[0].employee_name, 'Coworker Private');
      assert.equal(body.summary.grossWages, 321.09); assert.equal(body.summary.totalHours, 8);
      assert.equal(summary.headers.get('cache-control'), 'no-store');
      const csv = await f.request(endpoints[1]); assert.equal(csv.status, 200);
      assert.match(csv.text, /Coworker Private/); assert.match(csv.text, /321\.09/); assert.doesNotMatch(csv.text, /Foreign Private|9999/);
      const pdf = await f.request(endpoints[2]); assert.equal(pdf.status, 200); assert.equal(pdf.text, '%PDF-synthetic');
      assert.match(pdf.headers.get('content-type'), /application\/pdf/);
      const data = f.state.rendered.at(-1);
      for (const key of ['workforce', 'media', 'voiceNotes', 'gpsPoints', 'attachments']) assert.equal(data[key].length, 1, key);
    }
  });
  await t.test('role revocation and promotion use current DB values, not an old JWT role', async () => {
    const oldManager = f.token({ role: 'manager' });
    await f.role('employee'); await f.denied(403, oldManager);
    const oldEmployee = f.token({ role: 'employee' }); await f.role('manager');
    for (const route of endpoints) assert.equal((await f.request(route, oldEmployee)).status, 200);
  });
  await t.test('missing, invalid, expired and platform support credentials remain unauthenticated', async () => {
    for (const token of [null, 'invalid', f.token({}, { expiresIn: -1 }), f.token({ id: ids.missing }),
      jwt.sign({ tokenType: 'platform_support_agent', agentId: ids.requester, role: 'owner' }, secret),
      f.token({ purpose: 'password-reset' })]) await f.denied(401, token);
  });
  await t.test('inactive account/company and password-change restrictions are preserved', async () => {
    await f.db.query('UPDATE users SET is_active=false WHERE id=$1', [ids.requester]); await f.denied(401);
    await f.db.query('UPDATE users SET is_active=true WHERE id=$1', [ids.requester]);
    await f.db.query('UPDATE companies SET is_active=false WHERE id=$1', [ids.company]); await f.denied(401);
    await f.db.query('UPDATE companies SET is_active=true WHERE id=$1', [ids.company]);
    await f.db.query('UPDATE users SET must_change_password=true WHERE id=$1', [ids.requester]); await f.denied(403);
    await f.db.query('UPDATE users SET must_change_password=false WHERE id=$1', [ids.requester]);
  });
  await t.test('claimed company mismatch and current tenant/project checks remain enforced', async () => {
    await f.denied(401, f.token({ companyId: ids.foreignCompany }));
    await f.denied(404, f.token(), { projectId: ids.foreignProject });
    await f.denied(404, f.token({ id: ids.foreignUser, companyId: ids.foreignCompany }));
    await f.db.query('UPDATE users SET company_id=$1 WHERE id=$2', [ids.foreignCompany, ids.requester]); await f.denied(401);
    await f.db.query('UPDATE users SET company_id=$1 WHERE id=$2', [ids.company, ids.requester]);
  });
  await t.test('entitlement and complimentary company access never grant reporting roles', async () => {
    await f.db.query("UPDATE companies SET subscription_status='cancelled' WHERE id=$1", [ids.company]); await f.denied(402);
    f.env.COMPLIMENTARY_TESTER_IDENTITY = `${ids.sponsor}:${ids.company}`;
    assert.equal((await f.request(endpoints[0])).status, 200, 'Eligible complimentary manager retains access');
    await f.role('employee'); await f.denied(403);
    await f.role('manager');
    await f.db.query('UPDATE users SET is_active=false WHERE id=$1', [ids.sponsor]); await f.denied(402);
    await f.db.query('UPDATE users SET is_active=true WHERE id=$1', [ids.sponsor]);
    f.env.COMPLIMENTARY_TESTER_IDENTITY = '';
    await f.db.query("UPDATE companies SET subscription_status='active' WHERE id=$1", [ids.company]);
  });
  await t.test('validation behavior and fail-closed authorization are retained', async () => {
    await f.denied(400, f.token(), { projectId: '' });
    await f.denied(400, f.token(), { startDate: 'invalid' });
    await f.denied(400, f.token(), { startDate: '2026-01-04' });
    f.state.failActor = true; await f.denied(400); f.state.failActor = false;
  });
});

test('the complete legacy router inventory is covered and mounted behind the global gate', () => {
  const routes = [...source('routes/reportRoutes.ts').matchAll(/router\.(get|post|put|patch|delete)\('([^']+)'/g)].map(m => `${m[1].toUpperCase()} ${m[2]}`).sort();
  assert.deepEqual(routes, endpoints.map(x => x.join(' ')).sort());
  const index = source('index.ts');
  assert(index.indexOf("app.use('/api', subscriptionGate)") < index.indexOf("app.use('/api/reports', reportRoutes)"));
  assert.equal([...index.matchAll(/app\.use\([^\n]*reportRoutes\)/g)].length, 1, 'No untested report router alias');
});
