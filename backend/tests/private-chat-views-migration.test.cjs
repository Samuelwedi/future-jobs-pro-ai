'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {types}=require('pg');
const {PGlite}=require('@electric-sql/pglite');
const {migrate,verify}=require('../scripts/migrate-private-chat-views.cjs');
const uid=n=>`00000000-0000-4000-a000-${String(n).padStart(12,'0')}`;
const pgClient=db=>({query:(sql,args)=>db.query(sql,args,{parsers:{1003:types.getTypeParser(1003,'text'),1009:types.getTypeParser(1009,'text')}})});
async function fixture(t,unique=true) {
  const db=new PGlite();const originalQuery=db.query.bind(db);db.query=(sql,args,options)=>sql.startsWith('-- Viewer-private exact')?db.exec(sql).then(results=>results.at(-1)):originalQuery(sql,args,options);t.after(()=>db.close());
  await db.exec(`CREATE TABLE chat_room_members(room_id text,user_id uuid${unique?',PRIMARY KEY(room_id,user_id)':''});
    CREATE TABLE chat_messages(id uuid PRIMARY KEY,room_id text,company_id uuid,sender_id uuid,message text,attachment_id uuid,created_at timestamptz);
    CREATE TABLE chat_attachments(id uuid PRIMARY KEY,room_id text,filename text,mime_type text,size_bytes integer,storage_public_id text,created_at timestamptz);
    INSERT INTO chat_room_members VALUES('room','${uid(1)}');
    INSERT INTO chat_messages(id,room_id,sender_id,message) VALUES('${uid(2)}','room','${uid(3)}','initial');`);
  return db;
}
async function ids(db) {return {member:(await db.query('SELECT membership_instance_id FROM chat_room_members')).rows[0].membership_instance_id,
  version:(await db.query('SELECT view_version FROM chat_messages ORDER BY id LIMIT 1')).rows[0].view_version};}
