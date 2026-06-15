const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const DATABASE_URL = 'postgresql://postgres:fFhIpSkiVKmHhAmQcQoSudrksWdXuGMQ@centerbeam.proxy.rlwy.net:47967/railway';
const JWT_SECRET = 'f1jp@i2026_SamuelB_Secret#FutureJobsPro';

// Replace with your actual token from the browser (copy from localStorage after login)
const token = 'PASTE_YOUR_TOKEN_HERE';

const decoded = jwt.verify(token, JWT_SECRET);
const companyId = decoded.companyId;
console.log('Company ID:', companyId);

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    const result = await pool.query(
      'SELECT period, created_at FROM payrolls WHERE company_id = $1 ORDER BY created_at DESC LIMIT 5',
      [companyId]
    );
    console.log('Payrolls:', result.rows);
  } catch (err) {
    console.error('Query error:', err.message);
  }
  pool.end();
})();