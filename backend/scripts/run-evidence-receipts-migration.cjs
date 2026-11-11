const fs = require('node:fs');
const path = require('node:path');

async function migrate(client) {
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL statement_timeout = '60s'");
    await client.query(fs.readFileSync(path.join(__dirname, '../migrations/20261109_evidence_receipts.sql'), 'utf8'));
    await client.query('SELECT company_id, actor_id, request_key, fingerprint, user_id, project_id, time_entry_id, state, response FROM evidence_upload_receipts LIMIT 0');
    await client.query(fs.readFileSync(path.join(__dirname, '../migrations/20261111_attachment_receipts.sql'), 'utf8'));
    await client.query('SELECT company_id, actor_id, request_key, fingerprint, target, state, response FROM attachment_upload_receipts LIMIT 0');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  const { pool } = require('../dist/config/database');
  let client;
  try {
    client = await pool.connect();
    await migrate(client);
    console.log('Evidence receipt schema completed and verified.');
  } finally {
    if (client) client.release();
    await pool.end();
  }
}
if (require.main === module) main().catch(() => {
  console.error('Evidence receipt migration failed; deployment stopped.');
  process.exitCode = 1;
});
module.exports = { migrate };
