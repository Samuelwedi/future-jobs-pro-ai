'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const name = '20261111_private_chat_views.sql';

async function verify(client) {
  const columns = (await client.query(`SELECT table_name,column_name,udt_name,is_nullable,column_default,is_identity,is_generated
    FROM information_schema.columns WHERE table_schema=current_schema()
      AND table_name IN ('chat_room_members','chat_messages','chat_message_views')`)).rows;
  const required = {chat_room_members:['membership_instance_id'],chat_messages:['view_version'],
    chat_message_views:['membership_instance_id','message_id','view_version']};
  for (const [table,names] of Object.entries(required)) for (const name of names) {
    const c=columns.find(c=>c.table_name===table && c.column_name===name);
    if (!c || c.udt_name!=='uuid' || c.is_nullable!=='NO'
      || c.is_identity!=='NO' || c.is_generated!=='NEVER'
      || (table!=='chat_message_views' && c.column_default!=='gen_random_uuid()')
      || (table==='chat_message_views' && c.column_default!==null)) {
      throw Error('Private chat view columns are missing or incompatible');
    }
  }
  if (columns.filter(c=>c.table_name==='chat_message_views').length!==3) {
    throw Error('Private chat view columns are missing or incompatible');
  }
  // Explicit text casts are required for installed pg catalog-array decoding.
  const constraints=(await client.query(`SELECT c.conrelid::regclass::text AS table_name,c.contype,
      c.condeferrable,c.convalidated,c.confdeltype,c.confupdtype,c.confrelid::regclass::text AS target,
      ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum,position)
        JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum ORDER BY k.position) AS columns,
      ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY AS k(attnum,position)
        JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.attnum ORDER BY k.position) AS target_columns
    FROM pg_constraint c WHERE c.conrelid IN
      ('chat_room_members'::regclass,'chat_messages'::regclass,'chat_message_views'::regclass)`)).rows;
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  for (const [table,names] of [['chat_room_members',['membership_instance_id']],
    ['chat_room_members',['room_id','user_id']],['chat_messages',['id']],
    ['chat_message_views',['membership_instance_id','message_id']]]) {
    if (!constraints.some(c=>c.table_name===table && (table==='chat_message_views' ? c.contype==='p' : ['p','u'].includes(c.contype))
      && !c.condeferrable && c.convalidated && same(c.columns,names))) {
      throw Error('Private chat views require nondeferrable identity uniqueness');
    }
  }
  for (const [names,target,targetColumns] of [
    [['membership_instance_id'],'chat_room_members',['membership_instance_id']],
    [['message_id'],'chat_messages',['id']]]) {
    if (!constraints.some(c=>c.table_name==='chat_message_views' && c.contype==='f'
      && !c.condeferrable && c.convalidated && c.confdeltype==='c' && c.confupdtype==='a'
      && c.target===target && same(c.columns,names) && same(c.target_columns,targetColumns))) {
      throw Error('Private chat view cleanup foreign keys are missing or incompatible');
    }
  }
  const triggers=(await client.query(`SELECT t.tgname,t.tgtype,t.tgenabled,t.tgrelid::regclass::text AS table_name,
      t.tgconstraint,t.tgnargs,t.tgattr::text AS columns,t.tgqual IS NULL AS no_condition,p.proname,p.prosrc,p.prosecdef,
      p.proconfig,p.prorettype::regtype::text AS result_type,l.lanname
    FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_language l ON l.oid=p.prolang
    WHERE t.tgrelid IN ('chat_room_members'::regclass,'chat_messages'::regclass,'chat_attachments'::regclass,'chat_message_views'::regclass)
      AND NOT t.tgisinternal`)).rows;
  if (triggers.length!==3) throw Error('Private chat view tables have unexpected user triggers');
  const rules=(await client.query(`SELECT rulename FROM pg_rewrite WHERE ev_class IN
    ('chat_room_members'::regclass,'chat_messages'::regclass,'chat_attachments'::regclass,'chat_message_views'::regclass)`)).rows;
  if (rules.length) throw Error('Private chat view tables must not have rewrite rules');
  const sql=fs.readFileSync(path.join(__dirname,'../migrations',name),'utf8');
  for (const [name,table,type] of [['chat_view_membership_identity','chat_room_members',23],
    ['chat_view_message_version','chat_messages',23],['chat_view_attachment_version','chat_attachments',29]]) {
    const start=sql.indexOf('CREATE FUNCTION '+name+'()');
    const body=sql.slice(sql.indexOf('$body$',start)+6,sql.indexOf('$body$;',start));
    const t=triggers.find(t=>t.tgname===name && t.table_name===table);
    if (!t || Number(t.tgtype)!==type || t.tgenabled!=='O' || t.proname!==name
      || Number(t.tgconstraint)!==0 || Number(t.tgnargs)!==0 || t.columns!=='' || !t.no_condition
      || t.prosrc!==body || t.prosecdef || t.proconfig!==null
      || t.result_type!=='trigger' || t.lanname!=='plpgsql') {
      throw Error('Private chat view identity/version triggers are missing or incompatible');
    }
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
    if (previous && previous.sha256 !== digest) throw Error('Private chat view migration checksum changed');
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
  try { await migrate(client); console.log('Private chat view schema completed and verified.'); }
  finally { await client.end(); }
}
if (require.main===module) main().catch(error => { console.error('Private chat view migration failed; deployment stopped.', error.message); process.exitCode=1; });
module.exports = {migrate, verify};
