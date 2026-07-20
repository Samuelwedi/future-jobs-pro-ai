const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) require('dotenv').config({ path: envPath });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sql = `
-- ============================================================
-- BASE PAYROLL TABLES (if not already created)
-- ============================================================

CREATE TABLE IF NOT EXISTS payrolls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'draft',
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

-- ============================================================
-- ADVANCED PAYROLL FEATURES (add columns if not present)
-- ============================================================

-- Add columns to companies (if not exist)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='payroll_schedule') THEN
    ALTER TABLE companies ADD COLUMN payroll_schedule VARCHAR(20) DEFAULT 'weekly';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='payroll_day') THEN
    ALTER TABLE companies ADD COLUMN payroll_day INTEGER DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='payroll_time') THEN
    ALTER TABLE companies ADD COLUMN payroll_time TIME DEFAULT '09:00';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='default_hourly_rate') THEN
    ALTER TABLE companies ADD COLUMN default_hourly_rate DECIMAL(10,2) DEFAULT 20.00;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='overtime_multiplier') THEN
    ALTER TABLE companies ADD COLUMN overtime_multiplier DECIMAL(3,2) DEFAULT 1.5;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='tax_rate') THEN
    ALTER TABLE companies ADD COLUMN tax_rate DECIMAL(5,2) DEFAULT 15.0;
  END IF;
END $$;

-- Create compensation_history table
CREATE TABLE IF NOT EXISTS compensation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  hourly_rate DECIMAL(10,2) NOT NULL,
  effective_date DATE NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add project_id to payroll_items (if not exist)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_items' AND column_name='project_id') THEN
    ALTER TABLE payroll_items ADD COLUMN project_id UUID REFERENCES projects(id);
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_compensation_user ON compensation_history(user_id);
CREATE INDEX IF NOT EXISTS idx_compensation_effective ON compensation_history(effective_date);
CREATE INDEX IF NOT EXISTS idx_payroll_items_project ON payroll_items(project_id);
`;

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('🔄 Running payroll advanced features migration...');
    await client.query(sql);
    console.log('✅ Migration completed successfully.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    console.error('   Full error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();