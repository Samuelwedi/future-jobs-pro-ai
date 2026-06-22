require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    // Add grace_ends_at to users
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS grace_ends_at TIMESTAMP WITH TIME ZONE;`);
    console.log('✅ grace_ends_at added');

    // Add paid_months (count of months paid) to users
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS paid_months INTEGER DEFAULT 0;`);
    console.log('✅ paid_months added');

    // Create payments table to track history
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