require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    await pool.query(`ALTER TABLE photos ADD COLUMN IF NOT EXISTS file_type TEXT DEFAULT 'image';`);
    console.log('✅ file_type column added to photos table');
  } catch (err) { console.error(err); }
  finally { await pool.end(); }
})();