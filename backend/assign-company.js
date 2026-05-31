const { Pool } = require('pg');
const DATABASE_URL = 'postgresql://postgres:fFhIpSkiVKmHhAmQcQoSudrksWdXuGMQ@centerbeam.proxy.rlwy.net:47967/railway';
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function assign() {
  try {
    // Ensure a company exists for Samuel B.
    const companyRes = await pool.query(
      "INSERT INTO companies (name) VALUES ('Samuel Company') ON CONFLICT DO NOTHING RETURNING id"
    );
    const companyId = companyRes.rows[0]?.id;

    // Assign Samuel B. to that company
    await pool.query('UPDATE users SET company_id = $1 WHERE email = $2', [companyId, 'samuel@test.com']);

    // Optionally create a separate company for Samuel Wedi (client)
    const clientCompanyRes = await pool.query(
      "INSERT INTO companies (name) VALUES ('Client Company') ON CONFLICT DO NOTHING RETURNING id"
    );
    const clientCompanyId = clientCompanyRes.rows[0]?.id;
    await pool.query('UPDATE users SET company_id = $1 WHERE email = $2', [clientCompanyId, 'samuelwedi17@gmail.com']);

    console.log('✅ Company assignments updated.');
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await pool.end();
  }
}

assign();