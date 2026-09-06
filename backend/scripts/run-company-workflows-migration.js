const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized:false } });
  await client.connect();
  try {
    const sql = fs.readFileSync(path.join(__dirname,'../migrations/20260906_company_workflows.sql'),'utf8');
    await client.query(sql);
    console.log('Company workflows schema is ready.');
  } finally { await client.end(); }
}
main().catch(error => { console.error(error); process.exit(1); });
