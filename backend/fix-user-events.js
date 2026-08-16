const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function fix() {
  try {
    await pool.query(`
      ALTER TABLE user_events ADD COLUMN IF NOT EXISTS location_lat DOUBLE PRECISION;
      ALTER TABLE user_events ADD COLUMN IF NOT EXISTS location_lng DOUBLE PRECISION;
      ALTER TABLE user_events ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
    `);
    console.log('✅ user_events columns added (or already exist).');
  } catch (err) {
    console.error('❌ Fix failed:', err.message);
  } finally {
    await pool.end();
  }
}

fix();