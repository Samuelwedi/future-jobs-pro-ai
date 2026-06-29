require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    await pool.query(`ALTER TABLE voice_notes ADD COLUMN IF NOT EXISTS taken_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();`);
    console.log('✅ taken_at column added to voice_notes');
  } catch (err) {
    console.error('❌ Migration error:', err);
  } finally {
    await pool.end();
  }
})();
