const { Pool } = require('pg');
const DATABASE_URL = 'postgresql://postgres:fFhIpSkiVKmHhAmQcQoSudrksWdXuGMQ@centerbeam.proxy.rlwy.net:47967/railway';
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function createTable() {
  try {
    // Create the table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        sender_id UUID REFERENCES users(id),
        company_id UUID REFERENCES companies(id),
        room_id VARCHAR(255),
        message TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('✅ chat_messages table created (or already exists).');

    // Add the room_id column (just in case it's missing on an older table)
    await pool.query('ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS room_id VARCHAR(255)');
    console.log('✅ room_id column ready.');
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await pool.end();
  }
}

createTable();