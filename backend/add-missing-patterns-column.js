require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    await pool.query(`ALTER TABLE user_behavior_patterns ADD COLUMN IF NOT EXISTS last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW();`);
    console.log('✅ last_updated column added to user_behavior_patterns');
  } catch (err) {
    console.error('❌ Migration error:', err);
  } finally {
    await pool.end();
  }
})();