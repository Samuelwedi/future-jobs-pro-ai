const { Pool } = require('pg');

const DATABASE_URL = 'postgresql://postgres:fFhIpSkiVKmHhAmQcQoSudrksWdXuGMQ@centerbeam.proxy.rlwy.net:47967/railway';

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255)')
  .then(() => {
    console.log('✅ full_name column added');
    pool.end();
  })
  .catch(err => {
    console.error('❌ Error:', err.message);
    pool.end();
  });