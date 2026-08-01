const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) require('dotenv').config({ path: envPath });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sql = `
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS room_id VARCHAR(255);
`;

async function run() {
  const client = await pool.connect();
  try {
    console.log('🔄 Adding room_id column to chat_messages...');
    await client.query(sql);
    console.log('✅ room_id column added.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run();