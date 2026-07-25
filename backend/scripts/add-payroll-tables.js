const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) require('dotenv').config({ path: envPath });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sql = `
-- ============================================================
-- PAYROLL TABLES – Multi‑Country Support
-- ============================================================

CREATE TABLE IF NOT EXISTS tax_regions (
    id SERIAL PRIMARY KEY,
    country_code VARCHAR(2) NOT NULL,
    subdivision_code VARCHAR(3) NOT NULL,
    currency VARCHAR(3) DEFAULT 'CAD' NOT NULL,
    CONSTRAINT unique_region UNIQUE(country_code, subdivision_code)
);

CREATE TABLE IF NOT EXISTS payroll_constants (
    id SERIAL PRIMARY KEY,
    region_id INT REFERENCES tax_regions(id) ON DELETE CASCADE,
    tax_year INT NOT NULL,
    constant_key VARCHAR(50) NOT NULL,
    constant_value DECIMAL(16, 6) NOT NULL,
    CONSTRAINT unique_constant_rule UNIQUE(region_id, tax_year, constant_key)
);

CREATE TABLE IF NOT EXISTS dynamic_tax_brackets (
    id SERIAL PRIMARY KEY,
    region_id INT REFERENCES tax_regions(id) ON DELETE CASCADE,
    tax_year INT NOT NULL,
    bracket_type VARCHAR(20) NOT NULL,
    filing_status VARCHAR(30) DEFAULT 'ALL',
    threshold_floor DECIMAL(14, 2) NOT NULL,
    marginal_rate DECIMAL(6, 4) NOT NULL
);

CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    first_name VARCHAR(60) NOT NULL,
    last_name VARCHAR(60) NOT NULL,
    region_id INT REFERENCES tax_regions(id),
    pay_periods_per_year INT DEFAULT 26 NOT NULL,
    personal_tax_exemption DECIMAL(12, 2) DEFAULT 0.00 NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL
);

CREATE TABLE IF NOT EXISTS employee_ytd_balances (
    employee_id INT PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
    tax_year INT NOT NULL,
    accumulated_gross DECIMAL(14, 2) DEFAULT 0.00 NOT NULL,
    accumulated_pensionable DECIMAL(14, 2) DEFAULT 0.00 NOT NULL,
    accumulated_insurable DECIMAL(14, 2) DEFAULT 0.00 NOT NULL,
    last_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS paychecks (
    id SERIAL PRIMARY KEY,
    employee_id INT REFERENCES employees(id),
    tax_year INT NOT NULL,
    gross_earnings DECIMAL(14, 2) NOT NULL,
    net_payout DECIMAL(14, 2) NOT NULL,
    deduction_payload JSONB NOT NULL,
    processed_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_constants_lookup ON payroll_constants (region_id, tax_year);
CREATE INDEX IF NOT EXISTS idx_brackets_lookup ON dynamic_tax_brackets (region_id, tax_year, bracket_type);
`;

async function run() {
  const client = await pool.connect();
  try {
    console.log('🔄 Creating payroll tables...');
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