const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
async function migrate(client) {
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('futurejobs-release-migration'))");
    for (const migration of ['20261021_voice_note_schema.sql', '20261111_voice_transcript_edits.sql', '20261111_voice_receipts.sql']) {
      const sql = fs.readFileSync(path.join(__dirname, '../migrations', migration), 'utf8');
      await client.query(sql.replace(/^BEGIN;\s*$/gm, '').replace(/^COMMIT;\s*$/gm, ''));
    }
    const result = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'voice_notes'");
    const names = new Set(result.rows.map(row => row.column_name));
    for (const name of ['metadata', 'structured_data', 'client_summary', 'audio_url', 'company_id', 'original_transcript', 'transcript_edited_at']) {
      if (!names.has(name)) throw new Error('Missing voice_notes column: ' + name);
    }
    await client.query('SELECT id, voice_note_id, actor_id, company_id, previous_transcript, transcript, created_at FROM voice_note_transcript_revisions LIMIT 0');
    await client.query('SELECT company_id, actor_id, request_key, fingerprint, target, state, response, created_at FROM voice_processing_receipts LIMIT 0');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const sslEnabled = process.env.DB_SSL ? process.env.DB_SSL.toLowerCase() !== 'false' : true;
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: sslEnabled ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' } : false,
    connectionTimeoutMillis: 10000,
    statement_timeout: 60000,
  });
  await client.connect();
  try {
    await migrate(client);
    console.log('Voice-note schema migration completed and verified.');
  } finally { await client.end(); }
}
if (require.main === module) main().catch(error => { console.error('Voice-note migration failed:', error.message); process.exitCode = 1; });

module.exports = { migrate };
