const { Pool } = require('pg');
const DATABASE_URL = 'postgresql://postgres:fFhIpSkiVKmHhAmQcQoSudrksWdXuGMQ@centerbeam.proxy.rlwy.net:47967/railway';
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