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
    const sql = fs.readFileSync(path.join(__dirname, '../migrations/20261111_project_archive.sql'), 'utf8');
    await client.query(sql.replace(/^BEGIN;\s*$/gm, '').replace(/^COMMIT;\s*$/gm, ''));
    await client.query('SELECT id, company_id, status, archived_at FROM projects LIMIT 0');
    await client.query('COMMIT');
    console.log('Project archive migration completed and verified.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { await client.end(); }
}
main().catch(error => { console.error('Project archive migration failed:', error.message); process.exitCode = 1; });
