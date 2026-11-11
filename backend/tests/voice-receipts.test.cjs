const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const jwt = require('jsonwebtoken');
const { PGlite } = require('@electric-sql/pglite');
process.env.TS_NODE_PROJECT = path.join(__dirname, '../tsconfig.json');
process.env.JWT_SECRET = 'isolated-voice-receipts';
require('ts-node/register/transpile-only');
const { pool } = require('../src/config/database');
const { v2: cloudinary } = require('cloudinary');
const ids = Object.fromEntries(['actor', 'other', 'foreign', 'company', 'outside', 'project', 'otherProject', 'foreignProject', 'entry', 'otherEntry', 'foreignEntry'].map((name, index) => [name, `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`]));
let db, server, base, uploads, models, provider, model, statements, failComplete, failInsert, failClaim, failUncertain, failCommit, transactionKind;
async function query(sql, args) {
  statements.push(sql);
  if (sql === 'BEGIN') transactionKind = '';
  if (sql.includes('INSERT INTO voice_processing_receipts')) {
    transactionKind = 'claim';
    if (failClaim) throw Error('receipt admission unavailable');
  }
  if (failUncertain && sql.includes("UPDATE voice_processing_receipts SET state='uncertain'")) throw Error('uncertainty persistence unavailable');
  if (sql.includes("UPDATE voice_processing_receipts SET state='completed'")) {
    transactionKind = 'complete';
    if (failComplete) throw Error('receipt completion failed');
  }
  if (failInsert && sql.includes('INSERT INTO voice_notes')) throw Error('note insert failed');
  const result = await db.query(sql, args);
  if (sql === 'COMMIT' && transactionKind === failCommit) throw Error('COMMIT acknowledgment lost');
  return { ...result, rowCount: result.rows.length || result.affectedRows || 0 };
}
pool.query = query;
pool.connect = async () => ({ query, release() {} });
const serviceId = require.resolve('../src/services/voiceService');
require.cache[serviceId] = { id: serviceId, filename: serviceId, loaded: true, exports: {
  processVoiceNote: async (...args) => { models++; return model(...args); },
  processTranscriptOnly: async (...args) => { models++; return model(...args); },
  transcribeAudio: async () => { throw Error('Unexpected assistant transcription'); },
} };
cloudinary.uploader.upload = async (...args) => { uploads++; return provider(...args); };
const key = 'voice-fixture-request-001';
const migration = fs.readFileSync(path.join(__dirname, '../migrations/20261111_voice_receipts.sql'), 'utf8');
const outcome = () => ({ transcript: 'Saved transcript', structuredData: { actions: ['checked'] }, clientSummary: 'Summary', tags: ['checked'], duration: 9 });
const auth = (name = 'actor') => name ? { Authorization: 'Bearer ' + jwt.sign({ id: ids[name], companyId: ids.company, role: 'owner' }, process.env.JWT_SECRET) } : {};
const count = async table => (await db.query(`SELECT * FROM ${table}`)).rows.length;
async function seed() {
  await db.exec(`TRUNCATE users, projects, time_entries, voice_notes, voice_processing_receipts;
    INSERT INTO users VALUES('${ids.actor}','${ids.company}',TRUE),('${ids.other}','${ids.company}',TRUE),('${ids.foreign}','${ids.outside}',TRUE);
    INSERT INTO projects VALUES('${ids.project}','${ids.company}'),('${ids.otherProject}','${ids.company}'),('${ids.foreignProject}','${ids.outside}');
    INSERT INTO time_entries VALUES('${ids.entry}','${ids.actor}','${ids.project}'),('${ids.otherEntry}','${ids.actor}','${ids.project}'),('${ids.foreignEntry}','${ids.other}','${ids.project}');`);
}
before(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE users(id UUID PRIMARY KEY, company_id UUID, is_active BOOLEAN);
    CREATE TABLE projects(id UUID PRIMARY KEY, company_id UUID);
    CREATE TABLE time_entries(id UUID PRIMARY KEY, user_id UUID, project_id UUID);
    CREATE TABLE voice_notes(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID, user_id UUID, project_id UUID,
      time_entry_id UUID, audio_url TEXT, transcript TEXT, duration_seconds INTEGER, taken_at TIMESTAMPTZ,
      folder_path TEXT, metadata JSONB, structured_data JSONB, client_summary TEXT);`);
  await db.exec(migration); await db.exec(migration);
  const app = express(); app.use(express.json()); app.use('/voice', require('../src/routes/voiceRoutes').default);
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/voice`;
});
beforeEach(async () => {
  uploads = models = 0; statements = []; failComplete = failInsert = failClaim = failUncertain = false; failCommit = null;
  process.env.OPENAI_API_KEY = 'local-stub-only';
  process.env.CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_SECRET = 'local-stub-only';
  provider = async () => ({ secure_url: 'https://example.test/voice.m4a', duration: 8.7 });
  model = async () => outcome();
  await seed();
});
after(async () => { await new Promise(resolve => server.close(resolve)); await db.close(); await pool.end(); });
async function audio({ actor = 'actor', requestKey = key, bytes = 'local fake audio', name = 'voice.m4a', mime = 'audio/mp4', fields = {} } = {}) {
  const body = new FormData(); body.set('projectId', ids.project); body.set('transcribe', 'false');
  if (requestKey !== undefined && requestKey !== null) body.set('requestKey', requestKey);
  for (const [name, value] of Object.entries(fields)) body.set(name, value);
  body.set('audio', new Blob([bytes], { type: mime }), name);
  const response = await fetch(base + '/process', { method: 'POST', headers: auth(actor), body });
  return { status: response.status, data: await response.json() };
}
async function transcript({ actor = 'actor', requestKey = key, fields = {} } = {}) {
  const response = await fetch(base + '/process-transcript', { method: 'POST', headers: { ...auth(actor), 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: ids.project, transcript: 'Original transcript', ...(requestKey !== null ? { requestKey } : {}), ...fields }) });
  return { status: response.status, data: await response.json() };
}
async function status(actor = 'actor', requestKey = key) {
  const response = await fetch(base + '/requests/' + requestKey, { headers: auth(actor) });
  return { status: response.status, data: await response.json() };
}
async function until(condition) {
  for (let i = 0; i < 200; i++) { if (condition()) return; await new Promise(resolve => setTimeout(resolve, 5)); }
  throw Error('Fixture did not reach expected state');
}

