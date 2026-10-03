require('./vacation-policy.test.cjs');
require('./company-overtime.test.cjs');
require('./web-media-security.test.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {sqlBody}=require('../scripts/release-database.cjs');
const {BILLING_PLANS,STORE_PLANS}=require('../dist/config/billingPlans');
test('legacy server entry point cannot start an unauthenticated alternate API', () => {
 const entry=fs.readFileSync(path.join(__dirname,'../src/server.ts'),'utf8');
 assert.match(entry,/^import '\.\/index';/m);
 assert.doesNotMatch(entry,/server\.listen\(|socket\.on\(/);
});
test('migration runner strips transaction wrappers but preserves PL/pgSQL blocks',()=>{
 const input='BEGIN;\nDO $$\nBEGIN\n NULL;\nEND $$;\nCOMMIT;\n';
 assert.equal(sqlBody(input).trim(),'DO $$\nBEGIN\n NULL;\nEND $$;');
 for(const file of fs.readdirSync(path.join(__dirname,'../migrations'))){
  if(!file.endsWith('.sql'))continue;
  const body=sqlBody(fs.readFileSync(path.join(__dirname,'../migrations',file),'utf8'));
  assert.doesNotMatch(body,/^(?:BEGIN|COMMIT);\s*$/m,file);
 }
});
test('new sale plans are capped and preserve legacy store identity',()=>{
 const sizes=Object.values(BILLING_PLANS).filter(p=>p.sale).map(p=>p.employees);
 assert.deepEqual(sizes,[10,35,50,65,80,95,110]);
 assert.equal(BILLING_PLANS.enterprise.sale,false);
 assert.equal(STORE_PLANS.get('com.samuel33.futurejobspro.professional_monthly'),'professional');
 for(const [key,p] of Object.entries(BILLING_PLANS).filter(([,p])=>p.sale)){
  assert.ok(p.cadCents>0);assert.ok(Number.isFinite(p.employees));assert.equal(STORE_PLANS.get(`com.samuel33.futurejobspro.${key}_monthly`),key);
 }
});
