require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    // Add profile_pic to users
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_pic TEXT;`);
    console.log('✅ profile_pic column added');

    // Add temperature_unit to companies
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS temperature_unit TEXT DEFAULT 'celsius';`);
    console.log('✅ temperature_unit column added');

    // Add grace_ends_at and paid_months (if not already)
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS grace_ends_at TIMESTAMP WITH TIME ZONE;`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS paid_months INTEGER DEFAULT 0;`);
    console.log('✅ grace_ends_at and paid_months columns added');

    // Create payments table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id),
        amount INTEGER,
        currency TEXT,
        stripe_payment_intent_id TEXT,
        status TEXT,
        paid_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('✅ payments table created');

  } catch (err) { console.error(err); }
  finally { await pool.end(); }
})();