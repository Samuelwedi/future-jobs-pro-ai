const fs=require('node:fs');
const path=require('node:path');
const files=['20261108_lucy_background_work.sql','20261108_lucy_user_preferences.sql','20261108_lucy_request_ledger.sql'];
async function migrate(client){
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='10s'");
  await client.query("SET LOCAL statement_timeout='60s'");
  for(const file of files){
   // These additive schema files have top-level transaction wrappers only.
   const sql=fs.readFileSync(path.join(__dirname,'../migrations',file),'utf8').replace(/^\s*(BEGIN|COMMIT);\s*$/gm,'');
   await client.query(sql);
  }
  await client.query('SELECT id,company_id,user_id,actor_role,status,lease_token,lease_until FROM lucy_background_work LIMIT 0');
  await client.query('SELECT company_id,user_id,preference_key,value,provenance,expires_at FROM lucy_user_preferences LIMIT 0');
  await client.query('SELECT company_id,user_id,actor_role,request_id,payload_hash,status,response_body FROM lucy_request_ledger LIMIT 0');
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}
}
async function main(){const {pool}=require('../dist/config/database');let client;try{client=await pool.connect();await migrate(client);console.log('Lucy workspace schema completed and verified. Background inference still requires explicit activation.');}finally{client?.release();await pool.end();}}
if(require.main===module)main().catch(()=>{console.error('Lucy workspace migration failed; deployment stopped.');process.exitCode=1;});
module.exports={migrate,files};
