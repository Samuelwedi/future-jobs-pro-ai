const { Pool } = require('pg');
const DATABASE_URL = 'postgresql://postgres:fFhIpSkiVKmHhAmQcQoSudrksWdXuGMQ@centerbeam.proxy.rlwy.net:47967/railway';
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gps_points (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id),
        time_entry_id UUID REFERENCES time_entries(id),
        project_id UUID REFERENCES projects(id),
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        accuracy DOUBLE PRECISION DEFAULT 10,
        altitude DOUBLE PRECISION,
        speed DOUBLE PRECISION,
        heading INTEGER,
        battery_level INTEGER,
        geofence_status VARCHAR(20) DEFAULT 'unknown',
        is_moving BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('✅ gps_points table ready');
  } catch (e) { console.error(e.message); }
  finally { await pool.end(); }
})();