test('audio-only completion persists identity and recovers the same note with no extra upload or model', async () => {
  const first = await audio({ fields: { timeEntryId: ids.entry, userId: ids.other } });
  assert.equal(first.status, 200); assert.equal(first.data.transcriptionStatus, 'skipped');
  assert.equal(first.data.transcript, null); assert.equal(first.data.duration, 9);
  assert.equal(first.data.requestKey, key); assert.equal(first.data.state, 'completed');
  assert.deepEqual(first.data.receiptIdentity, { actorId: ids.actor, companyId: ids.company, projectId: ids.project, timeEntryId: ids.entry, mode: 'audio-only' });
  assert.deepEqual((await status()).data, first.data);
  assert.deepEqual((await audio({ fields: { timeEntryId: ids.entry } })).data, first.data);
  assert.equal(uploads, 1); assert.equal(models, 0); assert.equal(await count('voice_notes'), 1);
  assert.equal(await count('voice_processing_receipts'), 1);
  assert.ok(statements.some(sql => sql.includes('FOR SHARE')));
  assert.ok(statements.some(sql => sql.includes('FOR UPDATE')));
  const row = (await db.query('SELECT * FROM voice_notes')).rows[0];
  assert.equal(row.user_id, ids.actor); assert.equal(row.time_entry_id, ids.entry); assert.equal(row.structured_data, null);
  assert.equal(statements.some(sql => /(?:UPDATE|INSERT INTO|DELETE FROM) time_entries/.test(sql)), false);
  await db.exec(migration); assert.deepEqual((await status()).data, first.data);
});
test('transcribed audio and transcript-only replay without calling their services again', async () => {
  for (const send of [() => audio({ fields: { transcribe: 'true' } }), () => transcript({ fields: { timeEntryId: ids.entry } })]) {
    await seed(); uploads = models = 0;
    const first = await send(); assert.equal(first.status, 200); assert.equal(first.data.transcript, 'Saved transcript');
    assert.deepEqual((await send()).data, first.data); assert.deepEqual((await status()).data, first.data);
    assert.equal(models, 1); assert.equal(await count('voice_notes'), 1);
    assert.equal(uploads, first.data.receiptIdentity.mode === 'transcript' ? 0 : 1);
  }
});
test('durable claim is committed before providers and simultaneous duplicates stay processing', async () => {
  for (const kind of ['audio', 'transcript']) {
    await seed(); uploads = models = 0;
    let finish;
    const hold = async () => {
      const row = (await db.query('SELECT state FROM voice_processing_receipts')).rows[0];
      assert.equal(row.state, 'processing'); assert.equal(statements.at(-1), 'COMMIT');
      return new Promise(resolve => { finish = resolve; });
    };
    if (kind === 'audio') provider = hold; else model = hold;
    const send = kind === 'audio' ? audio : transcript;
    const first = send(); await until(() => !!finish);
    const duplicate = await send(); assert.equal(duplicate.status, 202); assert.equal(duplicate.data.state, 'processing');
    assert.equal(duplicate.data.retryAllowed, false); assert.equal((await status()).status, 202);
    assert.equal(uploads + models, 1);
    finish(kind === 'audio' ? { secure_url: 'https://example.test/audio', duration: 1 } : outcome());
    assert.equal((await first).status, 200); assert.equal((await status()).status, 200); assert.equal(await count('voice_notes'), 1);
  }
});
test('bytes, filename, mime, project, owned shift, and processing mode are bound to one key', async () => {
  assert.equal((await audio()).status, 200);
  for (const change of [{ bytes: 'different' }, { name: 'other.m4a' }, { mime: 'audio/aac' },
    { fields: { projectId: ids.otherProject } }, { fields: { timeEntryId: ids.entry } }, { fields: { transcribe: 'true' } }]) {
    const result = await audio(change); assert.equal(result.status, 409); assert.equal(result.data.retryAllowed, false);
  }
  assert.equal((await transcript()).status, 409); assert.equal(uploads, 1); assert.equal(models, 0);
});
test('transcript fingerprint binds exact input and prevents switching back to audio', async () => {
  await transcript({ fields: { timeEntryId: ids.entry } });
  for (const fields of [{ timeEntryId: ids.entry, transcript: 'Original transcript ' }, { timeEntryId: ids.otherEntry }, { projectId: ids.otherProject }]) {
    assert.equal((await transcript({ fields })).status, 409);
  }
  assert.equal((await audio()).status, 409); assert.equal(models, 1); assert.equal(uploads, 0);
});
test('completed audio replay works with providers disabled; unconfigured new claims roll back', async () => {
  const first = await audio({ fields: { transcribe: 'true' } });
  delete process.env.OPENAI_API_KEY; delete process.env.CLOUDINARY_API_KEY;
  assert.deepEqual((await audio({ fields: { transcribe: 'true' } })).data, first.data);
  assert.equal((await audio({ requestKey: key + '-new' })).status, 503);
  assert.equal(await count('voice_processing_receipts'), 1); assert.equal(uploads, 1); assert.equal(models, 1);
});
test('ambiguous storage or service failure stays uncertain and never reruns work', async () => {
  for (const kind of ['upload', 'audio-model', 'transcript']) {
    await seed(); uploads = models = 0;
    provider = async () => { if (kind === 'upload') throw Error('ambiguous upload'); return { secure_url: 'https://example.test/audio' }; };
    model = async () => { throw Error('ambiguous service'); };
    const send = kind === 'transcript' ? transcript : () => audio({ fields: { transcribe: 'true' } });
    const result = await send(); assert.equal(result.status, 500); assert.equal(result.data.retryAllowed, false);
    assert.equal((await status()).data.state, 'uncertain'); assert.equal((await send()).status, 202);
    assert.equal(uploads, kind === 'transcript' ? 0 : 1); assert.equal(models, kind === 'upload' ? 0 : 1);
    assert.equal(await count('voice_notes'), 0);
  }
});
test('note insert and receipt completion failures roll back and block new provider work', async () => {
  for (const kind of ['insert', 'complete']) {
    await seed(); uploads = models = 0;
    failInsert = kind === 'insert'; failComplete = kind === 'complete';
    assert.equal((await transcript()).status, 500); assert.equal(await count('voice_notes'), 0);
    failInsert = failComplete = false;
    assert.equal((await status()).data.state, 'uncertain'); assert.equal((await transcript()).status, 202);
    assert.equal(models, 1); assert.ok(statements.includes('ROLLBACK'));
  }
});
test('claim persistence failure never starts providers and missing status does not grant retry', async () => {
  failClaim = true;
  const result = await audio(); assert.equal(result.status, 500); assert.equal(result.data.retryAllowed, false);
  failClaim = false;
  assert.equal(uploads + models, 0); assert.equal(await count('voice_notes'), 0); assert.equal(await count('voice_processing_receipts'), 0);
  const absent = await status(); assert.equal(absent.status, 404); assert.equal(absent.data.retryAllowed, false);
});
test('failure to save uncertainty leaves a blocking processing claim rather than repeating providers', async () => {
  failUncertain = true; model = async () => { throw Error('ambiguous service'); };
  assert.equal((await transcript()).status, 500); failUncertain = false;
  const current = await status(); assert.equal(current.status, 202); assert.equal(current.data.state, 'processing');
  assert.equal(current.data.retryAllowed, false); assert.equal((await transcript()).status, 202); assert.equal(models, 1);
});
test('lost completion COMMIT acknowledgment retains the committed note and recoverable response', async () => {
  failCommit = 'complete'; const first = await audio(); assert.equal(first.status, 500); assert.equal(first.data.retryAllowed, false);
  failCommit = null; const recovered = await status(); assert.equal(recovered.status, 200); assert.equal(recovered.data.state, 'completed');
  assert.deepEqual((await audio()).data, recovered.data); assert.equal(uploads, 1); assert.equal(await count('voice_notes'), 1);
});
test('lost claim acknowledgment or old processing receipt never permits automatic provider replay', async () => {
  failCommit = 'claim'; assert.equal((await transcript()).status, 500); failCommit = null;
  assert.equal(models, 0); assert.equal((await status()).data.state, 'processing');
  await db.exec("UPDATE voice_processing_receipts SET created_at=now()-interval '30 days'");
  assert.equal((await transcript()).status, 202); assert.equal(models, 0);
});
test('actor/company scoping ignores forged token roles and isolates the same key', async () => {
  const a = await transcript(); assert.equal((await status('other')).status, 404); assert.equal((await status('foreign')).status, 404);
  const b = await transcript({ actor: 'other' });
  const c = await transcript({ actor: 'foreign', fields: { projectId: ids.foreignProject } });
  assert.equal(b.status, 200); assert.equal(c.status, 200);
  assert.equal(new Set([a.data.voiceNoteId, b.data.voiceNoteId, c.data.voiceNoteId]).size, 3);
  assert.equal((await status('other')).data.voiceNoteId, b.data.voiceNoteId);
  assert.equal((await status('foreign')).data.voiceNoteId, c.data.voiceNoteId); assert.equal(models, 3);
});
test('status and replay reject revoked users, company/project moves and shift ownership changes', async () => {
  for (const [change, expected] of [
    [`UPDATE users SET is_active=FALSE WHERE id='${ids.actor}'`, 401],
    [`UPDATE users SET company_id='${ids.outside}' WHERE id='${ids.actor}'`, 404],
    [`UPDATE projects SET company_id='${ids.outside}' WHERE id='${ids.project}'`, 404],
    [`UPDATE time_entries SET user_id='${ids.other}' WHERE id='${ids.entry}'`, 403],
    [`UPDATE time_entries SET project_id='${ids.otherProject}' WHERE id='${ids.entry}'`, 403],
  ]) {
    await seed(); models = 0; await transcript({ fields: { timeEntryId: ids.entry } }); await db.exec(change);
    const result = await status(); assert.equal(result.status, expected); assert.equal(result.data.retryAllowed, false);
    assert.notEqual((await transcript({ fields: { timeEntryId: ids.entry } })).status, 200); assert.equal(models, 1);
  }
});
test('permission changes during provider work prevent note commit with locked revalidation', async () => {
  for (const change of [
    `UPDATE users SET is_active=FALSE WHERE id='${ids.actor}'`,
    `UPDATE users SET company_id='${ids.outside}' WHERE id='${ids.actor}'`,
    `UPDATE projects SET company_id='${ids.outside}' WHERE id='${ids.project}'`,
    `UPDATE time_entries SET user_id='${ids.other}' WHERE id='${ids.entry}'`,
    `UPDATE time_entries SET project_id='${ids.otherProject}' WHERE id='${ids.entry}'`,
  ]) {
    await seed(); model = async () => { await db.exec(change); return outcome(); };
    assert.equal((await transcript({ fields: { timeEntryId: ids.entry } })).status, 500);
    assert.equal(await count('voice_notes'), 0);
    assert.equal((await db.query('SELECT state FROM voice_processing_receipts')).rows[0].state, 'uncertain');
  }
  assert.ok(statements.some(sql => sql.includes('FROM time_entries') && sql.includes('FOR SHARE')));
});
test('deleted or reassigned completed notes cannot be disclosed or resurrected', async () => {
  for (const change of ['DELETE FROM voice_notes', `UPDATE voice_notes SET user_id='${ids.other}'`,
    `UPDATE voice_notes SET company_id='${ids.outside}'`, `UPDATE voice_notes SET project_id='${ids.otherProject}'`,
    `UPDATE voice_notes SET time_entry_id='${ids.entry}'`]) {
    await seed(); models = 0; await transcript(); await db.exec(change);
    assert.equal((await status()).status, 410); assert.equal((await transcript()).status, 410); assert.equal(models, 1);
  }
});
test('invalid keys and missing status never imply retry permission; legacy clients create no receipts', async () => {
  const absent = await status(); assert.equal(absent.status, 404); assert.equal(absent.data.retryAllowed, false);
  for (const requestKey of ['', 'short', 'x'.repeat(101), 'invalid key with spaces']) {
    assert.equal((await audio({ requestKey })).status, 400); assert.equal((await transcript({ requestKey })).status, 400);
  }
  assert.equal(uploads + models, 0); assert.equal(await count('voice_processing_receipts'), 0);
  assert.equal((await status('actor', 'short')).status, 400); assert.equal((await status(null)).status, 401);
  const a = await audio({ requestKey: null }), b = await transcript({ requestKey: null });
  assert.equal(a.status, 200); assert.equal(b.status, 200); assert.equal(a.data.requestKey, undefined); assert.equal(b.data.requestKey, undefined);
  assert.equal(await count('voice_processing_receipts'), 0); assert.equal(await count('voice_notes'), 2);
});
test('legacy requests still work before receipt migration, while keyed requests fail closed', async () => {
  await db.exec('DROP TABLE voice_processing_receipts');
  try {
    assert.equal((await audio({ requestKey: null })).status, 200);
    assert.equal((await transcript({ requestKey: null })).status, 200);
    assert.equal(uploads, 1); assert.equal(models, 1);
    const keyed = await audio(); assert.equal(keyed.status, 500); assert.equal(keyed.data.retryAllowed, false);
    assert.equal(uploads, 1); assert.equal(models, 1); assert.equal(await count('voice_notes'), 2);
  } finally { await db.exec(migration); }
});
test('unauthorized targets, spoofed ownership and invalid payloads fail before providers or claims', async () => {
  for (const send of [() => audio({ actor: null }), () => transcript({ actor: null }),
    () => audio({ fields: { projectId: ids.foreignProject } }), () => transcript({ fields: { projectId: ids.foreignProject } }),
    () => audio({ fields: { timeEntryId: ids.foreignEntry } }), () => transcript({ fields: { timeEntryId: ids.foreignEntry } }),
    () => audio({ fields: { transcribe: 'False' } }), () => transcript({ fields: { transcript: ' ' } }),
    () => transcript({ fields: { projectId: {} } }), () => transcript({ fields: { timeEntryId: {} } }),
    () => transcript({ fields: { timeEntryId: [ids.entry] } })]) {
    assert.ok((await send()).status >= 400);
  }
  assert.equal(uploads + models, 0); assert.equal(await count('voice_processing_receipts'), 0);
});
test('voice migration runner verifies additive receipts and rolls back failed verification', async () => {
  const { migrate } = require('../scripts/runVoiceNoteMigration.js');
  const { steps } = require('../scripts/run-release-predeploy.cjs'); assert.ok(steps.includes('runVoiceNoteMigration.js'));
  const isolated = new PGlite();
  try {
    await isolated.exec(`CREATE TABLE companies(id UUID PRIMARY KEY); CREATE TABLE users(id UUID PRIMARY KEY,company_id UUID);
      CREATE TABLE voice_notes(id UUID PRIMARY KEY,user_id UUID,project_id UUID,audio_s3_key TEXT NOT NULL);`);
    const calls = [];
    const adapter = { query: async sql => { calls.push(sql); return (await isolated.exec(sql)).at(-1); } };
    await migrate(adapter); await migrate(adapter);
    assert.ok(calls.some(sql => sql.includes('FROM voice_processing_receipts LIMIT 0')));
    assert.equal(calls.at(-1), 'COMMIT');
    await isolated.exec('DROP TABLE voice_processing_receipts');
    await assert.rejects(migrate({ query: async sql => {
      if (sql.includes('FROM voice_processing_receipts LIMIT 0')) throw Error('verification failed');
      return adapter.query(sql);
    } }), /verification failed/);
    assert.equal(calls.at(-1), 'ROLLBACK');
    await assert.rejects(isolated.query('SELECT * FROM voice_processing_receipts'), /does not exist/);
    await migrate(adapter);
    await isolated.query('SELECT * FROM voice_processing_receipts');
  } finally { await isolated.close(); }
});
