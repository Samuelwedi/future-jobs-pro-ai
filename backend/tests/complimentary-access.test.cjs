require('./company-billing.test.cjs');
const {test}=require('node:test');const assert=require('node:assert/strict');
const {hasComplimentaryAccess,complimentarySubscription}=require('../dist/services/complimentaryAccess');
test('complimentary tester is exact user plus company, non-expiring and disabled by default',()=>{
 const old=process.env.COMPLIMENTARY_TESTER_IDENTITY;
 const user='00000000-0000-4000-a000-000000000001',company='00000000-0000-4000-a000-000000000002',other='00000000-0000-4000-a000-000000000003';
 try {
  delete process.env.COMPLIMENTARY_TESTER_IDENTITY;assert.equal(hasComplimentaryAccess(user,company),false);
  process.env.COMPLIMENTARY_TESTER_IDENTITY=`${user}:${company}`;
  assert.equal(hasComplimentaryAccess(user,company),true);
  assert.equal(hasComplimentaryAccess(other,company),false);
  assert.equal(hasComplimentaryAccess(user,other),false);
  assert.equal(hasComplimentaryAccess('samuel@test.com',company),false);
  assert.equal(complimentarySubscription().currentPeriodEnd,null);
  assert.equal(complimentarySubscription().hasStripeSubscription,false);
 } finally {if(old===undefined)delete process.env.COMPLIMENTARY_TESTER_IDENTITY;else process.env.COMPLIMENTARY_TESTER_IDENTITY=old;}
});
