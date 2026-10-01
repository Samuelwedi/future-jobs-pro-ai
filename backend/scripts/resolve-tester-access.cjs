// Read-only operator command. Resolve the existing account; never auto-register it.
const {Client}=require('pg');
async function main(){
 const connectionString=process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
 if(!connectionString)throw Error('Database connection is not configured');
 const db=new Client({connectionString});await db.connect();
 try {
  const result=await db.query(`SELECT u.id,u.company_id,u.role FROM users u JOIN companies c ON c.id=u.company_id
   WHERE lower(trim(u.email))=$1 AND COALESCE(u.is_active,true)=true
   AND COALESCE(NULLIF(to_jsonb(c)->>'is_active','')::boolean,true)=true`,['samuel@test.com']);
  if(result.rows.length!==1)throw Error('Expected exactly one active existing samuel@test.com account; no access was granted');
  const u=result.rows[0];if(!['boss','owner','admin'].includes(String(u.role).toLowerCase()))throw Error('Tester account is not an owner/admin; no access was granted');
  console.log('Set this application-service Railway variable, then redeploy:');
  console.log(`COMPLIMENTARY_TESTER_IDENTITY=${u.id}:${u.company_id}`);
  console.log('No database changes. No expiry. Other users and companies are excluded.');
 } finally {await db.end();}
}
main().catch(()=>{console.error('Tester identity could not be resolved uniquely. Check the existing account and database connection; no access was granted.');process.exitCode=1;});
