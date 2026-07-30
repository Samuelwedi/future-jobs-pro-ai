const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

// Load .env from backend root
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) require('dotenv').config({ path: envPath });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sql = `
ALTER TABLE users ADD COLUMN IF NOT EXISTS employment_type VARCHAR(50) DEFAULT 'EMPLOYEE';
ALTER TABLE users ADD COLUMN IF NOT EXISTS province VARCHAR(10) DEFAULT '';
`;

async function run() {
  const client = await pool.connect();
  try {
    console.log('🔄 Adding employment_type and province columns to users...');
    await client.query(sql);
    console.log('✅ Migration completed.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run();