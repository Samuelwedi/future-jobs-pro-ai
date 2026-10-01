// No dotenv loading: credentials must come from the selected Railway service.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {Client}=require('pg');
const root=path.resolve(__dirname,'../..'),directory=path.join(root,'backend/migrations');
const files=fs.readdirSync(directory).filter(x=>/^\d{8}_.+\.sql$/.test(x)).sort();
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function sqlBody(sql){return sql.replace(/^BEGIN;\s*$/gm,'').replace(/^COMMIT;\s*$/gm,'');}
function databaseUrl(){const raw=process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL;if(!raw)throw Error('Database URL is not configured');const u=new URL(raw);if(!['postgres:','postgresql:'].includes(u.protocol))throw Error('Not a PostgreSQL URL');return {raw,u};}
function backup(){
 const {raw,u}=databaseUrl();const dir=path.join(root,'production-backups');fs.mkdirSync(dir,{recursive:true});
 const name='before-1.2.1-'+new Date().toISOString().replace(/[:.]/g,'-')+'.dump';
 const target=path.join(dir,name);const env={...process.env,FJ_RELEASE_DATABASE_URL:raw};
 const result=spawnSync('docker',['run','--rm','--mount',`type=bind,source=${dir},target=/backup`,'--env','FJ_RELEASE_DATABASE_URL',
  'postgres:18-alpine','sh','-c',`exec pg_dump --format=custom --no-owner --no-privileges --file=/backup/${name} "$FJ_RELEASE_DATABASE_URL"`],{stdio:'inherit',env});
 if(result.status!==0)throw Error('Production backup failed');
 const check=spawnSync('docker',['run','--rm','--mount',`type=bind,source=${dir},target=/backup,readonly`,'postgres:18-alpine','pg_restore','--list',`/backup/${name}`],{encoding:'utf8'});
 if(check.status!==0 || !/TABLE DATA/.test(check.stdout))throw Error('Backup archive verification failed');
 const bytes=fs.readFileSync(target);if(bytes.subarray(0,5).toString()!=='PGDMP')throw Error('Backup format mismatch');
 const manifest={path:target,sha256:hash(bytes),host:u.hostname,database:u.pathname,createdAt:new Date().toISOString()};
 fs.writeFileSync(path.join(dir,'latest-release-backup.json'),JSON.stringify(manifest,null,2));
 console.log(JSON.stringify({result:'FULL BACKUP VERIFIED',...manifest},null,2));
}
async function migrate(apply=false){
 const {raw,u}=databaseUrl();
 if(apply){
  const b=JSON.parse(fs.readFileSync(path.join(root,'production-backups/latest-release-backup.json'),'utf8'));
  if(b.host!==u.hostname || b.database!==u.pathname || hash(fs.readFileSync(b.path))!==b.sha256 || Date.now()-Date.parse(b.createdAt)>86400000)
   throw Error('A matching verified backup from the last 24 hours is required');
 }
 const client=new Client({connectionString:raw,connectionTimeoutMillis:15000,
  ...(process.env.DB_SSL==='true'?{ssl:{rejectUnauthorized:process.env.DB_SSL_REJECT_UNAUTHORIZED!=='false'}}:{})});
 await client.connect();let committed=false;
 try{
  await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='10s'");await client.query("SET LOCAL statement_timeout='120s'");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('futurejobs-release-migration'))");
  const before=(await client.query('SELECT (SELECT count(*) FROM companies) companies,(SELECT count(*) FROM users) users')).rows[0];
  await client.query('CREATE TABLE IF NOT EXISTS app_release_migrations(name text primary key,sha256 text not null,applied_at timestamptz not null default now())');
  const installed=new Map((await client.query('SELECT name,sha256 FROM app_release_migrations')).rows.map(r=>[r.name,r.sha256]));
  let pending=0;
  for(const name of files){
   const body=fs.readFileSync(path.join(directory,name),'utf8'),digest=hash(Buffer.from(body));
   if(installed.has(name)){if(installed.get(name)!==digest)throw Error('Previously applied migration changed: '+name);continue;}
   await client.query(sqlBody(body));
   await client.query('INSERT INTO app_release_migrations(name,sha256) VALUES($1,$2)',[name,digest]);pending++;console.log('Checked '+name);
  }
  const after=(await client.query('SELECT (SELECT count(*) FROM companies) companies,(SELECT count(*) FROM users) users')).rows[0];
  if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Company/user row counts changed during migration');
  await client.query(apply?'COMMIT':'ROLLBACK');committed=true;
  console.log(JSON.stringify({result:apply?'MIGRATIONS COMMITTED':'DRY RUN PASSED AND ROLLED BACK',pending,before,after}));
 }finally{if(!committed)await client.query('ROLLBACK').catch(()=>{});await client.end();}
}
async function verify(){
 const {raw}=databaseUrl();const client=new Client({connectionString:raw,connectionTimeoutMillis:15000});await client.connect();
 try {const installed=new Map((await client.query('SELECT name,sha256 FROM app_release_migrations')).rows.map(r=>[r.name,r.sha256]));
  for(const name of files)if(installed.get(name)!==hash(fs.readFileSync(path.join(directory,name))))throw Error('Release migration missing or changed: '+name);
  console.log('All release migration hashes match the database ledger');
 }finally{await client.end();}
}
if(require.main===module){
 const command=process.argv[2];
 Promise.resolve().then(()=>{if(command==='backup')return backup();if(command==='dry-run')return migrate();if(command==='apply')return migrate(true);if(command==='verify')return verify();throw Error('Use backup, dry-run, apply or verify');}).catch(e=>{console.error(e.message);process.exitCode=1;});
}
module.exports={sqlBody};
