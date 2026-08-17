const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    const sql = fs.readFileSync(path.join(__dirname, '../migrations/20260817_apple_iap.sql'), 'utf8');
    await client.query(sql);
    console.log('Apple IAP migration completed.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Apple IAP migration failed:', error);
  process.exit(1);
});
