const fs = require('node:fs');
const path = require('node:path');

async function migrate(client) {
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL statement_timeout = '60s'");
    // Core PostgreSQL provides this function; never install extensions during deployment.
    try { await client.query('SELECT gen_random_uuid() AS task_evidence_uuid_prerequisite'); }
    catch (error) { throw new Error('Task evidence schema requires gen_random_uuid(); ask the database owner to provide it before deploying.', {cause:error}); }
    await client.query(fs.readFileSync(path.join(__dirname, '../migrations/20261111_task_evidence.sql'), 'utf8'));
    // CREATE TABLE IF NOT EXISTS does not repair an incompatible existing table.
    // Verify every task evidence field consumed by the API before allowing deployment.
    await client.query('SELECT id, task_id, company_id, uploaded_by, request_key, fingerprint, state, note, file_name, file_type, file_size, private_id, created_at FROM task_evidence LIMIT 0');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  const {pool} = require('../dist/config/database');
  let client;
  try {
    client = await pool.connect();
    await migrate(client);
    console.log('Task evidence schema completed and verified.');
  } finally {
    if (client) client.release();
    await pool.end();
  }
}
if (require.main === module) main().catch(error => {
  console.error('Task evidence schema migration failed; deployment stopped.', error.message);
  process.exitCode = 1;
});
module.exports = {migrate};
