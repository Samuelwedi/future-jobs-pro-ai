require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS temperature_unit TEXT DEFAULT 'celsius';`);
    console.log('✅ temperature_unit added to companies');

    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_pic TEXT;`);
    console.log('✅ profile_pic added to users');

    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS needs_password_change BOOLEAN DEFAULT false;`);
    console.log('✅ needs_password_change added to users');

  } catch (err) { console.error(err); }
  finally { await pool.end(); }
})();