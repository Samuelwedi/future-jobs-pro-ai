const { Pool } = require('pg');
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

pool.query('ALTER TABLE pto_requests ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id)')
  .then(() => { console.log('✅ company_id added to pto_requests'); pool.end(); })
  .catch(e => { console.error(e.message); pool.end(); });