const { Pool } = require('pg');
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function check() {
  try {
    const res = await pool.query('SELECT email, stripe_customer_id FROM users WHERE email = $1', ['samuel@test.com']);
    console.log(res.rows[0]);
  } catch (err) {
    console.error(err.message);
  } finally {
    await pool.end();
  }
}

check();