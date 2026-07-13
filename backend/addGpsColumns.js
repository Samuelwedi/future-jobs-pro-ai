// backend/scripts/addGpsColumns.js
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:fFhIpSkiVKmHhAmQcQoSudrksWdXuGMQ@centerbeam.proxy.rlwy.net:47967/railway';

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  const client = await pool.connect();
  try {
    console.log('🔄 Adding missing columns...');

    // Add status to time_entries (used by crew clock-in/out)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='time_entries' AND column_name='status'
        ) THEN
          ALTER TABLE time_entries ADD COLUMN status VARCHAR(20) DEFAULT 'active';
        END IF;
      END $$;
    `);
    console.log('✅ status added to time_entries');

    // Add geofence_status to gps_tracking (used by GPS service)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='gps_tracking' AND column_name='geofence_status'
        ) THEN
          ALTER TABLE gps_tracking ADD COLUMN geofence_status VARCHAR(20) DEFAULT 'unknown';
        END IF;
      END $$;
    `);
    console.log('✅ geofence_status added to gps_tracking');

    console.log('✅ Migration complete.');
  } catch (err) {
    console.error('❌ Migration error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();