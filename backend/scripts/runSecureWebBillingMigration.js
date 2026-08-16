const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost')
      ? undefined
      : { rejectUnauthorized: false },
  });

  const migration = fs.readFileSync(
    path.join(__dirname, '..', 'migrations', '20260816_secure_web_billing.sql'),
    'utf8',
  );

  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(migration);
    await client.query('COMMIT');
    console.log('Secure web-billing migration completed.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Secure web-billing migration failed:', error);
  process.exit(1);
});

