require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS address TEXT;`);
    console.log('✅ Column "address" added to projects table (or already exists).');
  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await pool.end();
  }
})();