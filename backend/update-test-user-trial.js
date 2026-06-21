require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    // Update trial_ends_at for test user to 365 days from now
    const result = await pool.query(
      `UPDATE users SET trial_ends_at = NOW() + INTERVAL '365 days' WHERE email = 'samuel@test.com' RETURNING id, email, trial_ends_at`
    );
    if (result.rows.length === 0) {
      console.log('⚠️  User samuel@test.com not found. Please register first.');
    } else {
      console.log(`✅ Trial extended to 365 days for ${result.rows[0].email}. New trial end: ${result.rows[0].trial_ends_at}`);
    }
  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await pool.end();
  }
})();
