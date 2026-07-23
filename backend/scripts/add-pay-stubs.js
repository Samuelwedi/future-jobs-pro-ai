const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) require('dotenv').config({ path: envPath });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sql = `
-- Pay stubs table
CREATE TABLE IF NOT EXISTS pay_stubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_id UUID REFERENCES payrolls(id) NOT NULL,
  employee_id UUID REFERENCES users(id) NOT NULL,
  pdf_url TEXT,
  generated_at TIMESTAMP DEFAULT NOW(),
  sent_at TIMESTAMP,
  viewed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pay_stubs_employee ON pay_stubs(employee_id);
CREATE INDEX IF NOT EXISTS idx_pay_stubs_payroll ON pay_stubs(payroll_id);
`;

async function run() {
  const client = await pool.connect();
  try {
    console.log('🔄 Adding pay stubs table...');
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