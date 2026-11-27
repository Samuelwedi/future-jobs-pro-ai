const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

process.env.TS_NODE_PROJECT = path.join(__dirname, '../tsconfig.json');
require('ts-node/register/transpile-only');

function stub(file, exports) {
  const id = require.resolve(file);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

const when = '2026-11-27T00:00:00Z';
const entry = { project_id: 'job-1', clock_in: when, created_at: when };
let snapshot;
stub('../src/services/gpsService', {
  generateBreadcrumbTrail: async () => ({points: []}),
  getArrivalConfidence: async () => ({confidence: 100}),
});
stub('../src/config/database', { pool: { query: async (sql, args) => {
  if (sql.includes('INSERT INTO dispute_evidence')) {
    snapshot = JSON.parse(args[3]);
    assert.equal(snapshot.verificationHash, args[4]);
    return {rowCount: 1};
  }
  assert.equal(args[0], 'entry-1');
  if (sql.includes('FROM voice_notes vn')) {
    assert.doesNotMatch(sql, /client_summary|structured_data|vn\.\*/);
    assert.match(sql, /u\.company_id = vn\.company_id/);
    return {rows: [
      {id:'recorded', transcript: 'Valve replacement was deferred.', client_summary:'Valve replaced.', duration_seconds: 12},
      {id:'no-transcript', transcript:' ', client_summary:'Work completed.', duration_seconds: 8},
    ]};
  }
  if (sql.includes('FROM photos')) return {rows: []};
  if (sql.includes('FROM time_entries')) return {rows: [entry]};
  assert.fail(sql);
}}});

const { buildDisputeEvidencePackage } = require('../src/services/disputeService');
test('new dispute snapshots store only recorded voice fields with explicit provenance', async () => {
  const result = await buildDisputeEvidencePackage('entry-1');
  const expected = [
    {id:'recorded', transcript:'Valve replacement was deferred.', duration_seconds:12, transcript_status:'stored_unverified'},
    {id:'no-transcript', transcript:null, duration_seconds:8, transcript_status:'unavailable'},
  ];
  assert.deepEqual(result.evidence.voiceNotes, expected);
  assert.deepEqual(snapshot.evidence.voiceNotes, expected);
  assert.doesNotMatch(JSON.stringify(snapshot), /Valve replaced|Work completed|client_summary/);
});
