const fs = require('node:fs');
const path = require('node:path');
const { pool } = require('../dist/config/database');

async function main() {
  const client = await pool.connect();
  try {
    const sql = fs.readFileSync(path.join(__dirname, '../migrations/20261024_owner_operations.sql'), 'utf8');
    await client.query(sql);
    await client.query('SELECT incident_id FROM owner_operations_jobs LIMIT 0');
    await client.query('SELECT id, incident_id, status FROM owner_repair_jobs LIMIT 0');
    console.log('Owner operations schema is ready and verified.');
  } finally { client.release(); await pool.end(); }
}

main().catch((error) => { console.error('Owner operations migration failed; verify database connectivity and prerequisites.'); process.exit(1); });
