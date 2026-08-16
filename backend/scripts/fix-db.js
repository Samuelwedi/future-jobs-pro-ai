// backend/scripts/fix-db.js
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { throw new Error('DATABASE_URL is required'); }

const pool = new Pool({ connectionString: DATABASE_URL });

const commands = [
  // 1. Add time_entry_id column (safe – supports IF NOT EXISTS)
  `ALTER TABLE gps_tracking ADD COLUMN IF NOT EXISTS time_entry_id UUID;`,

  // 2. Create indexes (safe – supports IF NOT EXISTS)
  `CREATE INDEX IF NOT EXISTS idx_gps_tracking_user_time ON gps_tracking(user_id, timestamp);`,
  `CREATE INDEX IF NOT EXISTS idx_gps_tracking_time_entry ON gps_tracking(time_entry_id);`,

  // 3. Remove duplicates from user_behavior_patterns
  `DELETE FROM user_behavior_patterns a USING user_behavior_patterns b
    WHERE a.user_id = b.user_id AND a.ctid < b.ctid;`,

  // 4. Add unique constraint (no IF NOT EXISTS – we'll catch the error)
  `ALTER TABLE user_behavior_patterns ADD CONSTRAINT unique_user_id UNIQUE (user_id);`
];

async function runMigrations() {
  const client = await pool.connect();
  try {
    console.log('🔄 Running database fixes...');
    for (const sql of commands) {
      try {
        await client.query(sql);
        console.log(`✅ Executed: ${sql.substring(0, 60)}...`);
      } catch (err) {
        // Ignore known "already exists" errors
        if (
          err.code === '42701' || // duplicate column
          err.code === '42P07' || // duplicate table/index/constraint
          err.code === '23505'    // unique violation (if duplicates remain)
        ) {
          console.log(`ℹ️ Skipped (already exists or constraint violation): ${sql.substring(0, 60)}...`);
        } else {
          throw err; // unexpected error
        }
      }
    }
    console.log('✅ All fixes applied successfully.');
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error('Full error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();