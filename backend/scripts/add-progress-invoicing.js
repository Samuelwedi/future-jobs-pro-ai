const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) require('dotenv').config({ path: envPath });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sql = `
-- Add milestone fields to invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS milestone_name VARCHAR(255);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS milestone_percentage DECIMAL(5,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS parent_invoice_id UUID REFERENCES invoices(id);

-- Create estimates table
CREATE TABLE IF NOT EXISTS estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) NOT NULL,
  project_id UUID REFERENCES projects(id),
  client_id UUID REFERENCES users(id),
  estimate_number VARCHAR(50) UNIQUE,
  issue_date DATE NOT NULL,
  expiry_date DATE,
  status VARCHAR(20) DEFAULT 'draft', -- draft, sent, accepted, rejected, converted
  subtotal DECIMAL(10,2) NOT NULL,
  tax_rate DECIMAL(5,2) DEFAULT 0,
  tax_amount DECIMAL(10,2) GENERATED ALWAYS AS (subtotal * tax_rate / 100) STORED,
  total DECIMAL(10,2) GENERATED ALWAYS AS (subtotal + tax_amount) STORED,
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

-- Function to auto‑generate estimate number
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
`;

async function run() {
  const client = await pool.connect();
  try {
    console.log('🔄 Adding progress invoicing and estimates...');
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