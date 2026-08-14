const fs=require('fs'),path=require('path'); const {Pool}=require('pg'); require('dotenv').config({path:path.join(__dirname,'..','.env')});
async function main(){if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is not configured');const pool=new Pool({connectionString:process.env.DATABASE_URL});try{await pool.query(fs.readFileSync(path.join(__dirname,'..','migrations','20260813_company_admin_operations.sql'),'utf8'));console.log('Company admin operations migration completed.');}finally{await pool.end();}}
main().catch(error=>{console.error(error);process.exit(1);});
