// backend/scripts/add-recurring-shifts.js
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

// Load .env from backend root
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
  console.log('✅ Loaded .env from:', envPath);
} else {
  console.warn('⚠️ .env file not found at:', envPath);
}

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set.');
  console.error('   Please create a .env file in the backend folder with:');
  console.error('   DATABASE_URL=postgresql://user:password@localhost:5432/database');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// SQL statements
const createRecurringShiftsTable = `
  CREATE TABLE IF NOT EXISTS recurring_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) NOT NULL,
    project_id UUID REFERENCES projects(id),
    title VARCHAR(255),
    employee_id UUID REFERENCES users(id),
    day_of_week INTEGER NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );
`;

const addRecurringShiftIdToShifts = `
  ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS recurring_shift_id UUID REFERENCES recurring_shifts(id);
`;

const createIndexes = `
  CREATE INDEX IF NOT EXISTS idx_recurring_shifts_company ON recurring_shifts(company_id);
  CREATE INDEX IF NOT EXISTS idx_recurring_shifts_employee ON recurring_shifts(employee_id);
  CREATE INDEX IF NOT EXISTS idx_recurring_shifts_dates ON recurring_shifts(start_date, end_date);
`;

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('🔄 Running migration: add recurring shifts...');

    await client.query(createRecurringShiftsTable);
    console.log('✅ Created table: recurring_shifts');

    await client.query(addRecurringShiftIdToShifts);
    console.log('✅ Added column recurring_shift_id to shifts table');

    await client.query(createIndexes);
    console.log('✅ Created indexes on recurring_shifts');

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