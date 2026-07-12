const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:fFhIpSkiVKmHhAmQcQoSudrksWdXuGMQ@centerbeam.proxy.rlwy.net:47967/railway';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  const client = await pool.connect();
  try {
    console.log('🔄 Updating overtime settings with 40.5...');
    const result = await client.query(
      `UPDATE companies SET overtime_threshold_hours = $1, overtime_multiplier = $2 WHERE id = $3 RETURNING *`,
      [40.5, 1.5, 'ed1887d9-3ffd-46e4-b281-338c8ad03a66']
    );
    console.log('✅ Update result:', result.rows[0]);
  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();