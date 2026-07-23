const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) require('dotenv').config({ path: envPath });

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not set.');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sql = `
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS hourly_rate_used DECIMAL(10,2);
`;

async function run() {
  const client = await pool.connect();
  try {
    console.log('🔄 Adding hourly_rate_used column to payroll_items...');
    await client.query(sql);
    console.log('✅ Column added successfully.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run();