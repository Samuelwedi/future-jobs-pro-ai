const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function migrate() {
  console.log('⏳ Adding geofence columns to projects...');
  try {
    await client.connect();
    await client.query(`
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS geofence_radius INTEGER DEFAULT 100;
    `);
    console.log('✅ Geofence columns added.');
  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    await client.end();
  }
}

migrate();