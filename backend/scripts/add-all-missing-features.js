const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) require('dotenv').config({ path: envPath });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sql = `
-- ============================================================
-- 1. PROGRESS INVOICING (milestones on invoices)
-- ============================================================
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS milestone_name VARCHAR(255);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS milestone_percentage DECIMAL(5,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS parent_invoice_id UUID REFERENCES invoices(id);

-- ============================================================
-- 2. ESTIMATES TABLE (corrected generated columns)
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

CREATE INDEX IF NOT EXISTS idx_estimates_company ON estimates(company_id);
CREATE INDEX IF NOT EXISTS idx_estimates_client ON estimates(client_id);
CREATE INDEX IF NOT EXISTS idx_estimate_items_estimate ON estimate_items(estimate_id);

-- Estimate number generator
CREATE OR REPLACE FUNCTION generate_estimate_number()
RETURNS TRIGGER AS $$
DECLARE
  year TEXT;
  seq INT;
BEGIN
  year := to_char(NEW.issue_date, 'YYYY');
  SELECT COALESCE(MAX(CAST(substring(estimate_number FROM '[0-9]+$') AS INT)), 0) + 1 INTO seq
  FROM estimates
  WHERE estimate_number LIKE 'EST-' || year || '-%';
  NEW.estimate_number := 'EST-' || year || '-' || LPAD(seq::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_estimate_number ON estimates;
CREATE TRIGGER trg_generate_estimate_number
BEFORE INSERT ON estimates
FOR EACH ROW
WHEN (NEW.estimate_number IS NULL)
EXECUTE FUNCTION generate_estimate_number();

-- ============================================================
-- 3. PAY STUBS TABLE
-- ============================================================
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

-- ============================================================
-- 4. TAX FORMS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS tax_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) NOT NULL,
  employee_id UUID REFERENCES users(id),
  year INTEGER NOT NULL,
  form_type VARCHAR(10) NOT NULL,
  xml_data TEXT,
  pdf_url TEXT,
  status VARCHAR(20) DEFAULT 'draft',
  filed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tax_forms_company ON tax_forms(company_id);
CREATE INDEX IF NOT EXISTS idx_tax_forms_year ON tax_forms(year);

-- ============================================================
-- 5. MULTI-CURRENCY (add to invoices and estimates)
-- ============================================================
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(10,4) DEFAULT 1;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD';
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(10,4) DEFAULT 1;

-- Update existing records
UPDATE invoices SET currency = 'USD' WHERE currency IS NULL;
UPDATE estimates SET currency = 'USD' WHERE currency IS NULL;
`;

async function run() {
  const client = await pool.connect();
  try {
    console.log('🔄 Running combined migration: progress invoicing, estimates, pay stubs, tax forms, currency...');
    await client.query(sql);
    console.log('✅ All migrations completed successfully.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    console.error('   Full error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();