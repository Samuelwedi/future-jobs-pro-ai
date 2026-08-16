const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { throw new Error('DATABASE_URL is required'); }

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  const client = await pool.connect();
  try {
    console.log('🔍 Checking column types and data...');

    // 1. Show current column info
    const columns = await client.query(`
      SELECT column_name, data_type, numeric_precision, numeric_scale 
      FROM information_schema.columns 
      WHERE table_name='companies' AND column_name IN ('overtime_threshold_hours', 'overtime_multiplier');
    `);
    console.log('📊 Current column info:', columns.rows);

    // 2. Show sample data (first 5 rows)
    const data = await client.query(`
      SELECT id, overtime_threshold_hours, overtime_multiplier FROM companies LIMIT 5;
    `);
    console.log('📊 Sample data:', data.rows);

    // 3. Create columns if they don't exist
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='overtime_enabled') THEN
          ALTER TABLE companies ADD COLUMN overtime_enabled BOOLEAN DEFAULT true;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='overtime_threshold_hours') THEN
          ALTER TABLE companies ADD COLUMN overtime_threshold_hours DECIMAL(10,2) DEFAULT 40.0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='overtime_multiplier') THEN
          ALTER TABLE companies ADD COLUMN overtime_multiplier DECIMAL(10,2) DEFAULT 1.5;
        END IF;
      END $$;
    `);
    console.log('✅ Columns ensured to exist');

    // 4. Alter columns to DECIMAL(10,2) – safe even if already that type
    await client.query(`
      ALTER TABLE companies 
      ALTER COLUMN overtime_threshold_hours TYPE DECIMAL(10,2),
      ALTER COLUMN overtime_multiplier TYPE DECIMAL(10,2);
    `);
    console.log('✅ Columns altered to DECIMAL(10,2)');

    // 5. Verify again
    const verify = await client.query(`
      SELECT column_name, data_type, numeric_precision, numeric_scale 
      FROM information_schema.columns 
      WHERE table_name='companies' AND column_name IN ('overtime_threshold_hours', 'overtime_multiplier');
    `);
    console.log('📊 Updated column info:', verify.rows);

    console.log('✅ Done.');
  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();