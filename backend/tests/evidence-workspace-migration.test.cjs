const test = require('node:test');
const assert = require('node:assert/strict');
const {PGlite} = require('@electric-sql/pglite');
const {migrate} = require('../scripts/run-attachment-schema-migration.cjs');
const {run,steps} = require('../scripts/run-release-predeploy.cjs');

test('attachment schema is a required fail-closed predeploy step before receipts', () => {
  const index = steps.indexOf('run-attachment-schema-migration.cjs');
  assert.ok(index >= 0 && index < steps.indexOf('run-evidence-receipts-migration.cjs'));
  const called = [];
  assert.throws(() => run((_node,args) => {
    called.push(args[0]);
    return {status:args[0].endsWith('run-attachment-schema-migration.cjs') ? 1 : 0};
  }), /Release migration failed: run-attachment-schema-migration/);
  assert.equal(called.length,index+1);
});

test('production attachment migration creates required fields, reruns safely and rejects incompatible schema', async () => {
  const db = new PGlite();
  const client = {query:sql=>db.exec(sql)};
  try {
    await db.exec(['companies','users','shifts','time_entries','projects','tasks'].map(name=>`CREATE TABLE ${name}(id uuid PRIMARY KEY)`).join(';'));
    await migrate(client);
    const id = '00000000-0000-4000-a000-000000000001';
    await db.query('INSERT INTO companies VALUES($1)',[id]);
    await db.query('INSERT INTO users VALUES($1)',[id]);
    await db.query("INSERT INTO attachments(company_id,uploaded_by,file_name,file_url,category) VALUES($1,$1,'existing.pdf','https://example.test/existing','private')",[id]);
    const before = (await db.query('SELECT * FROM attachments')).rows;
    await migrate(client);
    assert.deepEqual((await db.query('SELECT * FROM attachments')).rows,before,'rerun preserves existing attachment data and access fields');
    await db.query('SELECT id,time_entry_id,file_name,file_url,file_type,file_size,created_at FROM attachments WHERE company_id=$1 AND time_entry_id=ANY($2::uuid[]) ORDER BY created_at DESC,id DESC', ['00000000-0000-4000-a000-000000000001',[]]);
    await db.exec('ALTER TABLE attachments DROP COLUMN file_type');
    await assert.rejects(migrate(client), /file_type/);
    // A failed migration has rolled back and left the connection usable.
    assert.equal((await db.query('SELECT COUNT(*) AS count FROM attachments')).rows[0].count,1);
  } finally {await db.close();}
});

test('missing prerequisite tables roll back instead of permitting an incomplete schema', async () => {
  const db = new PGlite();
  try {
    await assert.rejects(migrate({query:sql=>db.exec(sql)}), /companies/);
    assert.equal((await db.query("SELECT to_regclass('attachments') AS table_name")).rows[0].table_name,null);
  } finally {await db.close();}
});


test('schema migration never registers extensions or changes notifications', () => {
  const fs = require('node:fs'), path = require('node:path');
  const sql = fs.readFileSync(path.join(__dirname,'../migrations/20261111_attachment_schema.sql'),'utf8');
  assert.doesNotMatch(sql,/CREATE EXTENSION|in_app_notifications/i);
});

test('unavailable UUID function fails closed with a database-owner prerequisite', async () => {
  const calls=[];
  await assert.rejects(migrate({query:async sql=>{calls.push(sql);if(sql.includes('SELECT gen_random_uuid()'))throw Error('function missing');}}),/requires gen_random_uuid/);
  assert.equal(calls.at(-1),'ROLLBACK');
  assert.ok(!calls.some(sql=>sql.includes('CREATE TABLE')));
});
