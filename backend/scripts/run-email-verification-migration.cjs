const fs = require('node:fs');
const path = require('node:path');

async function migrate(client) {
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL statement_timeout = '60s'");
    await client.query(fs.readFileSync(path.join(__dirname, '../migrations/20261031_email_verification.sql'), 'utf8'));
    await client.query('SELECT email_verified_at, email_verification_token_hash, email_verification_expires_at, email_verification_email FROM users LIMIT 0');
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
    console.log('Email verification schema completed and verified.');
  } finally {
    if (client) client.release();
    await pool.end();
  }
}
if (require.main === module) main().catch(() => {
  console.error('Email verification migration failed; deployment stopped.');
  process.exitCode = 1;
});
module.exports = { migrate };