test('checksum migration is repeatable, uses pg text[] catalog decoding and preserves exact state',async t=>{
  const db=await fixture(t),client=pgClient(db);let catalogs=0;
  const checked={query:async(sql,args)=>{const r=await client.query(sql,args);if(sql.includes('unnest(c.conkey)')){catalogs++;assert.equal(r.fields.find(f=>f.name==='columns').dataTypeID,1009);assert(Array.isArray(r.rows[0].columns));}return r;}};
  await migrate(checked);const original=await ids(db);await db.query('INSERT INTO chat_message_views VALUES($1,$2,$3)',[original.member,uid(2),original.version]);
  await migrate(checked);assert.equal(catalogs,2);assert.deepEqual(await ids(db),original);
  assert.equal((await db.query('SELECT count(*)::int n FROM chat_message_views')).rows[0].n,1);
  assert.equal((await db.query('SELECT count(*)::int n FROM app_release_migrations')).rows[0].n,1);
  const uncast={query:(sql,args)=>client.query(sql.replaceAll('a.attname::text','a.attname'),args)};
  await assert.rejects(verify(uncast),/uniqueness/);
});
test('membership inserts ignore supplied identity, updates are immutable and deletion cleans up',async t=>{
  const db=await fixture(t);await migrate(db);const old=await ids(db);
  await db.query('INSERT INTO chat_message_views VALUES($1,$2,$3)',[old.member,uid(2),old.version]);
  await assert.rejects(db.query('UPDATE chat_room_members SET membership_instance_id=$1',[uid(90)]),e=>e.code==='23514');
  await assert.rejects(db.exec("UPDATE chat_room_members SET room_id='other'"),e=>e.code==='23514');
  await assert.rejects(db.query('UPDATE chat_room_members SET user_id=$1',[uid(90)]),e=>e.code==='23514');
  await db.exec('DELETE FROM chat_room_members');assert.equal((await db.query('SELECT count(*)::int n FROM chat_message_views')).rows[0].n,0);
  await db.query('INSERT INTO chat_room_members VALUES($1,$2,$3)',['room',uid(1),old.member]);assert.notEqual((await ids(db)).member,old.member);
});
test('message versions rotate for material changes, cannot be reused, and ignore date repair',async t=>{
  const db=await fixture(t);await migrate(db);let last=(await ids(db)).version;
  await db.exec("UPDATE chat_messages SET created_at=now();UPDATE chat_messages SET message=message");assert.equal((await ids(db)).version,last);
  for(const [field,value] of [['message','changed'],['attachment_id',uid(4)],['sender_id',uid(5)],['room_id','elsewhere'],['company_id',uid(6)],['view_version',last]]) {
    await db.query(`UPDATE chat_messages SET ${field}=$1`,[value]);const next=(await ids(db)).version;assert.notEqual(next,last);assert.notEqual(next,value);last=next;
  }
  await assert.rejects(db.query('UPDATE chat_messages SET id=$1',[uid(90)]),e=>e.code==='23514');
  await db.query('INSERT INTO chat_messages(id,view_version) VALUES($1,$2)',[uid(91),last]);
  assert.notEqual((await db.query('SELECT view_version FROM chat_messages WHERE id=$1',[uid(91)])).rows[0].view_version,last);
});
test('attachment changes rotate existing messages, date-only changes do not; message deletion cascades',async t=>{
  const db=await fixture(t);await migrate(db);await db.query('UPDATE chat_messages SET attachment_id=$1',[uid(4)]);let last=(await ids(db)).version;
  await db.query("INSERT INTO chat_attachments(id,room_id,filename) VALUES($1,'room','file')",[uid(4)]);assert.notEqual((await ids(db)).version,last);last=(await ids(db)).version;
  await db.exec('UPDATE chat_attachments SET created_at=now()');assert.equal((await ids(db)).version,last);
  for(const change of ["filename='different'","mime_type='text/plain'","storage_public_id='new-content'","room_id='other'","size_bytes=4"]) {
    await db.exec('UPDATE chat_attachments SET '+change);assert.notEqual((await ids(db)).version,last);last=(await ids(db)).version;
  }
  await db.exec('DELETE FROM chat_attachments');assert.notEqual((await ids(db)).version,last);
  const current=await ids(db);await db.query('INSERT INTO chat_message_views VALUES($1,$2,$3)',[current.member,uid(2),current.version]);
  await db.exec('DELETE FROM chat_messages');assert.equal((await db.query('SELECT count(*)::int n FROM chat_message_views')).rows[0].n,0);
});
for(const [label,change,pattern] of [
  ['extra private column','ALTER TABLE chat_message_views ADD COLUMN viewed_at timestamptz DEFAULT now()',/columns/],
  ['private default',"ALTER TABLE chat_message_views ALTER COLUMN view_version SET DEFAULT gen_random_uuid()",/columns/],
  ['unique without primary key','ALTER TABLE chat_message_views DROP CONSTRAINT chat_message_views_pkey;ALTER TABLE chat_message_views ADD UNIQUE(membership_instance_id,message_id)',/uniqueness/],
  ['competing message trigger',"CREATE FUNCTION tamper_version() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.view_version:=OLD.view_version;RETURN NEW; END $$;CREATE TRIGGER z_tamper_version BEFORE UPDATE ON chat_messages FOR EACH ROW EXECUTE FUNCTION tamper_version()",/triggers/],
  ['competing membership trigger',"CREATE FUNCTION tamper_member() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.membership_instance_id:='00000000-0000-4000-a000-000000000001';RETURN NEW; END $$;CREATE TRIGGER z_tamper_member BEFORE INSERT ON chat_room_members FOR EACH ROW EXECUTE FUNCTION tamper_member()",/triggers/],
  ['receipt rewrite','CREATE RULE swallow_views AS ON INSERT TO chat_message_views DO INSTEAD NOTHING',/rewrite rules/],
  ['missing version column','ALTER TABLE chat_messages DROP COLUMN view_version',/columns/],
  ['nullable version','ALTER TABLE chat_messages ALTER COLUMN view_version DROP NOT NULL',/columns/],
  ['wrong default',"ALTER TABLE chat_messages ALTER COLUMN view_version SET DEFAULT '00000000-0000-4000-a000-000000000000'",/columns/],
  ['missing unique','ALTER TABLE chat_message_views DROP CONSTRAINT chat_message_views_pkey',/uniqueness/],
  ['deferrable unique','ALTER TABLE chat_message_views DROP CONSTRAINT chat_message_views_pkey;ALTER TABLE chat_message_views ADD UNIQUE(membership_instance_id,message_id) DEFERRABLE INITIALLY DEFERRED',/uniqueness/],
  ['missing cleanup','ALTER TABLE chat_message_views DROP CONSTRAINT chat_message_views_member_fkey',/foreign keys/],
  ['wrong cleanup','ALTER TABLE chat_message_views DROP CONSTRAINT chat_message_views_message_fkey;ALTER TABLE chat_message_views ADD FOREIGN KEY(message_id) REFERENCES chat_messages(id)',/foreign keys/],
  ['column-limited trigger','DROP TRIGGER chat_view_message_version ON chat_messages;CREATE TRIGGER chat_view_message_version BEFORE INSERT OR UPDATE OF message ON chat_messages FOR EACH ROW EXECUTE FUNCTION chat_view_message_version()',/triggers/],
  ['disabled trigger','ALTER TABLE chat_messages DISABLE TRIGGER chat_view_message_version',/triggers/],
  ['wrong trigger body',"CREATE OR REPLACE FUNCTION chat_view_message_version() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$",/triggers/],
])test('repeat migration rejects '+label,async t=>{
  const db=await fixture(t);await migrate(db);await db.exec(change);await assert.rejects(migrate(pgClient(db)),pattern);
});
test('duplicate or partially initialized legacy schema fails without silently changing data',async t=>{
  const db=await fixture(t,false);await db.query("INSERT INTO chat_room_members VALUES('room',$1)",[uid(1)]);
  await assert.rejects(migrate(db),e=>e.code==='23505');
  assert.equal((await db.query('SELECT count(*)::int n FROM chat_room_members')).rows[0].n,2);
  assert.equal((await db.query("SELECT to_regclass('chat_message_views') AS name")).rows[0].name,null);
  await db.exec('ALTER TABLE chat_messages ADD COLUMN view_version text');
  await assert.rejects(migrate(db));
  assert.equal((await db.query("SELECT to_regclass('app_release_migrations') AS name")).rows[0].name,null);
});
test('failed verification rolls back all new schema; checksum drift stops deployment',async t=>{
  const db=await fixture(t);const broken={query:(sql,args)=>{if(sql.includes('information_schema.columns'))throw Error('Injected verifier failure');return db.query(sql,args);}};
  await assert.rejects(migrate(broken),/Injected/);assert.equal((await db.query("SELECT to_regclass('chat_message_views') AS name")).rows[0].name,null);
  await migrate(db);await db.exec("UPDATE app_release_migrations SET sha256='changed'");await assert.rejects(migrate(db),/checksum changed/);
  const {steps,run}=require('../scripts/run-release-predeploy.cjs');const index=steps.indexOf('migrate-private-chat-views.cjs');assert.equal(steps[index-1],'migrate-chat-text-requests.cjs');
  const seen=[];assert.throws(()=>run((_exe,args)=>{const name=path.basename(args[0]);seen.push(name);return {status:name==='migrate-private-chat-views.cjs'?1:0};}),/Release migration failed/);
  assert.deepEqual(seen,steps.slice(0,index+1));
});
