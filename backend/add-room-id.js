const { Pool } = require('pg');
const DATABASE_URL = 'postgresql://postgres:fFhIpSkiVKmHhAmQcQoSudrksWdXuGMQ@centerbeam.proxy.rlwy.net:47967/railway';
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

pool.query('ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS room_id VARCHAR(255)')
  .then(() => {
    console.log('✅ room_id column added (or already exists)');
    pool.end();
  })
  .catch(e => {
    console.error(e.message);
    pool.end();
  });