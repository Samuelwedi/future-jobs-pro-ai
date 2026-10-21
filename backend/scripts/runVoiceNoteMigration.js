// Explicit operator action: npm run migrate:voice-notes. Not run on app startup.
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});
pool.query(fs.readFileSync(path.join(__dirname, '../migrations/20261021_voice_note_schema.sql'), 'utf8'))
  .then(() => console.log('Voice-note schema migration completed.'))
  .catch(error => { console.error('Voice-note migration failed:', error.message); process.exitCode = 1; })
  .finally(() => pool.end());
