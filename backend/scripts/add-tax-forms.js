const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) require('dotenv').config({ path: envPath });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sql = `
CREATE TABLE IF NOT EXISTS tax_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) NOT NULL,
  employee_id UUID REFERENCES users(id) NOT NULL,
  year INTEGER NOT NULL,
  form_type VARCHAR(10) NOT NULL, -- 'T4' or 'RL1'
  xml_data TEXT,                  -- XML representation for filing
  pdf_url TEXT,                    -- PDF file path
  status VARCHAR(20) DEFAULT 'draft', -- draft, filed, sent
  filed_at TIMESTAMP,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tax_forms_company ON tax_forms(company_id);
CREATE INDEX IF NOT EXISTS idx_tax_forms_employee ON tax_forms(employee_id);
CREATE INDEX IF NOT EXISTS idx_tax_forms_year ON tax_forms(year);
`;

async function run() {
  const client = await pool.connect();
  try {
    console.log('🔄 Running tax forms migration...');
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