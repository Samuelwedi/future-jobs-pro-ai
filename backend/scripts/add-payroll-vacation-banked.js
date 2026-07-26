const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) require('dotenv').config({ path: envPath });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sql = `
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS vacation_hours DECIMAL(10,2) DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS banked_hours DECIMAL(10,2) DEFAULT 0;
`;

async function run() {
  const client = await pool.connect();
  try {
    console.log('🔄 Adding vacation and banked hours columns...');
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