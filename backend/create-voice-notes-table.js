require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS voice_notes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id),
        project_id UUID REFERENCES projects(id),
        time_entry_id UUID REFERENCES time_entries(id),
        audio_s3_key TEXT NOT NULL,
        transcript TEXT,
        structured_data JSONB,
        client_summary TEXT,
        duration_seconds INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('✅ voice_notes table created (or already exists)');
  } catch (err) {
    console.error('❌ Migration error:', err);
  } finally {
    await pool.end();
  }
})();