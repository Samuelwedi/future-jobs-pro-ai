require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    // Indexes for photos table
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_photos_project_id ON photos(project_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_photos_taken_at ON photos(taken_at);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_photos_file_type ON photos(file_type);`);

    // Indexes for voice_notes table
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_voice_notes_project_id ON voice_notes(project_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_voice_notes_created_at ON voice_notes(created_at);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_voice_notes_taken_at ON voice_notes(taken_at);`);

    console.log('✅ All media indexes created successfully.');
  } catch (err) {
    console.error('❌ Migration error:', err);
  } finally {
    await pool.end();
  }
})();