// backend/scripts/fixOvertimeColumns.js
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
    console.log('🔧 Checking and fixing overtime column types...');

    // Check current column types
    const typeCheck = await client.query(`
      SELECT column_name, data_type, numeric_precision, numeric_scale 
      FROM information_schema.columns 
      WHERE table_name='companies' AND column_name IN ('overtime_threshold_hours', 'overtime_multiplier');
    `);
    console.log('📊 Current column info:', typeCheck.rows);

    // Alter columns to DECIMAL(10,2) if they aren't already
    await client.query(`
      ALTER TABLE companies 
      ALTER COLUMN overtime_threshold_hours TYPE DECIMAL(10,2),
      ALTER COLUMN overtime_multiplier TYPE DECIMAL(10,2);
    `);
    console.log('✅ Columns altered to DECIMAL(10,2)');
    
    // Verify the change
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