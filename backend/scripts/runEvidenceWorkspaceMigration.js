require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined });
  await client.connect();
  try {
    const sql = fs.readFileSync(path.join(__dirname, '../migrations/20260814_evidence_notifications_attachments.sql'), 'utf8');
    await client.query(sql);
    console.log('Evidence, attachment, and notification migration completed.');
  } finally { await client.end(); }
}
main().catch((error) => { console.error(error); process.exit(1); });
