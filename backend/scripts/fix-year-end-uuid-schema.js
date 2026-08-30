const { Client } = require('pg');

const tableDefinitions = {
  generated_t4_slips: `
    id UUID NOT NULL DEFAULT gen_random_uuid(), employee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tax_year INTEGER NOT NULL, box_14_employment_income DECIMAL(14,2), box_16_cpp_withheld DECIMAL(12,2),
    box_18_ei_withheld DECIMAL(12,2), box_22_income_tax_withheld DECIMAL(14,2),
    box_24_insurable_earnings DECIMAL(14,2), box_26_pensionable_earnings DECIMAL(14,2),
    employer_cpp_matching DECIMAL(12,2), employer_ei_matching DECIMAL(12,2),
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
  generated_t4a_slips: `
    id UUID NOT NULL DEFAULT gen_random_uuid(), employee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tax_year INTEGER NOT NULL, box_020_self_employed_fees DECIMAL(14,2),
    box_022_income_tax_withheld DECIMAL(14,2), generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
  generated_rl1_slips: `
    id UUID NOT NULL DEFAULT gen_random_uuid(), employee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tax_year INTEGER NOT NULL, box_a_employment_income DECIMAL(14,2),
    box_b_qpp_contribution DECIMAL(12,2), box_c_qpip_premium DECIMAL(12,2),
    box_e_quebec_tax_withheld DECIMAL(14,2), box_g_pensionable_earnings DECIMAL(14,2),
    box_i_insurable_earnings DECIMAL(14,2), generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
};

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query('BEGIN');
    for (const [table, definition] of Object.entries(tableDefinitions)) {
      const column = await client.query(
        `SELECT data_type FROM information_schema.columns
         WHERE table_schema='public' AND table_name=$1 AND column_name='employee_id'`,
        [table],
      );
      const type = column.rows[0]?.data_type;
      if (type && type !== 'uuid') {
        const legacy = `${table}_legacy_integer_20260830`;
        const legacyExists = await client.query('SELECT to_regclass($1) AS name', [`public.${legacy}`]);
        if (legacyExists.rows[0]?.name) {
          throw new Error(`${table} still has ${type} employee IDs and ${legacy} already exists; manual review is required`);
        }
        await client.query(`ALTER TABLE ${table} RENAME TO ${legacy}`);
        console.log(`Archived ${table} as ${legacy}`);
      }
      await client.query(`CREATE TABLE IF NOT EXISTS ${table} (${definition})`);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS ${table}_uuid_pk ON ${table}(id)`);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS ${table}_employee_year_uuid ON ${table}(employee_id,tax_year)`);
    }
    await client.query('COMMIT');
    const verification = await client.query(
      `SELECT table_name, data_type
       FROM information_schema.columns
       WHERE table_schema='public'
         AND table_name = ANY($1::text[])
         AND column_name='employee_id'
       ORDER BY table_name`,
      [Object.keys(tableDefinitions)],
    );
    console.table(verification.rows);
    if (verification.rows.length !== 3 || verification.rows.some(row => row.data_type !== 'uuid')) {
      throw new Error('Year-end UUID schema verification failed');
    }
    console.log('Year-end UUID schema is ready. Legacy integer tables were preserved when present.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error('Year-end UUID migration failed:', error);
  process.exit(1);
});
