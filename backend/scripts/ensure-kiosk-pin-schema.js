const { Client } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS pin VARCHAR(6)
    `);
    await client.query(`
      ALTER TABLE companies
      ADD COLUMN IF NOT EXISTS kiosk_enabled BOOLEAN NOT NULL DEFAULT FALSE
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_company_kiosk_pin_unique
      ON users(company_id, pin)
      WHERE pin IS NOT NULL AND pin <> ''
    `);
    await client.query(`
      ALTER TABLE users
      DROP CONSTRAINT IF EXISTS users_kiosk_pin_format
    `);
    await client.query(`
      ALTER TABLE users
      ADD CONSTRAINT users_kiosk_pin_format
      CHECK (pin IS NULL OR pin ~ '^[0-9]{4,6}$')
    `);
    await client.query('COMMIT');

    const columns = await client.query(`
      SELECT table_name, column_name, data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND ((table_name = 'users' AND column_name = 'pin')
          OR (table_name = 'companies' AND column_name = 'kiosk_enabled'))
      ORDER BY table_name, column_name
    `);
    console.table(columns.rows);
    console.log('Kiosk PIN schema is ready.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error('Kiosk PIN schema migration failed:', error);
  process.exit(1);
});
