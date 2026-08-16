require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  try {
    const sql = fs.readFileSync(
      path.join(__dirname, '../migrations/20260816_photo_compliance.sql'),
      'utf8',
    );
    await client.query(sql);
    console.log('Photo compliance migration completed.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Photo compliance migration failed:', error);
  process.exit(1);
});
