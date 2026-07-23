const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) require('dotenv').config({ path: envPath });

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not set.');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sql = `
-- ============================================================
-- 1. Add sent_at to pay_stubs
-- ============================================================
ALTER TABLE pay_stubs ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP;

-- ============================================================
-- 2. Tax forms table
-- ============================================================
CREATE TABLE IF NOT EXISTS tax_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) NOT NULL,
  employee_id UUID REFERENCES users(id) NOT NULL,
  year INTEGER NOT NULL,
  form_type VARCHAR(10) NOT NULL,
  xml_data TEXT,
  pdf_url TEXT,
  status VARCHAR(20) DEFAULT 'draft',
  filed_at TIMESTAMP,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tax_forms_company ON tax_forms(company_id);
CREATE INDEX IF NOT EXISTS idx_tax_forms_employee ON tax_forms(employee_id);
CREATE INDEX IF NOT EXISTS idx_tax_forms_year ON tax_forms(year);

-- ============================================================
-- 3. Add bank details to users
-- ============================================================
ALTER TABLE users
ADD COLUMN IF NOT EXISTS bank_routing_number VARCHAR(9),
ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(17),
ADD COLUMN IF NOT EXISTS bank_account_type VARCHAR(10) DEFAULT 'checking',
ADD COLUMN IF NOT EXISTS bank_account_holder VARCHAR(255);

-- ============================================================
-- 4. Ensure estimates table exists (from earlier)
-- ============================================================
CREATE TABLE IF NOT EXISTS estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) NOT NULL,
  project_id UUID REFERENCES projects(id),
  client_id UUID REFERENCES users(id),
  estimate_number VARCHAR(50) UNIQUE,
  issue_date DATE NOT NULL,
  expiry_date DATE,
  status VARCHAR(20) DEFAULT 'draft',
  subtotal DECIMAL(10,2) NOT NULL,
  tax_rate DECIMAL(5,2) DEFAULT 0,
  tax_amount DECIMAL(10,2) GENERATED ALWAYS AS (subtotal * tax_rate / 100) STORED,
  total DECIMAL(10,2) GENERATED ALWAYS AS (subtotal + (subtotal * tax_rate / 100)) STORED,
  notes TEXT,
  client_notes TEXT,
  sent_at TIMESTAMP,
  accepted_at TIMESTAMP,
  converted_to_invoice_id UUID REFERENCES invoices(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS estimate_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id UUID REFERENCES estimates(id) ON DELETE CASCADE NOT NULL,
  description TEXT NOT NULL,
  quantity DECIMAL(10,2) DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  total DECIMAL(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  created_at TIMESTAMP DEFAULT NOW()
);
`;

async function run() {
  const client = await pool.connect();
  try {
    console.log('🔄 Running all production migrations...');
    await client.query(sql);
    console.log('✅ All migrations completed.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    console.error(err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();