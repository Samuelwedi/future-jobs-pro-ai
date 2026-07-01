require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    await pool.query(`ALTER TABLE voice_notes ADD COLUMN IF NOT EXISTS company_id UUID;`);
    await pool.query(`
      UPDATE voice_notes vn
      SET company_id = u.company_id
      FROM users u
      WHERE vn.user_id = u.id AND vn.company_id IS NULL;
    `);
    await pool.query(`ALTER TABLE voice_notes ALTER COLUMN company_id SET NOT NULL;`);
    console.log('✅ company_id column added and backfilled');
  } catch (err) {
    console.error('❌ Migration error:', err);
  } finally {
    await pool.end();
  }
})();