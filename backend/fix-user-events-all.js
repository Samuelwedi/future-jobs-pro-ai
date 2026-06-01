const { Pool } = require('pg');

const DATABASE_URL = 'postgresql://postgres:fFhIpSkiVKmHhAmQcQoSudrksWdXuGMQ@centerbeam.proxy.rlwy.net:47967/railway';

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function fix() {
  try {
    await pool.query(`
      ALTER TABLE user_events ADD COLUMN IF NOT EXISTS location_lat DOUBLE PRECISION;
      ALTER TABLE user_events ADD COLUMN IF NOT EXISTS location_lng DOUBLE PRECISION;
      ALTER TABLE user_events ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
      ALTER TABLE user_events ADD COLUMN IF NOT EXISTS device_info JSONB DEFAULT '{}';
      ALTER TABLE user_events ADD COLUMN IF NOT EXISTS session_id VARCHAR(255);
      ALTER TABLE user_events ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);
    `);
    console.log('✅ All user_events columns added (or already exist).');
  } catch (err) {
    console.error('❌ Fix failed:', err.message);
  } finally {
    await pool.end();
  }
}

fix();