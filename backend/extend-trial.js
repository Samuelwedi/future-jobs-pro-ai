const { Pool } = require('pg');
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function extendTrial() {
  try {
    // Set trial to 30 days from now
    const newDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await pool.query('UPDATE users SET trial_ends_at = $1 WHERE email = $2', [newDate, 'samuel@test.com']);
    console.log('✅ Trial extended to', newDate);
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await pool.end();
  }
}

extendTrial();