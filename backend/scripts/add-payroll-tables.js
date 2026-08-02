const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) require('dotenv').config({ path: envPath });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sql = `
CREATE TABLE IF NOT EXISTS generated_t4_slips (
  id SERIAL PRIMARY KEY,
  employee_id UUID NOT NULL,
  tax_year INTEGER NOT NULL,
  box_14_employment_income DECIMAL(10,2),
  box_16_cpp_withheld DECIMAL(10,2),
  box_18_ei_withheld DECIMAL(10,2),
  box_22_income_tax_withheld DECIMAL(10,2),
  box_24_insurable_earnings DECIMAL(10,2),
  box_26_pensionable_earnings DECIMAL(10,2),
  employer_cpp_matching DECIMAL(10,2),
  employer_ei_matching DECIMAL(10,2),
  generated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(employee_id, tax_year)
);

CREATE TABLE IF NOT EXISTS generated_t4a_slips (
  id SERIAL PRIMARY KEY,
  employee_id UUID NOT NULL,
  tax_year INTEGER NOT NULL,
  box_020_self_employed_fees DECIMAL(10,2),
  box_022_income_tax_withheld DECIMAL(10,2),
  generated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(employee_id, tax_year)
);

CREATE TABLE IF NOT EXISTS generated_rl1_slips (
  id SERIAL PRIMARY KEY,
  employee_id UUID NOT NULL,
  tax_year INTEGER NOT NULL,
  box_a_employment_income DECIMAL(10,2),
  box_b_qpp_contribution DECIMAL(10,2),
  box_c_qpip_premium DECIMAL(10,2),
  box_e_quebec_tax_withheld DECIMAL(10,2),
  box_g_pensionable_earnings DECIMAL(10,2),
  box_i_insurable_earnings DECIMAL(10,2),
  generated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(employee_id, tax_year)
);
`;

async function run() {
  const client = await pool.connect();
  try {
    console.log('🔄 Creating year-end tables...');
    await client.query(sql);
    console.log('✅ Year-end tables created.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run();