require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  try {
    const sql = fs.readFileSync(
      path.join(__dirname, '../migrations/20260816_integration_environments.sql'),
      'utf8',
    );
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('Integration-environment migration completed.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error('Integration-environment migration failed:', error.message);
  process.exit(1);
});
