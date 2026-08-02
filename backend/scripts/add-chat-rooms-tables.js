const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) require('dotenv').config({ path: envPath });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sql = `
CREATE TABLE IF NOT EXISTS chat_rooms (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255),
  is_group BOOLEAN DEFAULT false,
  company_id UUID NOT NULL,
  created_by UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_room_members (
  room_id VARCHAR(255) REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (room_id, user_id)
);

-- Add room_id to chat_messages if not exists
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS room_id VARCHAR(255);
`;

async function run() {
  const client = await pool.connect();
  try {
    console.log('🔄 Creating chat_rooms and chat_room_members tables...');
    await client.query(sql);
    console.log('✅ Chat tables created/updated.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run();