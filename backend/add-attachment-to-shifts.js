require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    await pool.query(`ALTER TABLE shifts ADD COLUMN IF NOT EXISTS attachment_url TEXT;`);
    await pool.query(`ALTER TABLE shifts ADD COLUMN IF NOT EXISTS attachment_type TEXT;`);
    console.log('✅ attachment_url and attachment_type columns added to shifts');
  } catch (err) {
    console.error('❌ Migration error:', err);
  } finally {
    await pool.end();
  }
})();