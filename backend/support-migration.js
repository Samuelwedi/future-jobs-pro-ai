require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS support_agents (
      user_id UUID PRIMARY KEY REFERENCES users(id),
      is_active BOOLEAN DEFAULT true,
      joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );`);
    console.log('✅ support_agents table ready');

    await pool.query(`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS is_ai BOOLEAN DEFAULT false;`);
    console.log('✅ chat_messages.is_ai column added');

    // Insert Lucy AI user (do NOT include is_active column)
    await pool.query(`
      INSERT INTO users (
        id, email, password_hash, role, full_name, first_name, last_name, company_id,
        created_at, updated_at
      ) VALUES (
        '00000000-0000-0000-0000-000000000001',
        'lucy@futurejobsproai.com',
        '$2b$10$dummyhashforlucyai0000000000000000000000000000000000000000',
        'manager',
        'Lucy AI',
        'Lucy',
        'AI',
        'ed1887d9-3ffd-46e4-b281-338c8ad03a66',
        NOW(),
        NOW()
      ) ON CONFLICT (id) DO NOTHING;
    `);
    console.log('✅ Lucy AI user inserted (or already exists)');
  } catch (err) {
    console.error('❌ Migration error:', err);
  } finally {
    await pool.end();
  }
})();