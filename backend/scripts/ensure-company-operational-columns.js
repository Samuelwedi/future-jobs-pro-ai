const { Client } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      ALTER TABLE companies
        ADD COLUMN IF NOT EXISTS kiosk_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS payroll_schedule VARCHAR(20) DEFAULT 'weekly',
        ADD COLUMN IF NOT EXISTS payroll_day INTEGER DEFAULT 5,
        ADD COLUMN IF NOT EXISTS payroll_time VARCHAR(10) DEFAULT '09:00',
        ADD COLUMN IF NOT EXISTS default_hourly_rate NUMERIC(10,2) DEFAULT 20,
        ADD COLUMN IF NOT EXISTS overtime_multiplier NUMERIC(6,3) DEFAULT 1.5,
        ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(6,3) DEFAULT 15
    `);
    const result = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='companies'
        AND column_name=ANY($1::text[])
      ORDER BY column_name
    `, [[
      'kiosk_enabled','payroll_schedule','payroll_day','payroll_time',
      'default_hourly_rate','overtime_multiplier','tax_rate',
    ]]);
    await client.query('COMMIT');
    console.table(result.rows);
    console.log('Company kiosk and payroll settings schema is ready.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch(error => { console.error(error); process.exit(1); });
