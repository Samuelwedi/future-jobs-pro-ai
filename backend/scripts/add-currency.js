const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) require('dotenv').config({ path: envPath });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sql = `
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(10,4) DEFAULT 1;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD';
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(10,4) DEFAULT 1;

-- Update existing invoices to use USD
UPDATE invoices SET currency = 'USD' WHERE currency IS NULL;
UPDATE estimates SET currency = 'USD' WHERE currency IS NULL;
`;

async function run() {
  const client = await pool.connect();
  try {
    console.log('🔄 Adding currency support...');
    await client.query(sql);
    console.log('✅ Migration completed.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run();