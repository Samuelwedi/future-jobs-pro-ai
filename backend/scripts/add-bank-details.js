const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) require('dotenv').config({ path: envPath });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sql = `
ALTER TABLE users
ADD COLUMN IF NOT EXISTS bank_routing_number VARCHAR(9),
ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(17),
ADD COLUMN IF NOT EXISTS bank_account_type VARCHAR(10) DEFAULT 'checking', -- checking, savings
ADD COLUMN IF NOT EXISTS bank_account_holder VARCHAR(255);
`;

async function run() {
  const client = await pool.connect();
  try {
    console.log('🔄 Adding bank details columns to users...');
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