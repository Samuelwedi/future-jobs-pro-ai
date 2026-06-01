const { Pool } = require('pg');
const DATABASE_URL = 'postgresql://postgres:fFhIpSkiVKmHhAmQcQoSudrksWdXuGMQ@centerbeam.proxy.rlwy.net:47967/railway';
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function check() {
  const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='full_name'");
  console.log(res.rows);
  await pool.end();
}
check();