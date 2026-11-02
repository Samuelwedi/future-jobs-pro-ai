const fs=require('node:fs'),path=require('node:path'),{pool}=require('../dist/config/database');
async function main(){const c=await pool.connect();try{await c.query(fs.readFileSync(path.join(__dirname,'../migrations/20261101_reviewed_year_end_archive.sql'),'utf8'));await c.query('SELECT company_id,preview_hash,snapshot FROM reviewed_year_end_slips LIMIT 0');console.log('Reviewed year-end archive schema verified.');}finally{c.release();await pool.end();}}
main().catch(()=>{console.error('Reviewed year-end archive migration failed. Verify database prerequisites.');process.exitCode=1;});
