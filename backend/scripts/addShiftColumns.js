// backend/scripts/addShiftColumns.js
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:fFhIpSkiVKmHhAmQcQoSudrksWdXuGMQ@centerbeam.proxy.rlwy.net:47967/railway';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const columns = [
  { name: 'name', type: 'TEXT' },
  { name: 'start_time', type: 'TIME' },
  { name: 'end_time', type: 'TIME' },
  { name: 'date', type: 'DATE' },
  { name: 'notes', type: 'TEXT' },
  { name: 'created_by', type: 'UUID' },
  { name: 'attachment_url', type: 'TEXT' },
  { name: 'attachment_type', type: 'TEXT' },
];

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('🔄 Checking/adding missing columns to shifts table...');
    for (const col of columns) {
      const sql = `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS ${col.name} ${col.type};`;
      try {
        await client.query(sql);
        console.log(`✅ Added column: ${col.name} (${col.type})`);
      } catch (err) {
        if (err.code === '42701') {
          console.log(`ℹ️ Column ${col.name} already exists.`);
        } else {
          console.error(`❌ Error adding ${col.name}:`, err.message);
        }
      }
    }
    console.log('✅ All columns added (if missing).');
  } catch (err) {
    console.error('❌ Migration error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();