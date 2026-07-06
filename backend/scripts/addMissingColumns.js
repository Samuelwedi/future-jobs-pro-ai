// backend/scripts/addMissingColumns.js
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:fFhIpSkiVKmHhAmQcQoSudrksWdXuGMQ@centerbeam.proxy.rlwy.net:47967/railway';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('🔄 Adding missing columns...');

    // 1. is_active column on users
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='users' AND column_name='is_active'
        ) THEN
          ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT true;
        END IF;
      END $$;
    `);
    console.log('✅ is_active added to users (if missing).');

    // 2. total_wage column on time_entries
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='time_entries' AND column_name='total_wage'
        ) THEN
          ALTER TABLE time_entries ADD COLUMN total_wage DECIMAL(10,2) DEFAULT 0.0;
        END IF;
      END $$;
    `);
    console.log('✅ total_wage added to time_entries (if missing).');

    console.log('✅ Migration completed.');
  } catch (err) {
    console.error('❌ Migration error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();