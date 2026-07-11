// backend/scripts/addCompanySettings.js
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:fFhIpSkiVKmHhAmQcQoSudrksWdXuGMQ@centerbeam.proxy.rlwy.net:47967/railway';

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  const client = await pool.connect();
  try {
    console.log('🔄 Adding company settings columns...');
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='overtime_enabled') THEN
          ALTER TABLE companies ADD COLUMN overtime_enabled BOOLEAN DEFAULT true;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='overtime_threshold_hours') THEN
          ALTER TABLE companies ADD COLUMN overtime_threshold_hours DECIMAL(5,2) DEFAULT 40.0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='overtime_multiplier') THEN
          ALTER TABLE companies ADD COLUMN overtime_multiplier DECIMAL(3,2) DEFAULT 1.5;
        END IF;
      END $$;
    `);
    console.log('✅ Company settings columns added successfully.');
  } catch (err) {
    console.error('❌ Migration error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();