const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) require('dotenv').config({ path: envPath });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sql = `
CREATE TABLE IF NOT EXISTS knowledge_base (
  id SERIAL PRIMARY KEY,
  company_id UUID NOT NULL,
  category VARCHAR(50),
  question TEXT,
  answer TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add some default entries (optional)
INSERT INTO knowledge_base (company_id, category, question, answer)
VALUES 
  ('ed1887d9-3ffd-46e4-b281-338c8ad03a66', 'policy', 'Refund policy', 'We offer a full refund within 30 days of purchase.'),
  ('ed1887d9-3ffd-46e4-b281-338c8ad03a66', 'faq', 'How to reset password', 'Click "Forgot password" on the login page and follow the instructions.')
ON CONFLICT DO NOTHING;
`;

async function run() {
  const client = await pool.connect();
  try {
    console.log('🔄 Creating knowledge_base table...');
    await client.query(sql);
    console.log('✅ knowledge_base table created.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run();