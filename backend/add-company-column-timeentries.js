const { Pool } = require('pg');
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  try {
    await pool.query('ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id)');
    console.log('✅ company_id column added to time_entries (or already exists).');
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await pool.end();
  }
}

run();