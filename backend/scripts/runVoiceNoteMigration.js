const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
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
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('futurejobs-release-migration'))");
    const sql = fs.readFileSync(path.join(__dirname, '../migrations/20261021_voice_note_schema.sql'), 'utf8');
    await client.query(sql.replace(/^BEGIN;\s*$/gm, '').replace(/^COMMIT;\s*$/gm, ''));
    const result = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'voice_notes'");
    const names = new Set(result.rows.map(row => row.column_name));
    for (const name of ['metadata', 'structured_data', 'client_summary', 'audio_url', 'company_id']) {
      if (!names.has(name)) throw new Error('Missing voice_notes column: ' + name);
    }
    await client.query('COMMIT');
    console.log('Voice-note schema migration completed and verified.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { await client.end(); }
}
main().catch(error => { console.error('Voice-note migration failed:', error.message); process.exitCode = 1; });
