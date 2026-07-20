const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) require('dotenv').config({ path: envPath });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sql = `
-- ============================================================
-- INVOICING ADVANCED FEATURES
-- ============================================================

-- Add columns to invoices (if not present)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='client_id') THEN
    ALTER TABLE invoices ADD COLUMN client_id UUID REFERENCES users(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='paid_amount') THEN
    ALTER TABLE invoices ADD COLUMN paid_amount DECIMAL(10,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='balance') THEN
    ALTER TABLE invoices ADD COLUMN balance DECIMAL(10,2) GENERATED ALWAYS AS (total - paid_amount) STORED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='viewed_at') THEN
    ALTER TABLE invoices ADD COLUMN viewed_at TIMESTAMP;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='reminder_sent_at') THEN
    ALTER TABLE invoices ADD COLUMN reminder_sent_at TIMESTAMP;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='client_notes') THEN
    ALTER TABLE invoices ADD COLUMN client_notes TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='is_recurring') THEN
    ALTER TABLE invoices ADD COLUMN is_recurring BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='recurring_frequency') THEN
    ALTER TABLE invoices ADD COLUMN recurring_frequency VARCHAR(20); -- weekly, monthly, quarterly
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='recurring_end_date') THEN
    ALTER TABLE invoices ADD COLUMN recurring_end_date DATE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='payment_link') THEN
    ALTER TABLE invoices ADD COLUMN payment_link TEXT;
  END IF;
END $$;

-- Add billable flag to invoice_items
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoice_items' AND column_name='is_billable') THEN
    ALTER TABLE invoice_items ADD COLUMN is_billable BOOLEAN DEFAULT TRUE;
  END IF;
END $$;

-- Create payments table for partial payments
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_date DATE NOT NULL,
  method VARCHAR(50), -- credit_card, ach, cash, check
  reference VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);

-- Function to auto-update paid_amount and balance on payment insertion
CREATE OR REPLACE FUNCTION update_invoice_paid_amount()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE invoices
  SET paid_amount = (
    SELECT COALESCE(SUM(amount), 0) FROM payments WHERE invoice_id = NEW.invoice_id
  )
  WHERE id = NEW.invoice_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_invoice_paid ON payments;
CREATE TRIGGER trg_update_invoice_paid
AFTER INSERT OR UPDATE OR DELETE ON payments
FOR EACH ROW
EXECUTE FUNCTION update_invoice_paid_amount();
`;

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('🔄 Running invoicing advanced features migration...');
    await client.query(sql);
    console.log('✅ Invoicing migration completed.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    console.error(err);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();