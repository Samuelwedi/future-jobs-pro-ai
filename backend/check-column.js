const { Pool } = require('pg');
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function check() {
  const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='full_name'");
  console.log(res.rows);
  await pool.end();
}
check();