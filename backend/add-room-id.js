const { Pool } = require('pg');
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
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