// backend/scripts/addIsActiveColumn.js
const { Pool } = require('pg');

// Use Railway's DATABASE_URL from environment or fallback
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { throw new Error('DATABASE_URL is required'); }

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('🔄 Adding is_active column to users table (if missing)...');
    const sql = `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='users' AND column_name='is_active'
        ) THEN
          ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT true;
        END IF;
      END $$;
    `;
    await client.query(sql);
    console.log('✅ is_active column added (or already exists).');
  } catch (err) {
    console.error('❌ Migration error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();