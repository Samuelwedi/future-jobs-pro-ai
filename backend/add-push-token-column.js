require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    // Create the notifications table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id),
        push_token TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('✅ notifications table ready (or already exists)');

    // Add push_token column if missing
    await pool.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS push_token TEXT;`);
    console.log('✅ push_token column added to notifications (or already exists)');

    // Also add an index for faster lookups
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);`);
    console.log('✅ Index on user_id created (or already exists)');

  } catch (err) {
    console.error('❌ Migration error:', err);
  } finally {
    await pool.end();
  }
})();