const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const express = require('express');
const jwt = require('jsonwebtoken');
process.env.TS_NODE_PROJECT = path.join(__dirname, '../tsconfig.json');
process.env.JWT_SECRET = 'local-transcript-tests';
require('ts-node/register/transpile-only');
const { pool } = require('../src/config/database');
const voice = require('../src/services/voiceService');
const { v2: cloudinary } = require('cloudinary');
let providers = 0;
for (const name of ['processVoiceNote', 'processTranscriptOnly', 'transcribeAudio']) voice[name] = async () => { providers++; throw Error('No paid generation allowed'); };
cloudinary.uploader.upload = async () => { providers++; throw Error('No media upload allowed'); };
const ids = Object.fromEntries(['company', 'foreign', 'author', 'manager', 'outsider', 'project', 'note', 'shift'].map((name, i) => [name, `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`]));
let db, server, base, statements = [], failUpdate = false;
const migration = fs.readFileSync(path.join(__dirname, '../migrations/20261111_voice_transcript_edits.sql'), 'utf8');
async function query(sql, args) {
  statements.push(sql);
  if (failUpdate && /UPDATE voice_notes SET/.test(sql)) throw Error('Injected save failure');
  const result = await db.query(sql, args);
  return { ...result, rowCount: result.rows.length || result.affectedRows || 0 };
}
pool.connect = async () => ({ query, release() {} });
pool.query = query;
before(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE companies (id UUID PRIMARY KEY);
    CREATE TABLE users (id UUID PRIMARY KEY, company_id UUID, is_active BOOLEAN, role TEXT);
    CREATE TABLE projects (id UUID PRIMARY KEY, company_id UUID);
    CREATE TABLE time_entries (id UUID PRIMARY KEY, hours NUMERIC);
    CREATE TABLE voice_notes (id UUID PRIMARY KEY, user_id UUID, company_id UUID, project_id UUID,
      transcript TEXT, metadata JSONB, structured_data JSONB, client_summary TEXT, audio_url TEXT,
      time_entry_id UUID, duration_seconds INTEGER, taken_at TIMESTAMPTZ);`);
  await db.exec(migration);
  await db.exec(migration);
  const app = express(); app.use(express.json({ limit: '1mb' })); app.use('/voice', require('../src/routes/voiceRoutes').default);
  server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
  failUpdate = false; providers = 0;
  await db.exec('TRUNCATE voice_note_transcript_revisions, voice_notes, users, projects, companies, time_entries CASCADE');
  await db.query('INSERT INTO companies VALUES ($1),($2)', [ids.company, ids.foreign]);
  for (const [user, company, role] of [['author', 'company', 'worker'], ['manager', 'company', 'manager'], ['outsider', 'foreign', 'owner']]) {
    await db.query('INSERT INTO users VALUES ($1,$2,TRUE,$3)', [ids[user], ids[company], role]);
  }
  await db.query('INSERT INTO projects VALUES ($1,$2)', [ids.project, ids.company]);
  await db.query('INSERT INTO time_entries VALUES ($1,8)', [ids.shift]);
  await db.query(`INSERT INTO voice_notes (id,user_id,company_id,project_id,transcript,metadata,structured_data,client_summary,audio_url,time_entry_id,duration_seconds,taken_at)
    VALUES ($1,$2,$3,$4,'Original', '{"structured":{"hours":8},"tags":["old"],"transcriptionStatus":"completed","keep":"yes","client_summary":"old"}', '{"hours":8}', 'Old summary', 'https://example.test/original.m4a', $5, 31, '2026-01-01')`, [ids.note, ids.author, ids.company, ids.project, ids.shift]);
  statements = [];
});
after(async () => { if (server) await new Promise(r => server.close(r)); if (db) await db.close(); await pool.end(); });
async function patch(body = { transcript: 'Corrected', expectedTranscript: 'Original' }, user = 'author', noteId = ids.note) {
  const token = user ? jwt.sign({ id: ids[user], companyId: ids.company, role: 'owner' }, process.env.JWT_SECRET) : null;
  const result = await fetch(`${base}/voice/${noteId}/transcript`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  return { status: result.status, data: await result.json() };
}
async function note() { return (await db.query('SELECT * FROM voice_notes')).rows[0]; }
async function revisions() { return (await db.query('SELECT * FROM voice_note_transcript_revisions ORDER BY id')).rows; }
test('edits trim text, preserve original/audio/shift fields and durably audit without provider or time writes', async () => {
  const old = await note();
  const result = await patch({ transcript: '  Corrected  ', expectedTranscript: 'Original', userId: ids.manager, companyId: ids.foreign });
  assert.equal(result.status, 200);
  assert.deepEqual(result.data, { success: true, voiceNoteId: ids.note, transcript: 'Corrected', clientSummary: null, structuredData: null, tags: [], transcriptionStatus: 'edited' });
  let updated = await note();
  assert.equal(updated.original_transcript, 'Original'); assert.ok(updated.transcript_edited_at);
  assert.equal(updated.client_summary, null); assert.equal(updated.structured_data, null);
  assert.equal(updated.metadata.structured, null); assert.equal(updated.metadata.client_summary, null);
  assert.deepEqual(updated.metadata.tags, []); assert.equal(updated.metadata.transcriptionStatus, 'edited'); assert.equal(updated.metadata.keep, 'yes');
  for (const field of ['audio_url', 'time_entry_id', 'duration_seconds', 'taken_at', 'user_id', 'company_id', 'project_id']) assert.deepEqual(updated[field], old[field]);
  assert.equal((await patch({ transcript: 'Second correction', expectedTranscript: 'Corrected' })).status, 200);
  updated = await note(); assert.equal(updated.original_transcript, 'Original');
  const audit = await revisions(); assert.equal(audit.length, 2); assert.equal(audit[0].previous_transcript, 'Original'); assert.equal(audit[1].previous_transcript, 'Corrected');
  for (const row of audit) { assert.equal(row.actor_id, ids.author); assert.equal(row.company_id, ids.company); assert.ok(row.created_at); }
  assert.equal(providers, 0); assert.equal(statements.some(sql => /(?:UPDATE|INSERT INTO|DELETE FROM)\s+time_entries/i.test(sql)), false);
  assert.equal((await db.query('SELECT hours FROM time_entries')).rows[0].hours, '8');
});
test('stale edits conflict and exact retry does not create a revision or change edit time', async () => {
  assert.equal((await patch()).status, 200); const first = await note();
  assert.equal((await patch()).status, 200); assert.deepEqual((await note()).transcript_edited_at, first.transcript_edited_at); assert.equal((await revisions()).length, 1);
  assert.equal((await patch({ transcript: 'Other', expectedTranscript: 'Original' })).status, 409);
  assert.equal((await patch({ transcript: 'Corrected', expectedTranscript: 'unrelated' })).status, 409);
  assert.equal((await note()).transcript, 'Corrected'); assert.equal((await revisions()).length, 1);
});
test('current author only: forged role/company claims grant no manager or outsider access', async () => {
  for (const user of ['manager', 'outsider']) assert.equal((await patch(undefined, user)).status, 404);
  assert.equal((await patch(undefined, null)).status, 401); assert.equal((await revisions()).length, 0);
});
test('revalidates actor active state, company and project membership even on retry', async () => {
  assert.equal((await patch()).status, 200);
  await db.query('UPDATE users SET is_active = FALSE WHERE id = $1', [ids.author]); assert.equal((await patch()).status, 401);
  await db.query('UPDATE users SET is_active = TRUE, company_id = $2 WHERE id = $1', [ids.author, ids.foreign]); assert.equal((await patch()).status, 404);
  await db.query('UPDATE users SET company_id = $2 WHERE id = $1', [ids.author, ids.company]);
  await db.query('UPDATE projects SET company_id = $2 WHERE id = $1', [ids.project, ids.foreign]); assert.equal((await patch()).status, 404);
  await db.query('DELETE FROM projects'); assert.equal((await patch()).status, 404); assert.equal((await revisions()).length, 1);
});
test('validates strings, trimming and limits and requires expectedTranscript', async () => {
  for (const body of [{}, {transcript: ''}, {transcript: '  ', expectedTranscript: 'Original'}, {transcript: 42, expectedTranscript: 'Original'}, {transcript: 'x', expectedTranscript: null}, {transcript: 'x'.repeat(50001), expectedTranscript: 'Original'}]) assert.equal((await patch(body)).status, 400);
  assert.equal((await patch(undefined, 'author', 'bad-id')).status, 400);
  assert.equal((await revisions()).length, 0);
  assert.equal((await patch({ transcript: 'x'.repeat(50000), expectedTranscript: 'Original' })).status, 200);
});
test('NULL original from audio-only note survives subsequent edits and repeat migration', async () => {
  await db.query('UPDATE voice_notes SET transcript = NULL, metadata = NULL');
  assert.equal((await patch({ transcript: 'First text', expectedTranscript: '' })).status, 200);
  assert.equal((await patch({ transcript: 'Second text', expectedTranscript: 'First text' })).status, 200);
  await db.exec(migration); assert.equal((await note()).original_transcript, null);
  const audit = await revisions(); assert.equal(audit.length, 2); assert.equal(audit[0].previous_transcript, null); assert.equal(audit[1].previous_transcript, 'First text');
});
test('failed update rolls audit insertion back and retry can complete', async () => {
  failUpdate = true; assert.equal((await patch()).status, 500); failUpdate = false;
  assert.equal((await revisions()).length, 0); assert.equal((await note()).transcript, 'Original');
  assert.equal((await note()).transcript_edited_at, null); assert.equal((await patch()).status, 200);
});
test('release predeploy includes the additive transcript audit migration and checks its columns', () => {
  const { steps } = require('../scripts/run-release-predeploy.cjs');
  assert.ok(steps.includes('runVoiceNoteMigration.js'));
  const runner = fs.readFileSync(path.join(__dirname, '../scripts/runVoiceNoteMigration.js'), 'utf8');
  assert.match(runner, /20261111_voice_transcript_edits\.sql/);
  assert.match(runner, /'original_transcript', 'transcript_edited_at'/);
  assert.match(runner, /FROM voice_note_transcript_revisions LIMIT 0/);
});
async function readTranscript(user = 'author', noteId = ids.note) {
  const token = user ? jwt.sign({ id: ids[user], companyId: ids.company, role: 'owner' }, process.env.JWT_SECRET) : null;
  const result = await fetch(`${base}/voice/${noteId}/transcript`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: result.status, data: await result.json() };
}
test('GET reconciles the current baseline only, including NULL, without writes or derived data', async () => {
  let result = await readTranscript();
  assert.equal(result.status, 200);
  assert.deepEqual(result.data, { success: true, voiceNoteId: ids.note, transcript: 'Original' });
  assert.equal(statements.some(sql => /\b(UPDATE|INSERT|DELETE)\b/i.test(sql)), false);
  assert.equal((await patch()).status, 200);
  statements = [];
  result = await readTranscript();
  assert.deepEqual(result.data, { success: true, voiceNoteId: ids.note, transcript: 'Corrected' });
  assert.equal(statements.some(sql => /\b(UPDATE|INSERT|DELETE)\b/i.test(sql)), false);
  await db.query('UPDATE voice_notes SET transcript = NULL');
  assert.equal((await readTranscript()).data.transcript, null);
  assert.equal(providers, 0);
});
test('GET revalidates author, active actor, company and project; forged token claims confer no access', async () => {
  for (const user of ['manager', 'outsider']) assert.equal((await readTranscript(user)).status, 404);
  assert.equal((await readTranscript(null)).status, 401);
  assert.equal((await readTranscript('author', 'bad-id')).status, 400);
  assert.equal((await readTranscript('author', ids.shift)).status, 404);
  await db.query('UPDATE users SET is_active = FALSE WHERE id = $1', [ids.author]);
  assert.equal((await readTranscript()).status, 401);
  await db.query('UPDATE users SET is_active = TRUE, company_id = $2 WHERE id = $1', [ids.author, ids.foreign]);
  assert.equal((await readTranscript()).status, 404);
  await db.query('UPDATE users SET company_id = $2 WHERE id = $1', [ids.author, ids.company]);
  await db.query('UPDATE projects SET company_id = $2 WHERE id = $1', [ids.project, ids.foreign]);
  assert.equal((await readTranscript()).status, 404);
  await db.query('DELETE FROM projects');
  assert.equal((await readTranscript()).status, 404);
  assert.equal((await revisions()).length, 0);
  assert.equal(statements.some(sql => /\b(UPDATE|INSERT|DELETE)\b/i.test(sql)), false);
});
