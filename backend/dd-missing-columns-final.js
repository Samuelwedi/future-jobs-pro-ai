require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    // Add missing columns to user_behavior_patterns
    await pool.query(`
      ALTER TABLE user_behavior_patterns 
      ADD COLUMN IF NOT EXISTS avg_clock_in_time TIME,
      ADD COLUMN IF NOT EXISTS avg_clock_out_time TIME,
      ADD COLUMN IF NOT EXISTS avg_work_duration INTERVAL,
      ADD COLUMN IF NOT EXISTS preferred_weekday INTEGER,
      ADD COLUMN IF NOT EXISTS total_shifts INTEGER DEFAULT 0;
    `);
    console.log('✅ user_behavior_patterns columns added (or already exist)');

    // Add push_token column to notifications table (if exists)
    await pool.query(`
      ALTER TABLE notifications 
      ADD COLUMN IF NOT EXISTS push_token TEXT,
      ADD COLUMN IF NOT EXISTS push_token_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    `);
    console.log('✅ notifications columns added (or already exist)');

    // Add any other missing columns (like team table)
    await pool.query(`
      ALTER TABLE team_members 
      ADD COLUMN IF NOT EXISTS invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    `);
    console.log('✅ team_members columns added (or already exist)');

  } catch (err) {
    console.error('❌ Migration error:', err);
  } finally {
    await pool.end();
  }
})();