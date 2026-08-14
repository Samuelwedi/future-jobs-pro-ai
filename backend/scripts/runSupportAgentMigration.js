require('dotenv').config();
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false },
});

async function main() {
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'migrations', '20260813_platform_support_agents.sql'),
    'utf8',
  );
  await pool.query(sql);

  const email = String(process.env.SUPPORT_OWNER_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.SUPPORT_OWNER_PASSWORD || '');
  const name = String(process.env.SUPPORT_OWNER_NAME || 'Samuel Btsay').trim();
  if (!email || !password) {
    console.log('Schema completed. Set SUPPORT_OWNER_EMAIL and SUPPORT_OWNER_PASSWORD, then run this command again to create the first owner.');
    return;
  }
  if (password.length < 12) throw new Error('SUPPORT_OWNER_PASSWORD must contain at least 12 characters');

  const parts = name.split(/\s+/);
  const firstName = parts.shift() || 'Platform';
  const lastName = parts.join(' ') || 'Owner';
  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO platform_support_agents
       (email, password_hash, first_name, last_name, role)
     VALUES ($1, $2, $3, $4, 'owner')
     ON CONFLICT ((LOWER(email))) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       first_name = EXCLUDED.first_name,
       last_name = EXCLUDED.last_name,
       role = 'owner',
       is_active = TRUE,
       updated_at = NOW()`,
    [email, hash, firstName, lastName],
  );
  console.log(`Platform support owner is ready: ${email}`);
}

main()
  .catch((error) => {
    console.error('Support-agent migration failed:', error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
