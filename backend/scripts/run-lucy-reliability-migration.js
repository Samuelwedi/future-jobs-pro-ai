const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: local ? false : { rejectUnauthorized: false } });
  await client.connect();
  try {
    const sql = fs.readFileSync(path.join(__dirname, '../migrations/20260915_lucy_reliability_core.sql'), 'utf8');
    await client.query(sql);
    console.log('Lucy reliability schema is ready.');
  } finally { await client.end(); }
}

main().catch((error) => { console.error(error.message); process.exit(1); });
