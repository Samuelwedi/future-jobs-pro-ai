// backend/scripts/fix-db.js
const { Pool } = require('pg');

// Use your Railway DATABASE_URL (or set it in .env)
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:fFhIpSkiVKmHhAmQcQoSudrksWdXuGMQ@centerbeam.proxy.rlwy.net:47967/railway';

const pool = new Pool({ connectionString: DATABASE_URL });

const sqlCommands = `
-- Create gps_tracking table
CREATE TABLE IF NOT EXISTS gps_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    accuracy DOUBLE PRECISION,
    altitude DOUBLE PRECISION,
    speed DOUBLE PRECISION,
    heading DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gps_tracking_user_time ON gps_tracking(user_id, timestamp);

-- Clean duplicates and add unique constraint on user_behavior_patterns
DELETE FROM user_behavior_patterns a USING user_behavior_patterns b
WHERE a.user_id = b.user_id AND a.ctid < b.ctid;

ALTER TABLE user_behavior_patterns ADD CONSTRAINT unique_user_id UNIQUE (user_id);
`;

async function runMigrations() {
  const client = await pool.connect();
  try {
    console.log('Running SQL fixes...');
    await client.query(sqlCommands);
    console.log('✅ All commands executed successfully.');
  } catch (err) {
    console.error('❌ Error:', err.message);
    if (err.code === '42P07') console.log('Table already exists – skipping creation.');
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();