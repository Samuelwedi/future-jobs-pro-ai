const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

// Load .env from backend root
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) require('dotenv').config({ path: envPath });

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set.');
  console.error('   Please set it in your environment or .env file');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ─── SQL to fix payroll_items schema ──────────────────────────
const sql = `
-- 1. Check if hourly_rate column exists; add if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='payroll_items' AND column_name='hourly_rate') THEN
    ALTER TABLE payroll_items ADD COLUMN hourly_rate DECIMAL(10,2) DEFAULT 0;
    RAISE NOTICE 'Added hourly_rate column';
  END IF;
END $$;

-- 2. Verify generated columns (pay and final_pay) exist and are correct
-- If not, recreate them.

-- Drop and recreate generated columns if needed (but keep data)
-- We'll check if they are correct; if not, we'll rebuild the table.
-- For safety, we only do this if we detect a problem.

DO $$
BEGIN
  -- Check if 'pay' is generated correctly
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='payroll_items' AND column_name='pay'
      AND is_generated != 'ALWAYS'
  ) THEN
    RAISE NOTICE 'pay column is not generated. Recreating table...';
    -- We need to drop and recreate the whole table to fix generated columns
    -- because ALTER COLUMN cannot change to generated.
    -- This is a destructive operation; we'll warn the user.
  END IF;
END $$;

-- Since we cannot alter a column to be generated, we will:
-- 1. Rename the old table
-- 2. Create a new table with correct schema
-- 3. Copy data over (if any)
-- 4. Drop the old table

-- Check if we need to rebuild
DO $$
DECLARE
  has_pay boolean;
  has_final_pay boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='payroll_items' AND column_name='pay' AND is_generated = 'ALWAYS'
  ) INTO has_pay;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='payroll_items' AND column_name='final_pay' AND is_generated = 'ALWAYS'
  ) INTO has_final_pay;

  IF NOT has_pay OR NOT has_final_pay THEN
    RAISE NOTICE 'Rebuilding payroll_items table...';
    -- Backup old table
    EXECUTE 'ALTER TABLE payroll_items RENAME TO payroll_items_old';
    -- Create new table with correct generated columns
    CREATE TABLE payroll_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      payroll_id UUID REFERENCES payrolls(id) ON DELETE CASCADE NOT NULL,
      employee_id UUID REFERENCES users(id) NOT NULL,
      hours DECIMAL(10,2) DEFAULT 0,
      hourly_rate DECIMAL(10,2) DEFAULT 0,
      pay DECIMAL(10,2) GENERATED ALWAYS AS (hours * hourly_rate) STORED,
      adjustments DECIMAL(10,2) DEFAULT 0,
      final_pay DECIMAL(10,2) GENERATED ALWAYS AS (hours * hourly_rate + adjustments) STORED,
      timesheet_ids UUID[] DEFAULT '{}',
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
    -- Copy data from old table (if any)
    INSERT INTO payroll_items (id, payroll_id, employee_id, hours, hourly_rate, adjustments, timesheet_ids, notes, created_at)
    SELECT id, payroll_id, employee_id, hours, hourly_rate, adjustments, timesheet_ids, notes, created_at
    FROM payroll_items_old;
    -- Drop old table
    DROP TABLE payroll_items_old;
    RAISE NOTICE 'Table rebuilt successfully.';
  ELSE
    RAISE NOTICE 'Table schema is correct.';
  END IF;
END $$;

-- 3. Ensure indexes exist
CREATE INDEX IF NOT EXISTS idx_payroll_items_payroll ON payroll_items(payroll_id);
CREATE INDEX IF NOT EXISTS idx_payroll_items_employee ON payroll_items(employee_id);

SELECT 'Done' as status;
`;

async function run() {
  const client = await pool.connect();
  try {
    console.log('🔄 Checking and fixing payroll_items schema...');
    await client.query(sql);
    console.log('✅ Schema check completed.');
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error('   Full error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();