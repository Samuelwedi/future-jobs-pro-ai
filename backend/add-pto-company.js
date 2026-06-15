const { Pool } = require('pg');
const DATABASE_URL = 'postgresql://postgres:fFhIpSkiVKmHhAmQcQoSudrksWdXuGMQ@centerbeam.proxy.rlwy.net:47967/railway';
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

pool.query('ALTER TABLE pto_requests ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id)')
  .then(() => { console.log('✅ company_id added to pto_requests'); pool.end(); })
  .catch(e => { console.error(e.message); pool.end(); });