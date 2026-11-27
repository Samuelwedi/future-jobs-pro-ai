const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const express = require('express');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

process.env.TS_NODE_PROJECT = path.join(__dirname, '../tsconfig.json');
require('ts-node/register/transpile-only');

function stub(file, exports) {
  const id = require.resolve(file);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

let base, server, mediaReads = 0;
const when = '2026-11-25T17:20:00.000Z';
const transcript = 'The valve repair was deferred. It was not completed.';
const falseSummary = 'The valve repair was completed.';

stub('../src/utils/auth', { verifyToken: req => ({ id: req.get('X-Fixture-Actor') }) });
stub('../src/services/evidenceMediaService', {});
stub('../src/config/database', { pool: { query: async (sql, args) => {
  if (sql.startsWith('SELECT id,company_id,role')) {
    const actors = {
      manager: { id: 'manager', company_id: 'a', role: 'manager' },
      employee: { id: 'employee', company_id: 'a', role: 'employee' },
      other: { id: 'other', company_id: 'b', role: 'manager' },
    };
    const actor = actors[args[0]];
    return actor ? { rowCount: 1, rows: [actor] } : { rowCount: 0, rows: [] };
  }
  if (sql.includes('FROM time_entries te')) {
    assert.equal(args[0], 'entry-a');
    if (args[1] !== 'a') return { rowCount: 0, rows: [] };
    return { rowCount: 1, rows: [{
      id: 'entry-a', project_name: 'Riverside Synthetic', clock_in: when,
      clock_out: '2026-11-25T18:20:00.000Z', employee_name: 'Worker Fixture', company_name: 'Company Fixture',
    }] };
  }
  if (sql.includes('FROM gps_tracking')) return { rows: [] };
  assert.deepEqual(args, ['entry-a', 'a']);
  if (sql.includes('FROM photos')) return { rows: [{ id: 'photo-a', taken_at: when, url: base + '/photo.png', file_type: 'photo' }] };
  if (sql.includes('FROM voice_notes')) return { rows: [
    { id: 'note-a', taken_at: when, url: base + '/audio.m4a', duration_seconds: 4, transcript, client_summary: falseSummary },
    { id: 'note-b', taken_at: when, url: null, duration_seconds: 2, transcript: '  ', client_summary: falseSummary },
  ] };
  if (sql.includes('FROM attachments')) return { rows: [] };
  throw new Error('Unexpected fixture query: ' + sql);
} } });

before(async () => {
  const app = express();
  app.use(express.json());
  app.get('/photo.png', (_req, res) => { mediaReads++; res.send(Buffer.from('photo fixture bytes')); });
  app.get('/audio.m4a', (_req, res) => { mediaReads++; res.send(Buffer.from('audio fixture bytes')); });
  app.use(require('../src/routes/evidenceBundleRoutes').default);
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
after(() => server && new Promise(resolve => server.close(resolve)));

async function download(actor, selection = {}) {
  return fetch(base + '/time-entry/entry-a/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Fixture-Actor': actor },
    body: JSON.stringify({ includeTimeEntryPdf: false, includeGpsVideo: false, includeVoiceVideos: false, ...selection }),
  });
}
async function inspect(res, visit) {
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/zip');
  const dir = mkdtempSync(path.join(tmpdir(), 'evidence-test-'));
  try {
    const filename = path.join(dir, 'download.zip');
    writeFileSync(filename, Buffer.from(await res.arrayBuffer()));
    execFileSync('unzip', ['-tq', filename]);
    visit(name => execFileSync('unzip', ['-p', filename, name]));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

test('actual downloaded ZIP leaves legacy summaries out and keeps unverified original transcript and source bytes', async () => {
  const res = await download('manager');
  await inspect(res, read => {
    const manifest = JSON.parse(read('manifest.json'));
    const { verificationHash, ...canonical } = manifest;
    assert.equal(verificationHash, sha(JSON.stringify(canonical)));
    assert.equal(res.headers.get('x-evidence-sha256'), verificationHash);
    assert.equal(manifest.timeEntry.clock_in, when);
    assert.equal(manifest.photos[0].id, 'photo-a');
    assert.equal(manifest.photos[0].taken_at, when);
    assert.deepEqual(manifest.voiceNotes[0], {
      id: 'note-a', taken_at: when, duration_seconds: 4, transcript, transcript_status: 'stored_unverified',
    });
    assert.equal(manifest.voiceNotes[1].transcript_status, 'unavailable');
    assert.equal(manifest.voiceNotes[1].transcript, null);
    assert.ok(!JSON.stringify(manifest).includes(falseSummary));
    assert.match(read('voice-notes/001-note-a.txt').toString(), /Stored transcript \(unverified\)/);
    assert.ok(read('voice-notes/001-note-a.txt').includes(transcript));
    assert.equal(read('voice-notes/002-note-b.txt').toString(), 'No transcript available.\n');
    assert.equal(read('photos/001-photo-a.png').toString(), 'photo fixture bytes');
    assert.equal(read('voice-notes/001-note-a.m4a').toString(), 'audio fixture bytes');
    const indexBytes = read('artifact-index.json');
    const seal = JSON.parse(read('package-seal.json'));
    assert.equal(seal.artifactIndexHash, sha(indexBytes));
    for (const item of JSON.parse(indexBytes).artifacts) assert.equal(item.sha256, sha(read(item.name)));
    assert.doesNotMatch(read('evidence-report.html').toString(), /PACKAGE GENERATED &amp; SEALED|Verified Worksite Evidence/);
  });
});

test('an intentionally omitted record is not reported as never attached or as completed work', async () => {
  await inspect(await download('manager', { photoIds: [] }), read => {
    const html = read('evidence-report.html').toString();
    assert.match(html, /0 of 1 available photo\/video records selected/);
    assert.match(html, /No supporting document records were found/);
    assert.match(html, /not whether job requirements were met/);
    assert.match(html, /not a signature or verification of field events/);
    assert.deepEqual(JSON.parse(read('manifest.json')).photos, []);
  });
});

test('another company or a non-manager cannot download the same ZIP or fetch its source media', async () => {
  const prior = mediaReads;
  for (const [actor, status] of [['other', 400], ['employee', 403]]) {
    const res = await download(actor);
    assert.equal(res.status, status);
    assert.equal(res.headers.get('content-disposition'), null);
    assert.equal((await res.json()).success, false);
  }
  assert.equal(mediaReads, prior);
});
