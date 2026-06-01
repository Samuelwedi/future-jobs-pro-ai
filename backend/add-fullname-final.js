const { Pool } = require('pg');
const DATABASE_URL = 'postgresql://postgres:fFhIpSkiVKmHhAmQcQoSudrksWdXuGMQ@centerbeam.proxy.rlwy.net:47967/railway';
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function fix() {
  try {
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255)');
    console.log('✅ full_name column added or already exists');
    await pool.query("UPDATE users SET full_name = COALESCE(first_name || ' ' || last_name, 'Unknown') WHERE full_name IS NULL");
    console.log('✅ full_name values populated');
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await pool.end();
  }
}
fix();