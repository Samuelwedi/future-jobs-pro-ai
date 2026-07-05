// backend/scripts/addShiftColumns.js
const { Pool } = require('pg');

// Use Railway's DATABASE_URL from environment (or fallback for local testing)
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:fFhIpSkiVKmHhAmQcQoSudrksWdXuGMQ@centerbeam.proxy.rlwy.net:47967/railway';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // required for Railway
});

const sqlCommands = [
  `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS name TEXT;`,
  `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS start_time TIME;`,
  `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS end_time TIME;`,
  // Optionally ensure date column exists (though it probably does)
  `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS date DATE;`,
];

async function runMigrations() {
  const client = await pool.connect();
  try {
    console.log('🔄 Checking/adding missing columns to shifts table...');
    for (const sql of sqlCommands) {
      try {
        await client.query(sql);
        console.log(`✅ Executed: ${sql.substring(0, 60)}...`);
      } catch (err) {
        // If column already exists, Postgres throws error '42701' (duplicate column)
        // But we use IF NOT EXISTS, so it should not error. Still, catch just in case.
        console.warn(`⚠️ Warning for: ${sql}`, err.message);
      }
    }
    console.log('✅ All columns added (if they were missing).');
  } catch (err) {
    console.error('❌ Migration error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();