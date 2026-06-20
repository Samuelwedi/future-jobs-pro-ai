require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    console.log('🔧 Adding missing columns to user_behavior_patterns...');
    
    // Add avg_clock_in_time column
    await pool.query(`
      ALTER TABLE user_behavior_patterns 
      ADD COLUMN IF NOT EXISTS avg_clock_in_time TIME,
      ADD COLUMN IF NOT EXISTS avg_clock_out_time TIME,
      ADD COLUMN IF NOT EXISTS avg_duration_minutes INTEGER,
      ADD COLUMN IF NOT EXISTS preferred_projects TEXT[],
      ADD COLUMN IF NOT EXISTS preferred_weekdays INTEGER[]
    `);
    console.log('✅ user_behavior_patterns columns added successfully.');
  } catch (err) {
    console.error('❌ Migration error:', err);
  } finally {
    await pool.end();
  }
})();