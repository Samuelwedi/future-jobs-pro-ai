const fs = require('node:fs');
const path = require('node:path');

async function migrate(client) {
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL statement_timeout = '60s'");
    // Core PostgreSQL provides this function; never install extensions during deployment.
    try { await client.query('SELECT gen_random_uuid() AS attachment_uuid_prerequisite'); }
    catch (error) { throw new Error('Attachment schema requires gen_random_uuid(); ask the database owner to provide it before deploying.', {cause:error}); }
    await client.query(fs.readFileSync(path.join(__dirname, '../migrations/20261111_attachment_schema.sql'), 'utf8'));
    // CREATE TABLE IF NOT EXISTS does not repair an incompatible existing table.
    // Verify every attachment field consumed by the API before allowing deployment.
    await client.query('SELECT id, company_id, uploaded_by, shift_id, time_entry_id, project_id, task_id, subject_user_id, file_name, file_url, file_type, file_size, category, created_at FROM attachments LIMIT 0');
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
    console.log('Attachment schema completed and verified.');
  } finally {
    if (client) client.release();
    await pool.end();
  }
}
if (require.main === module) main().catch(error => {
  console.error('Attachment schema migration failed; deployment stopped.', error.message);
  process.exitCode = 1;
});
module.exports = {migrate};
