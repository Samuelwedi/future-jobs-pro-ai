const {Client}=require('pg');const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
async function main(){
 if(!process.env.DATABASE_URL)throw Error('DATABASE_URL is required');
 const client=new Client({connectionString:process.env.DATABASE_URL,...(process.env.DB_SSL==='false'?{ssl:false}:process.env.DB_SSL==='true'?{ssl:{rejectUnauthorized:process.env.DB_SSL_REJECT_UNAUTHORIZED==='true'}}:{})});
 await client.connect();
 try{
  await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='10s'");await client.query("SELECT pg_advisory_xact_lock(hashtext('futurejobs-release-migration'))");
  const name='20261012_chat_media.sql',sql=fs.readFileSync(path.join(__dirname,'../migrations',name),'utf8'),digest=crypto.createHash('sha256').update(sql).digest('hex');
  await client.query('CREATE TABLE IF NOT EXISTS app_release_migrations(name text primary key,sha256 text not null,applied_at timestamptz not null default now())');
  const previous=(await client.query('SELECT sha256 FROM app_release_migrations WHERE name=$1',[name])).rows[0];
  if(previous&&previous.sha256!==digest)throw Error('Chat migration checksum changed');
  if(!previous){await client.query(sql.replace(/^BEGIN;\s*$/gm,'').replace(/^COMMIT;\s*$/gm,''));await client.query('INSERT INTO app_release_migrations(name,sha256) VALUES($1,$2)',[name,digest]);}
  await client.query('COMMIT');console.log('Chat media schema ready');
 }catch(e){await client.query('ROLLBACK');throw e;}finally{await client.end();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
