const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:fFhIpSkiVKmHhAmQcQoSudrksWdXuGMQ@centerbeam.proxy.rlwy.net:47967/railway';

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  const client = await pool.connect();
  try {
    console.log('🔄 Adding missing columns...');

    // ─── gps_tracking ───
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='gps_tracking' AND column_name='project_id') THEN
          ALTER TABLE gps_tracking ADD COLUMN project_id UUID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='gps_tracking' AND column_name='battery_level') THEN
          ALTER TABLE gps_tracking ADD COLUMN battery_level INTEGER;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='gps_tracking' AND column_name='is_moving') THEN
          ALTER TABLE gps_tracking ADD COLUMN is_moving BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='gps_tracking' AND column_name='geofence_status') THEN
          ALTER TABLE gps_tracking ADD COLUMN geofence_status VARCHAR(20) DEFAULT 'unknown';
        END IF;
      END $$;
    `);
    console.log('✅ gps_tracking columns added');

    // ─── companies ───
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='logo_url') THEN
          ALTER TABLE companies ADD COLUMN logo_url VARCHAR(500);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='office_city') THEN
          ALTER TABLE companies ADD COLUMN office_city VARCHAR(100);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='office_latitude') THEN
          ALTER TABLE companies ADD COLUMN office_latitude DECIMAL(10,8);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='office_longitude') THEN
          ALTER TABLE companies ADD COLUMN office_longitude DECIMAL(11,8);
        END IF;
      END $$;
    `);
    console.log('✅ companies columns added');

    // ─── projects ───
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='geofence_lat') THEN
          ALTER TABLE projects ADD COLUMN geofence_lat DECIMAL(10,8);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='geofence_lng') THEN
          ALTER TABLE projects ADD COLUMN geofence_lng DECIMAL(11,8);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='geofence_radius') THEN
          ALTER TABLE projects ADD COLUMN geofence_radius DECIMAL(10,2);
        END IF;
      END $$;
    `);
    console.log('✅ projects geofence columns added');

    console.log('✅ Migration complete.');
  } catch (err) {
    console.error('❌ Migration error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();