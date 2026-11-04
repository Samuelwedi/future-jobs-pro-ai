const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {pool}=require('../dist/config/database');
const mail=require('../dist/services/emailService');
const pdfPath=require.resolve('../dist/services/pdfService');
require.cache[pdfPath]={id:pdfPath,filename:pdfPath,loaded:true,exports:{generatePayStubPDFBuffer:async()=>Buffer.from('test PDF')}};
const {generatePayStubs}=require('../dist/services/payStubGenerator');
test('pay stub delivery status reflects provider acceptance, not requested delivery',async()=>{
 const write=fs.writeFileSync;let updates=0,fail=true,email='employee@example.test';
 fs.writeFileSync=()=>{};
 pool.query=async sql=>{
  if(sql.includes('FROM payrolls'))return {rows:[{company_name:'Test',period_start:'2026-11-01',period_end:'2026-11-07'}]};
  if(sql.includes('FROM payroll_items'))return {rows:[{employee_id:'employee',email,first_name:'Test',last_name:'Employee'}]};
  if(sql.includes('INSERT INTO pay_stubs'))return {rows:[{id:'stub'}]};
  if(sql.includes('UPDATE pay_stubs')){updates++;return {rows:[]};}
  throw Error('Unexpected query');
 };
 mail.sendPayStubEmail=async()=>{if(fail)throw Error('SMTP rejected');};
 try {
  assert.equal((await generatePayStubs('payroll',true))[0].sent,false);assert.equal(updates,0);
  fail=false;assert.equal((await generatePayStubs('payroll',true))[0].sent,true);assert.equal(updates,1);
  assert.equal((await generatePayStubs('payroll',false))[0].sent,false);assert.equal(updates,1);
  email=null;assert.equal((await generatePayStubs('payroll',true))[0].sent,false);assert.equal(updates,1);
 }finally{fs.writeFileSync=write;await pool.end();}
});
