// backend/scripts/run-migration.js
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

// Load .env from the backend root (one level up from scripts/)
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
  console.log('✅ Loaded .env from:', envPath);
} else {
  console.warn('⚠️ .env file not found at:', envPath);
}

// Check if DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set.');
  console.error('   Please create a .env file in the backend folder with:');
  console.error('   DATABASE_URL=postgresql://user:password@localhost:5432/database');
  process.exit(1);
}

// Mask password for logging
const maskedUrl = process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@');
console.log(`🔗 Connecting to database: ${maskedUrl}`);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const createSupportTicketsTable = `
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id),
  user_id UUID REFERENCES users(id),
  room_id VARCHAR(255) DEFAULT 'global-support',
  status VARCHAR(20) DEFAULT 'open',
  priority VARCHAR(20) DEFAULT 'normal',
  user_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP
);
`;

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('🔄 Running migration...');
    await client.query(createSupportTicketsTable);
    console.log('✅ support_tickets table created successfully');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    console.error('   Full error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();