const fs = require('node:fs');
const path = require('node:path');
const { pool } = require('../dist/config/database');

async function main() {
  const client = await pool.connect();
  try {
    const sql = fs.readFileSync(path.join(__dirname, '../migrations/20261024_owner_operations.sql'), 'utf8');
    await client.query(sql);
    console.log('Owner operations schema is ready.');
  } finally { client.release(); await pool.end(); }
}

main().catch((error) => { console.error('Owner operations migration failed; verify database connectivity and prerequisites.'); process.exit(1); });
