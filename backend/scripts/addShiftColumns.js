// backend/scripts/addShiftColumns.js
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:fFhIpSkiVKmHhAmQcQoSudrksWdXuGMQ@centerbeam.proxy.rlwy.net:47967/railway';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('🔄 Checking/adding missing columns and fixing types...');

    // 1. Add missing columns if any
    const columns = [
      { name: 'name', type: 'TEXT' },
      { name: 'date', type: 'DATE' },
      { name: 'notes', type: 'TEXT' },
      { name: 'created_by', type: 'UUID' },
      { name: 'attachment_url', type: 'TEXT' },
      { name: 'attachment_type', type: 'TEXT' },
    ];
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

    // 2. Convert start_time and end_time to TIME if they are TIMESTAMPTZ
    const typeCheck = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name='shifts' AND column_name IN ('start_time', 'end_time')
    `);
    for (const row of typeCheck.rows) {
      if (row.data_type === 'timestamp with time zone' || row.data_type === 'timestamp without time zone') {
        const colName = row.column_name;
        console.log(`🔄 Converting ${colName} from ${row.data_type} to TIME...`);
        await client.query(`ALTER TABLE shifts ALTER COLUMN ${colName} TYPE TIME USING ${colName}::TIME;`);
        console.log(`✅ ${colName} converted to TIME`);
      }
    }

    console.log('✅ Migration completed.');
  } catch (err) {
    console.error('❌ Migration error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();