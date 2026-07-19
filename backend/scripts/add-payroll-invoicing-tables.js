const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
  console.log('✅ Loaded .env from:', envPath);
} else {
  console.warn('⚠️ .env file not found at:', envPath);
}

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const sql = `
-- ============================================================
-- PAYROLL TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS payrolls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'draft',  -- draft, approved, paid
  total_hours DECIMAL(10,2) DEFAULT 0,
  total_pay DECIMAL(10,2) DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payroll_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_id UUID REFERENCES payrolls(id) ON DELETE CASCADE NOT NULL,
  employee_id UUID REFERENCES users(id) NOT NULL,
  hours DECIMAL(10,2) DEFAULT 0,
  hourly_rate DECIMAL(10,2) DEFAULT 0,
  pay DECIMAL(10,2) GENERATED ALWAYS AS (hours * hourly_rate) STORED,
  adjustments DECIMAL(10,2) DEFAULT 0,
  final_pay DECIMAL(10,2) GENERATED ALWAYS AS (pay + adjustments) STORED,
  timesheet_ids UUID[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payrolls_company ON payrolls(company_id);
CREATE INDEX IF NOT EXISTS idx_payrolls_period ON payrolls(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_payroll_items_payroll ON payroll_items(payroll_id);
CREATE INDEX IF NOT EXISTS idx_payroll_items_employee ON payroll_items(employee_id);

-- ============================================================
-- INVOICING TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) NOT NULL,
  project_id UUID REFERENCES projects(id),
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'draft',  -- draft, sent, paid, overdue, cancelled
  subtotal DECIMAL(10,2) NOT NULL,
  tax_rate DECIMAL(5,2) DEFAULT 0,
  tax_amount DECIMAL(10,2) GENERATED ALWAYS AS (subtotal * tax_rate / 100) STORED,
  total DECIMAL(10,2) GENERATED ALWAYS AS (subtotal + tax_amount) STORED,
  notes TEXT,
  sent_at TIMESTAMP,
  paid_at TIMESTAMP,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE NOT NULL,
  description TEXT NOT NULL,
  quantity DECIMAL(10,2) DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  total DECIMAL(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  time_entry_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_company ON invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_project ON invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);

-- ============================================================
-- TRIGGER to auto‑generate invoice_number
-- ============================================================

CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
DECLARE
  year TEXT;
  seq INT;
  prefix TEXT;
BEGIN
  year := to_char(NEW.issue_date, 'YYYY');
  SELECT COALESCE(MAX(CAST(substring(invoice_number FROM '[0-9]+$') AS INT)), 0) + 1 INTO seq
  FROM invoices
  WHERE invoice_number LIKE 'INV-' || year || '-%';
  NEW.invoice_number := 'INV-' || year || '-' || LPAD(seq::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_invoice_number ON invoices;
CREATE TRIGGER trg_generate_invoice_number
BEFORE INSERT ON invoices
FOR EACH ROW
WHEN (NEW.invoice_number IS NULL)
EXECUTE FUNCTION generate_invoice_number();
`;

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('🔄 Running migration: add payroll & invoicing tables...');
    await client.query(sql);
    console.log('✅ Tables created and triggers set up.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    console.error(err);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();