require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    // Add address column to projects
    await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS address TEXT;`);
    console.log('✅ projects.address column added (or already exists)');

    // Add missing columns to time_entries
    await pool.query(`
      ALTER TABLE time_entries 
      ADD COLUMN IF NOT EXISTS clock_in_latitude DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS clock_in_longitude DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS clock_out_latitude DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS clock_out_longitude DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS break_minutes INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS notes TEXT,
      ADD COLUMN IF NOT EXISTS is_manual BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS created_by UUID;
    `);
    console.log('✅ time_entries columns added (or already exist)');

    // Add foreign key constraint for created_by (if not exists)
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                       WHERE constraint_name = 'time_entries_created_by_fkey') THEN
          ALTER TABLE time_entries ADD CONSTRAINT time_entries_created_by_fkey 
          FOREIGN KEY (created_by) REFERENCES users(id);
        END IF;
      END $$;
    `);
    console.log('✅ created_by foreign key added (or already exists)');

  } catch (err) {
    console.error('❌ Migration error:', err);
  } finally {
    await pool.end();
  }
})();