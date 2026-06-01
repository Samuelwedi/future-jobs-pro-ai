const { Pool } = require('pg');
const DATABASE_URL = 'postgresql://postgres:fFhIpSkiVKmHhAmQcQoSudrksWdXuGMQ@centerbeam.proxy.rlwy.net:47967/railway';
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function addColumn() {
  try {
    // 1. Add the column
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255)');
    console.log('✅ Column added (or already exists)');

    // 2. Fill with default value for existing rows
    await pool.query("UPDATE users SET full_name = COALESCE(first_name || ' ' || last_name, email) WHERE full_name IS NULL");
    console.log('✅ Values populated');
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await pool.end();
  }
}

addColumn();