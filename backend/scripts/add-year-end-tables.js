const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) require('dotenv').config({ path: envPath });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sql = `
-- ============================================================
-- YEAR-END TAX REPORTING TABLES (T4, T4A, RL-1)
-- ============================================================

-- Add employment type to employees
ALTER TABLE employees ADD COLUMN IF NOT EXISTS employment_type VARCHAR(20) DEFAULT 'EMPLOYEE';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS province VARCHAR(2);

-- T4 Slips (Standard Employees)
CREATE TABLE IF NOT EXISTS generated_t4_slips (
    id SERIAL PRIMARY KEY,
    employee_id INT REFERENCES employees(id) ON DELETE CASCADE,
    tax_year INT NOT NULL,
    box_14_employment_income DECIMAL(14, 2) NOT NULL,
    box_16_cpp_withheld DECIMAL(12, 2) NOT NULL,
    box_18_ei_withheld DECIMAL(12, 2) NOT NULL,
    box_22_income_tax_withheld DECIMAL(14, 2) NOT NULL,
    box_24_insurable_earnings DECIMAL(14, 2) NOT NULL,
    box_26_pensionable_earnings DECIMAL(14, 2) NOT NULL,
    employer_cpp_matching DECIMAL(12, 2) NOT NULL,
    employer_ei_matching DECIMAL(12, 2) NOT NULL,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT unique_employee_t4_per_year UNIQUE(employee_id, tax_year)
);

-- T4A Slips (Contractors)
CREATE TABLE IF NOT EXISTS generated_t4a_slips (
    id SERIAL PRIMARY KEY,
    employee_id INT REFERENCES employees(id) ON DELETE CASCADE,
    tax_year INT NOT NULL,
    box_020_self_employed_fees DECIMAL(14, 2) DEFAULT 0.00 NOT NULL,
    box_022_income_tax_withheld DECIMAL(14, 2) DEFAULT 0.00 NOT NULL,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT unique_contractor_t4a_per_year UNIQUE(employee_id, tax_year)
);

-- RL-1 Slips (Quebec)
CREATE TABLE IF NOT EXISTS generated_rl1_slips (
    id SERIAL PRIMARY KEY,
    employee_id INT REFERENCES employees(id) ON DELETE CASCADE,
    tax_year INT NOT NULL,
    box_a_employment_income DECIMAL(14, 2) NOT NULL,
    box_b_qpp_contribution DECIMAL(12, 2) NOT NULL,
    box_c_qpip_premium DECIMAL(12, 2) NOT NULL,
    box_e_quebec_tax_withheld DECIMAL(14, 2) NOT NULL,
    box_g_pensionable_earnings DECIMAL(14, 2) NOT NULL,
    box_i_insurable_earnings DECIMAL(14, 2) NOT NULL,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT unique_employee_rl1_per_year UNIQUE(employee_id, tax_year)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_t4_employee ON generated_t4_slips(employee_id, tax_year);
CREATE INDEX IF NOT EXISTS idx_t4a_employee ON generated_t4a_slips(employee_id, tax_year);
CREATE INDEX IF NOT EXISTS idx_rl1_employee ON generated_rl1_slips(employee_id, tax_year);
`;

async function run() {
  const client = await pool.connect();
  try {
    console.log('🔄 Creating year-end tax tables...');
    await client.query(sql);
    console.log('✅ Tables created.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run();