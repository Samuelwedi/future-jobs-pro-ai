const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const pause = () => new Promise(resolve => setImmediate(resolve));

test('stopped Lucy work retains fenced durable intent for bounded lease recovery', { timeout: 10000 }, async () => {
  process.env.DATABASE_URL = 'postgres://unused@127.0.0.1:1/unused';
  process.env.LUCY_BACKGROUND_WORK_ENABLED = 'true';
  process.env.LUCY_RECORD_SEARCH_ENABLED = 'false';
  process.env.LUCY_WORK_BRIEFING_ENABLED = 'false';
  const { pool } = require('../dist/config/database');
  const original = { query: pool.query, connect: pool.connect };
  const db = new PGlite();
  const query = async (sql, args) => { const result = await db.query(sql, args); return { rows: result.rows, rowCount: result.affectedRows || result.rows.length }; };
  pool.query = query; pool.connect = async () => ({ query, release() {} });
  const work = require('../dist/services/lucyWorkService');
  const company = 'aaaaaaaa-0000-4000-a000-000000000001', user = 'bbbbbbbb-0000-4000-a000-000000000001';
  const actor = { id: user, company_id: company, role: 'boss' };
  let release;
  try {
    await db.exec(`CREATE TABLE companies(id uuid PRIMARY KEY,is_active boolean DEFAULT true,subscription_status text DEFAULT 'active',subscription_tier text DEFAULT 'professional',subscription_provider text,subscription_current_period_end timestamptz,subscription_expires_at timestamptz);
      CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,role text,is_active boolean DEFAULT true,must_change_password boolean DEFAULT false,first_name text,last_name text);`);
    for (const migration of ['20261108_lucy_background_work.sql', '20261108_lucy_work_modes.sql', '20261108_lucy_work_briefing.sql']) await db.exec(fs.readFileSync(path.join(__dirname, '../migrations', migration), 'utf8'));
    await query('INSERT INTO companies(id) VALUES($1)', [company]);
    await query("INSERT INTO users(id,company_id,role) VALUES($1,$2,'boss')", [user, company]);
    const first = (await work.createLucyWork(actor, 'Research', 'stop-first')).job;
    const second = (await work.createLucyWork(actor, 'Queued', 'stop-second')).job;
    let canContinue, calls = 0;
    work.configureLucyWorkProcessor(async ({ shouldContinue }) => {
      calls++; canContinue = shouldContinue; await new Promise(resolve => { release = resolve; }); return { text: 'Do not publish after SIGTERM' };
    });
    const run = work.runLucyWorkOnce(); while (!release) await pause();
    const before = (await query('SELECT * FROM lucy_background_work WHERE id=$1', [first.id])).rows[0];
    const stop = work.stopLucyWorkWorker();
    assert.equal(await canContinue(), false);
    await assert.rejects(work.createLucyWork(actor, 'No new work', 'shutdown-denied'), error => error.status === 503);
    assert.equal(await work.runLucyWorkOnce(), false); assert.equal(calls, 1);
    release(); await run; await stop;
    const after = (await query('SELECT * FROM lucy_background_work WHERE id=$1', [first.id])).rows[0];
    assert.equal(after.status, 'running'); assert.equal(after.result, null); assert.equal(after.error, null);
    assert.equal(after.lease_token, before.lease_token); assert.equal(after.attempts, 1);
    assert.equal(String(after.lease_until), String(before.lease_until));
    assert.equal((await work.getLucyWork(actor, second.id)).status, 'queued');
    // A fresh worker instance cannot reclaim the interrupted job before its lease expires.
    const modulePath = require.resolve('../dist/services/lucyWorkService');
    const cached = require.cache[modulePath]; delete require.cache[modulePath];
    const replacement = require(modulePath); require.cache[modulePath] = cached;
    let replacementCalls = 0;
    replacement.configureLucyWorkProcessor(async () => { replacementCalls++; return { text: 'Recovered safely' }; });
    await work.getLucyWork(actor, second.id, true);
    assert.equal(await replacement.runLucyWorkOnce(), false); assert.equal(replacementCalls, 0);
    await query("UPDATE lucy_background_work SET lease_until=now()-interval '1 second' WHERE id=$1", [first.id]);
    assert.equal(await replacement.runLucyWorkOnce(), true);
    const recovered = await work.getLucyWork(actor, first.id);
    assert.equal(recovered.status, 'completed'); assert.equal(recovered.attempts, 2); assert.equal(recovered.result.text, 'Recovered safely');
    // Existing attempt ceiling still terminates repeatedly interrupted jobs.
    await query("UPDATE lucy_background_work SET status='running',attempts=3,result=NULL,lease_token=gen_random_uuid(),lease_until=now()-interval '1 second' WHERE id=$1", [first.id]);
    assert.equal(await replacement.runLucyWorkOnce(), false); assert.equal(replacementCalls, 1);
    assert.equal((await work.getLucyWork(actor, first.id)).status, 'failed');
    await replacement.stopLucyWorkWorker();
  } finally {
    release?.(); await work.stopLucyWorkWorker(); pool.query = original.query; pool.connect = original.connect; await db.close();
    delete process.env.LUCY_BACKGROUND_WORK_ENABLED; delete process.env.LUCY_RECORD_SEARCH_ENABLED; delete process.env.LUCY_WORK_BRIEFING_ENABLED;
  }
});
