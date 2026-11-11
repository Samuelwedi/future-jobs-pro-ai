'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const name = '20261111_chat_text_requests.sql';

async function verify(client) {
  const columns = (await client.query(`SELECT column_name,udt_name,is_nullable FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name='chat_text_requests'`)).rows;
  const required = { company_id:'uuid', actor_id:'uuid', request_key:'text', room_id:'text',
    fingerprint_version:'int4', payload_hash:'text', original_message_id:'uuid', created_at:'timestamptz' };
  if (Object.entries(required).some(([key,type]) => !columns.some(c => c.column_name===key && c.udt_name===type && c.is_nullable==='NO'))) {
    throw Error('Chat text receipt columns are missing or incompatible');
  }
  // pg decodes text[] as an array but leaves catalog name[] as a raw string.
  const constraints = (await client.query(`SELECT c.contype,c.condeferrable,c.convalidated,
      pg_get_constraintdef(c.oid) AS definition,
      ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum,position)
        JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum ORDER BY k.position) AS columns
    FROM pg_constraint c WHERE c.conrelid='chat_text_requests'::regclass`)).rows;
  if (!constraints.some(c => ['p','u'].includes(c.contype) && !c.condeferrable && c.convalidated
    && JSON.stringify(c.columns)===JSON.stringify(['company_id','actor_id','request_key']))) {
    throw Error('Chat text receipts require nondeferrable company/actor/key uniqueness');
  }
  if (constraints.some(c => c.contype==='f')) throw Error('Chat text receipt tombstones must not have foreign keys');
  // Runtime relies on exact required columns and scoped uniqueness. Named checks
  // also make accidental partial/manual table creation fail deployment closed.
  const checks = (await client.query(`SELECT conname FROM pg_constraint
    WHERE conrelid='chat_text_requests'::regclass AND contype='c' AND convalidated`)).rows.map(c=>c.conname);
  for (const suffix of ['key','room','version','hash']) {
    if (!checks.includes(`chat_text_requests_${suffix}_valid`)) throw Error('Chat text receipt validation constraints are missing');
  }
}
async function migrate(client) {
  const sql = fs.readFileSync(path.join(__dirname, '../migrations', name), 'utf8');
  const digest = crypto.createHash('sha256').update(sql).digest('hex');
  let commitAttempted = false;
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout='10s'");
    await client.query("SET LOCAL statement_timeout='60s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('futurejobs-release-migration'))");
    await client.query('CREATE TABLE IF NOT EXISTS app_release_migrations(name text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
    const previous = (await client.query('SELECT sha256 FROM app_release_migrations WHERE name=$1', [name])).rows[0];
    if (previous && previous.sha256 !== digest) throw Error('Chat text receipt migration checksum changed');
    if (!previous) await client.query(sql);
    await verify(client);
    if (!previous) await client.query('INSERT INTO app_release_migrations(name,sha256) VALUES($1,$2)', [name,digest]);
    commitAttempted = true;
    await client.query('COMMIT');
  } catch (error) {
    // The standalone runner always closes its connection. Never claim a failed
    // COMMIT means the schema did not apply; a repeat run verifies its checksum.
    if (!commitAttempted) await client.query('ROLLBACK');
    throw error;
  }
}
async function main() {
  if (!process.env.DATABASE_URL) throw Error('DATABASE_URL is required');
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL,
    ...(process.env.DB_SSL==='false' ? {ssl:false} : process.env.DB_SSL==='true'
      ? {ssl:{rejectUnauthorized:process.env.DB_SSL_REJECT_UNAUTHORIZED==='true'}} : {}) });
  await client.connect();
  try { await migrate(client); console.log('Chat text receipt schema completed and verified.'); }
  finally { await client.end(); }
}
if (require.main===module) main().catch(error => { console.error('Chat text receipt migration failed; deployment stopped.', error.message); process.exitCode=1; });
module.exports = {migrate, verify};
