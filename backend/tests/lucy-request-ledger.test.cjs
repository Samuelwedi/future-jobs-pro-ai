const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');

test('Lucy request ledger uses committed, scoped tombstones without automatic reexecution', async t => {
  process.env.DATABASE_URL = 'postgres://unused@127.0.0.1:1/unused';
  const db = new PGlite();
  const { pool } = require('../dist/config/database');
  const original = { query: pool.query, connect: pool.connect };
  let fault;
  const raw = async (sql, args) => {
    if (fault) await fault(sql, args);
    const result = await db.query(sql, args);
    return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
  };
  // PGlite has one real connection. Queue whole transactions, not individual
  // statements, so concurrent callers cannot accidentally share a transaction.
  let tail = Promise.resolve();
  const acquire = async () => {
    let release;
    const next = new Promise(resolve => { release = resolve; });
    const prior = tail; tail = next; await prior;
    return release;
  };
  pool.connect = async () => {
    const unlock = await acquire();
    let released = false;
    return { query: raw, release() { if (!released) { released = true; unlock(); } } };
  };
  pool.query = async (sql, args) => {
    const unlock = await acquire();
    try { return await raw(sql, args); } finally { unlock(); }
  };
  const service = require('../dist/services/lucyRequestService');
  const { beginLucyRequest: begin, completeLucyRequest: complete, getLucyRequest: get,
    markLucyRequestUncertain: uncertain, pruneExpiredLucyResponses: prune, LucyRequestError } = service;
  const c = 'aaaaaaaa-0000-4000-a000-000000000001';
  const d = 'aaaaaaaa-0000-4000-a000-000000000002';
  const a = { id: 'bbbbbbbb-0000-4000-a000-000000000001', company_id: c, role: 'boss' };
  const b = { id: 'bbbbbbbb-0000-4000-a000-000000000002', company_id: c, role: 'boss' };
  const x = { id: 'bbbbbbbb-0000-4000-a000-000000000003', company_id: d, role: 'boss' };
  let serial = 0;
  const payload = (requestId = `request-${++serial}`, extra = {}) => ({ requestId, message: 'Create a task for the north site', language: 'en', channel: 'web', ...extra });
  const checkError = (status, code) => error => {
    assert.ok(error instanceof LucyRequestError); assert.equal(error.status, status);
    if (code) assert.equal(error.code, code);
    assert.ok(!/SECRET|postgres|SELECT|INSERT/.test(error.message));
    return true;
  };
  const migration = fs.readFileSync(path.join(__dirname, '../migrations/20261108_lucy_request_ledger.sql'), 'utf8');
  try {
    await db.exec('CREATE TABLE companies(id uuid PRIMARY KEY); CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,role text,is_active boolean DEFAULT true); CREATE TABLE simulated_effects(id uuid PRIMARY KEY);');
    await db.exec(migration); await db.exec(migration);
    await pool.query('INSERT INTO companies VALUES($1),($2)', [c, d]);
    for (const actor of [a, b, x]) await pool.query('INSERT INTO users(id,company_id,role) VALUES($1,$2,$3)', [actor.id, actor.company_id, actor.role]);

    await t.test('additive migration is idempotent and rejects invalid row shapes', async () => {
      const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_name='lucy_request_ledger'");
      assert.equal(tables.rows.length, 1);
      const input = payload(); const claimed = await begin(a, input);
      await assert.rejects(() => pool.query("UPDATE lucy_request_ledger SET status='completed' WHERE request_id=$1", [input.requestId]), /check constraint/);
      assert.equal((await get(a, input.requestId)).status, 'processing');
      assert.ok(claimed.claim.token);
    });

    await t.test('legacy requests are untracked; malformed explicit IDs never bypass', async () => {
      assert.deepEqual(await begin(a, { message: 'Legacy' }), { kind: 'untracked' });
      assert.deepEqual(await begin(a, { message: 'Legacy', requestId: null }), { kind: 'untracked' });
      for (const requestId of ['', 'has space', '../key', 'x'.repeat(101), 123, {}]) {
        await assert.rejects(() => begin(a, payload(requestId)), checkError(400, 'invalid_request_id'));
      }
      for (const message of ['', ' ', 'x'.repeat(8001), {}]) {
        await assert.rejects(() => begin(a, payload(undefined, { message })), checkError(400, 'invalid_message'));
      }
      await assert.rejects(() => begin(a, payload(undefined, { language: {} })), checkError(400));
      await assert.rejects(() => begin(a, payload(undefined, { channel: 'x'.repeat(65) })), checkError(400));
    });

    await t.test('semantic SHA-256 identity is stable, hashed only, and conflicts on each field', async () => {
      const input = payload(); await begin(a, input);
      const row = (await pool.query('SELECT * FROM lucy_request_ledger WHERE request_id=$1', [input.requestId])).rows[0];
      assert.equal(row.payload_hash, createHash('sha256').update(JSON.stringify([1, input.message, input.language, input.channel])).digest('hex'));
      assert.ok(!JSON.stringify(row).includes(input.message));
      assert.equal((await begin(a, { channel: 'web', language: 'en', message: '  ' + input.message + '  ', requestId: input.requestId })).kind, 'blocked');
      for (const extra of [{ message: 'Different' }, { language: 'fr' }, { channel: 'mobile' }]) {
        await assert.rejects(() => begin(a, { ...input, ...extra }), checkError(409, 'request_payload_conflict'));
      }
      const absent = payload(undefined, { language: undefined, channel: undefined }); await begin(a, absent);
      assert.equal((await begin(a, { ...absent, language: null, channel: null })).kind, 'blocked');
    });

    await t.test('concurrent duplicate calls admit exactly one execution across service instances', async () => {
      const input = payload();
      const modulePath = require.resolve('../dist/services/lucyRequestService');
      const cached = require.cache[modulePath]; delete require.cache[modulePath];
      const second = require(modulePath); require.cache[modulePath] = cached;
      const submissions = Array.from({ length: 12 }, (_, i) => i % 2 ? second.beginLucyRequest(a, input) : begin(a, input));
      const results = await Promise.all(submissions);
      assert.equal(results.filter(result => result.kind === 'claimed').length, 1);
      assert.equal(results.filter(result => result.kind === 'blocked').length, 11);
      assert.equal(Number((await pool.query('SELECT count(*) n FROM lucy_request_ledger WHERE request_id=$1', [input.requestId])).rows[0].n), 1);
      // There is no time-based lease takeover, even after a hypothetical long crash.
      await pool.query("UPDATE lucy_request_ledger SET created_at=now()-interval '1 year',updated_at=now()-interval '1 year' WHERE request_id=$1", [input.requestId]);
      assert.equal((await begin(a, input)).kind, 'blocked');
    });

    await t.test('completed exact retries and GET return original bounded response without private tokens', async () => {
      const input = payload(); const { claim } = await begin(a, input);
      const response = { statusCode: 200, body: { text: 'Created ✓', actions: [{ type: 'task', status: 'completed', details: [{ id: 'real-record-id' }] }], run: { status: 'partial' } } };
      const saved = await complete(a, claim, response);
      assert.equal(saved.status, 'completed'); assert.equal(saved.replayable, true); assert.equal(saved.retryAllowed, false);
      const replay = await begin(a, input); assert.equal(replay.kind, 'replay'); assert.deepEqual(replay.response, response);
      assert.deepEqual((await get(a, input.requestId)).response, response);
      assert.ok(!JSON.stringify(saved).includes(claim.token)); assert.ok(!JSON.stringify(saved).includes('payload_hash'));
      // A late error path cannot erase a successfully persisted response.
      assert.deepEqual((await uncertain(a, claim)).response, response);
      await assert.rejects(() => complete(a, claim, { statusCode: 200, body: { text: 'replace' } }), checkError(409, 'claim_inactive'));
      assert.deepEqual((await get(a, input.requestId)).response, response);
    });

    await t.test('foreign users/company cannot read or finalize; same key is independently scoped', async () => {
      const input = payload(); const { claim } = await begin(a, input);
      for (const actor of [b, x]) {
        await assert.rejects(() => get(actor, input.requestId), checkError(404, 'request_not_found'));
        await assert.rejects(() => complete(actor, claim, { statusCode: 200, body: { text: 'foreign' } }), checkError(409));
        await assert.rejects(() => uncertain(actor, claim), checkError(409));
        assert.equal((await begin(actor, input)).kind, 'claimed');
      }
      assert.equal((await get(a, input.requestId)).status, 'processing');
      await assert.rejects(() => get({ ...a, company_id: d }, input.requestId), checkError(401));
      await assert.rejects(() => complete(a, { ...claim, token: randomUUID() }, { statusCode: 200, body: {} }), checkError(409));
    });

    await t.test('inactive, moved and changed-role actors are rejected on every tracked operation', async () => {
      for (const change of ["is_active=false", `company_id='${d}'`, "role='employee'"]) {
        const input = payload(); const { claim } = await begin(a, input);
        await pool.query('UPDATE users SET ' + change + ' WHERE id=$1', [a.id]);
        try {
          await assert.rejects(() => begin(a, input), checkError(401, 'actor_unavailable'));
          await assert.rejects(() => begin(a, payload()), checkError(401));
          await assert.rejects(() => get(a, input.requestId), checkError(401));
          await assert.rejects(() => complete(a, claim, { statusCode: 200, body: {} }), checkError(401));
          await assert.rejects(() => uncertain(a, claim), checkError(401));
          // Authorization must take priority even when a fallback response is oversized.
          await assert.rejects(() => complete(a, claim, { statusCode: 200, body: { text: 'x'.repeat(128001) } }), checkError(401));
          if (change === "role='employee'") {
            const downgraded = { ...a, role: 'employee' };
            await assert.rejects(() => begin(downgraded, input), checkError(409, 'request_scope_conflict'));
            await assert.rejects(() => get(downgraded, input.requestId), checkError(404));
          }
        } finally {
          await pool.query("UPDATE users SET is_active=true,company_id=$2,role='boss' WHERE id=$1", [a.id, c]);
        }
        assert.equal((await begin(a, input)).kind, 'blocked');
      }
    });

    await t.test('old-role completed responses remain invisible after privilege change', async () => {
      const input = payload(); const { claim } = await begin(a, input);
      await complete(a, claim, { statusCode: 200, body: { text: 'Manager-only result' } });
      await pool.query("UPDATE users SET role='employee' WHERE id=$1", [a.id]);
      try {
        await assert.rejects(() => get({ ...a, role: 'employee' }, input.requestId), checkError(404));
        await assert.rejects(() => begin({ ...a, role: 'employee' }, input), checkError(409, 'request_scope_conflict'));
      } finally { await pool.query("UPDATE users SET role='boss' WHERE id=$1", [a.id]); }
    });

    await t.test('legacy null roles use the route default employee scope', async () => {
      const input = payload(); await pool.query('UPDATE users SET role=NULL WHERE id=$1', [b.id]);
      try {
        const actor = { ...b, role: 'employee' };
        assert.equal((await begin(actor, input)).kind, 'claimed');
        assert.equal((await get(actor, input.requestId)).status, 'processing');
        await assert.rejects(() => begin(b, input), checkError(401));
      } finally { await pool.query("UPDATE users SET role='boss' WHERE id=$1", [b.id]); }
    });

    await t.test('final-save failure preserves committed effects and cannot execute the same request again', async () => {
      const input = payload(); let executions = 0;
      const submit = async () => {
        const result = await begin(a, input);
        if (result.kind !== 'claimed') return result;
        executions++;
        await pool.query('INSERT INTO simulated_effects VALUES($1)', [randomUUID()]);
        fault = sql => { if (/SET status='completed'/.test(sql)) throw new Error('SECRET database details'); };
        try { await complete(a, result.claim, { statusCode: 200, body: { text: 'Effect completed' } }); }
        finally { fault = undefined; }
      };
      await assert.rejects(submit, checkError(503, 'request_store_unavailable'));
      assert.equal((await get(a, input.requestId)).status, 'processing');
      const retry = await submit(); assert.equal(retry.kind, 'blocked'); assert.equal(retry.request.response, null);
      assert.equal(executions, 1); assert.equal(Number((await pool.query('SELECT count(*) n FROM simulated_effects')).rows[0].n), 1);
      assert.equal((await get(a, input.requestId)).retryAllowed, false);
    });

    await t.test('unavailable authorization is distinguishable from response persistence failure', async () => {
      const input = payload(); const { claim } = await begin(a, input);
      fault = sql => { if (/SELECT id FROM users/.test(sql)) throw new Error('SECRET actor query unavailable'); };
      try {
        await assert.rejects(() => complete(a, claim, { statusCode: 200, body: { text: 'Do not expose this' } }), checkError(503, 'actor_verification_unavailable'));
        await assert.rejects(() => get(a, input.requestId), checkError(503, 'actor_verification_unavailable'));
        await assert.rejects(() => begin(a, input), checkError(503, 'actor_verification_unavailable'));
      } finally { fault = undefined; }
      assert.equal((await get(a, input.requestId)).status, 'processing');
    });

    await t.test('failed attempts become sanitized terminal uncertainty, not retryable failures', async () => {
      const input = payload(); const { claim } = await begin(a, input);
      const result = await uncertain(a, claim, new Error('SECRET provider token and transcript'));
      assert.equal(result.status, 'uncertain'); assert.equal(result.response, null);
      assert.ok(result.message.includes('will not run again'));
      assert.ok(!JSON.stringify((await pool.query('SELECT * FROM lucy_request_ledger WHERE request_id=$1', [input.requestId])).rows).includes('SECRET'));
      assert.equal((await begin(a, input)).kind, 'blocked');
      assert.equal((await uncertain(a, claim)).status, 'uncertain');
      await assert.rejects(() => complete(a, claim, { statusCode: 200, body: {} }), checkError(409));
    });

    await t.test('claim commit uncertainty never authorizes execution and retry remains blocked', async () => {
      const input = payload(); let injected = false;
      fault = async sql => {
        if (sql === 'COMMIT' && !injected) {
          injected = true; await db.query('COMMIT');
          throw new Error('SECRET network disconnect after commit');
        }
      };
      try { await assert.rejects(() => begin(a, input), checkError(503)); } finally { fault = undefined; }
      assert.equal((await begin(a, input)).kind, 'blocked');
    });

    await t.test('completion commit uncertainty can recover persisted response, never overwrite it', async () => {
      const input = payload(); const { claim } = await begin(a, input);
      const response = { statusCode: 200, body: { text: 'Durably completed' } }; let injected = false;
      fault = async sql => {
        if (sql === 'COMMIT' && !injected) { injected = true; await db.query('COMMIT'); throw new Error('SECRET disconnect'); }
      };
      try { await assert.rejects(() => complete(a, claim, response), checkError(503)); } finally { fault = undefined; }
      assert.deepEqual((await uncertain(a, claim)).response, response);
      assert.deepEqual((await begin(a, input)).response, response);
    });

    await t.test('response retention is bounded by UTF-8/stored JSONB size and excludes error bodies', async () => {
      for (const response of [
        { statusCode: 200, body: { text: 'x'.repeat(128001) } },
        { statusCode: 200, body: { text: '😃'.repeat(33000) } },
        { statusCode: 503, body: { error: 'SECRET raw provider error' } },
        { statusCode: 200, body: ['not-an-object'] },
        { statusCode: 200, body: { toJSON: () => 'not-an-object' } },
        // Compact JSON fits but JSONB inserts enough spaces to exceed its limit.
        { statusCode: 200, body: { list: Array(45000).fill(0) } },
      ]) {
        const input = payload(); const { claim } = await begin(a, input);
        await assert.rejects(() => complete(a, claim, response), checkError(413, 'response_not_retainable'));
        assert.equal((await get(a, input.requestId)).status, 'processing');
        assert.equal((await begin(a, input)).kind, 'blocked');
      }
      const input = payload(); const { claim } = await begin(a, input); const body = {}; body.self = body;
      await assert.rejects(() => complete(a, claim, { statusCode: 200, body }), checkError(413));
    });

    await t.test('expired response content is removed while request tombstones permanently block reuse', async () => {
      for (const mode of ['get', 'begin', 'prune']) {
        const input = payload(); const { claim } = await begin(a, input);
        await complete(a, claim, { statusCode: 200, body: { text: 'Sensitive retained response' } });
        await pool.query("UPDATE lucy_request_ledger SET response_expires_at=now()-interval '1 second' WHERE request_id=$1", [input.requestId]);
        if (mode === 'get') assert.equal((await get(a, input.requestId)).status, 'expired');
        if (mode === 'begin') assert.equal((await begin(a, input)).request.status, 'expired');
        if (mode === 'prune') assert.ok(await prune() >= 1);
        const row = (await pool.query('SELECT * FROM lucy_request_ledger WHERE request_id=$1', [input.requestId])).rows[0];
        assert.equal(row.response_body, null); assert.equal(row.status, 'expired'); assert.ok(row.payload_hash);
        assert.equal((await begin(a, input)).kind, 'blocked');
        await assert.rejects(() => begin(a, { ...input, message: 'Another task' }), checkError(409));
      }
    });

    await t.test('missing schema and database failures fail closed before a caller can execute', async () => {
      const input = payload();
      await pool.query('ALTER TABLE lucy_request_ledger RENAME TO unavailable_ledger');
      try { await assert.rejects(() => begin(a, input), checkError(503)); }
      finally { await pool.query('ALTER TABLE unavailable_ledger RENAME TO lucy_request_ledger'); }
      assert.equal((await pool.query('SELECT id FROM lucy_request_ledger WHERE request_id=$1', [input.requestId])).rows.length, 0);
    });
  } finally {
    fault = undefined;
    pool.query = original.query; pool.connect = original.connect;
    await db.close(); await pool.end();
  }
});
