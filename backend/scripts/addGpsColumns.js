// backend/scripts/addGpsColumns.js
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:fFhIpSkiVKmHhAmQcQoSudrksWdXuGMQ@centerbeam.proxy.rlwy.net:47967/railway';

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  const client = await pool.connect();
  try {
    console.log('🔄 Adding missing columns...');

    // Add is_moving to gps_tracking
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='gps_tracking' AND column_name='is_moving'
        ) THEN
          ALTER TABLE gps_tracking ADD COLUMN is_moving BOOLEAN DEFAULT false;
        END IF;
      END $$;
    `);
    console.log('✅ is_moving added to gps_tracking');

    // Add geofence_status to gps_tracking
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

    // Add office_city to companies
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='companies' AND column_name='office_city'
        ) THEN
          ALTER TABLE companies ADD COLUMN office_city VARCHAR(100);
        END IF;
      END $$;
    `);
    console.log('✅ office_city added to companies');

    console.log('✅ Migration complete.');
  } catch (err) {
    console.error('❌ Migration error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();