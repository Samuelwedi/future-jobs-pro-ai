require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS photos (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        company_id UUID REFERENCES companies(id),
        user_id UUID REFERENCES users(id),
        project_id UUID REFERENCES projects(id),
        time_entry_id UUID REFERENCES time_entries(id),
        s3_key TEXT NOT NULL,
        taken_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('✅ photos table created (or already exists)');
  } catch (err) {
    console.error('❌ Migration error:', err);
  } finally {
    await pool.end();
  }
})();