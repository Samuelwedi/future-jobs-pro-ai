// backend/scripts/addProjectIdToGps.js
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:fFhIpSkiVKmHhAmQcQoSudrksWdXuGMQ@centerbeam.proxy.rlwy.net:47967/railway';

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  const client = await pool.connect();
  try {
    console.log('🔄 Adding project_id to gps_tracking...');
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='gps_tracking' AND column_name='project_id') THEN
          ALTER TABLE gps_tracking ADD COLUMN project_id UUID;
        END IF;
      END $$;
    `);
    console.log('✅ project_id added to gps_tracking');

    // Also ensure other columns exist
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='gps_tracking' AND column_name='geofence_status') THEN
          ALTER TABLE gps_tracking ADD COLUMN geofence_status VARCHAR(20) DEFAULT 'unknown';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='gps_tracking' AND column_name='is_moving') THEN
          ALTER TABLE gps_tracking ADD COLUMN is_moving BOOLEAN DEFAULT false;
        END IF;
      END $$;
    `);
    console.log('✅ geofence_status and is_moving checked/added');

    console.log('✅ Migration complete.');
  } catch (err) {
    console.error('❌ Migration error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
