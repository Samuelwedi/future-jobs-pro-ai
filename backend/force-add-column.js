const { Pool } = require('pg');
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function forceAdd() {
  try {
    // Add the column
    const result = await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255)');
    console.log('✅ Column added (or already exists):', result.command);
    
    // Populate full_name for all rows where it's null
    const updateResult = await pool.query(
      "UPDATE users SET full_name = COALESCE(first_name || ' ' || last_name, email) WHERE full_name IS NULL"
    );
    console.log(`✅ Updated ${updateResult.rowCount} row(s)`);

    // Verify the column exists
    const check = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='full_name'"
    );
    console.log('✅ Verification:', check.rows);
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await pool.end();
  }
}

forceAdd();