// backend/scripts/addTimeEntriesIndex.js
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:fFhIpSkiVKmHhAmQcQoSudrksWdXuGMQ@centerbeam.proxy.rlwy.net:47967/railway';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('🔄 Creating index on time_entries(clock_out) to speed up stats query...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_time_entries_clock_out ON time_entries(clock_out);
    `);
    console.log('✅ Index created (or already exists).');
  } catch (err) {
    console.error('❌ Index creation error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();