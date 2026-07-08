const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:fFhIpSkiVKmHhAmQcQoSudrksWdXuGMQ@centerbeam.proxy.rlwy.net:47967/railway';

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  const client = await pool.connect();
  try {
    console.log('🔄 Adding missing columns to time_entries...');
    const columns = [
      { name: 'latitude', type: 'DOUBLE PRECISION DEFAULT 0' },
      { name: 'longitude', type: 'DOUBLE PRECISION DEFAULT 0' },
      { name: 'latitude_out', type: 'DOUBLE PRECISION DEFAULT 0' },
      { name: 'longitude_out', type: 'DOUBLE PRECISION DEFAULT 0' },
      { name: 'regular_hours', type: 'DECIMAL(8,2) DEFAULT 0.0' },
      { name: 'overtime_hours', type: 'DECIMAL(8,2) DEFAULT 0.0' },
      { name: 'total_wage', type: 'DECIMAL(10,2) DEFAULT 0.0' },
      { name: 'break_minutes', type: 'INTEGER DEFAULT 0' },
      { name: 'alerts', type: 'TEXT[] DEFAULT \'{}\'' },
      { name: 'is_manual', type: 'BOOLEAN DEFAULT false' },
    ];
    for (const col of columns) {
      const sql = `
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='time_entries' AND column_name='${col.name}'
          ) THEN
            ALTER TABLE time_entries ADD COLUMN ${col.name} ${col.type};
          END IF;
        END $$;
      `;
      await client.query(sql);
      console.log(`✅ ${col.name} checked/added.`);
    }
    console.log('✅ Migration complete.');
  } catch (err) {
    console.error('❌ Migration error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();