const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const {createGoogleBilling,parseGoogleEntitlement,googleAccountId,purchaseHash,verifyGooglePush}=require('../dist/services/googleSubscriptionService');
const {OAuth2Client}=require('google-auth-library');
const {decrypt}=require('../dist/services/encryptionService');
process.env.ENCRYPTION_KEY='google-release-test-encryption-key-not-for-production';
const c='00000000-0000-4000-a000-000000000001',u='00000000-0000-4000-a000-000000000002';
const other='00000000-0000-4000-a000-000000000003',p='com.samuel33.futurejobspro.team_35_monthly';
let db,service,data,calls=[];
const base=()=>({lineItems:[{productId:p,expiryTime:new Date(Date.now()+86400000).toISOString(),autoRenewingPlan:{autoRenewEnabled:true}}],
 subscriptionState:'SUBSCRIPTION_STATE_ACTIVE',acknowledgementState:'ACKNOWLEDGEMENT_STATE_PENDING',
 externalAccountIdentifiers:{obfuscatedExternalAccountId:googleAccountId(c,u)}});
before(async()=>{
 db=new PGlite();
 await db.exec(`CREATE TABLE companies(id uuid primary key,subscription_tier text,subscription_status text,subscription_provider text,
 subscription_expires_at timestamptz,subscription_current_period_end timestamptz,subscription_cancel_at_period_end boolean,subscription_updated_at timestamptz);
 CREATE TABLE users(id uuid primary key,company_id uuid,is_active boolean default true);
 CREATE TABLE ops_limits(company_id uuid primary key,employees integer,monthly_ai_requests integer,document_bytes bigint);
 INSERT INTO companies(id) VALUES('${c}'),('${other}'); INSERT INTO users(id,company_id) VALUES('${u}','${c}');`);
 const sql=fs.readFileSync(path.join(__dirname,'../migrations/20260930_google_play_billing.sql'),'utf8');
 await db.exec(sql);await db.exec(sql);
 const query=async(sql,values)=>{
  if(sql.includes('pg_advisory_xact_lock'))return {rows:[],rowCount:0}; // PostgreSQL concurrency lock; PGlite has one connection.
  const r=await db.query(sql,values);return {rows:r.rows,rowCount:r.rows.length||r.affectedRows||0};
 };
 service=createGoogleBilling({query,connect:async()=>({query,release(){}})},async(url,method)=>{calls.push({url,method});return structuredClone(data);});
});
after(async()=>{await db.close();});
test('pending, held, paused and expired purchases never grant access',()=>{
 for(const state of ['SUBSCRIPTION_STATE_PENDING','SUBSCRIPTION_STATE_ON_HOLD','SUBSCRIPTION_STATE_PAUSED','SUBSCRIPTION_STATE_EXPIRED']){
  const d=base();d.subscriptionState=state;assert.equal(parseGoogleEntitlement(d,p).status,'expired');
 }
 const d=base();d.lineItems[0].expiryTime='2000-01-01';assert.equal(parseGoogleEntitlement(d,p).status,'expired');
});
test('cancellation keeps only the paid period and grace is bounded by expiry',()=>{
 for(const state of ['SUBSCRIPTION_STATE_CANCELED','SUBSCRIPTION_STATE_IN_GRACE_PERIOD']){
  const d=base();d.subscriptionState=state;assert.equal(parseGoogleEntitlement(d,p).status,'active');
 }
});
test('wrong account, product, invalid expiry and test purchase rejected',()=>{
 assert.throws(()=>parseGoogleEntitlement(base(),p,'wrong'),/signed-in/);
 assert.throws(()=>parseGoogleEntitlement(base(),'toString'),/recognized/);
 const d=base();d.lineItems[0].expiryTime='invalid';assert.throws(()=>parseGoogleEntitlement(d,p),/expiry/);
 const t=base();t.testPurchase={};delete process.env.GOOGLE_PLAY_ALLOW_TEST_PURCHASES;
 assert.throws(()=>parseGoogleEntitlement(t,p),/Test purchases/);
});
test('verified purchase persists encrypted proof, applies allowance and acknowledges once per delivery',async()=>{
 data=base();calls=[];const r=await service.verify({companyId:c,userId:u,productId:p,purchaseToken:'proof-1'});
 assert.equal(r.status,'active');assert.equal(calls[1].method,'POST');assert.match(calls[1].url,/:acknowledge$/);
 const row=(await db.query('SELECT * FROM google_play_purchases')).rows[0];
 assert.equal(row.token_hash,purchaseHash('proof-1'));assert.notEqual(row.token_encrypted,'proof-1');assert.equal(decrypt(row.token_encrypted),'proof-1');
 assert.equal((await db.query('SELECT employees FROM ops_limits')).rows[0].employees,35);
});
test('replay is idempotent and another company cannot claim the same receipt',async()=>{
 data=base();data.acknowledgementState='ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED';calls=[];
 await service.verify({companyId:c,userId:u,productId:p,purchaseToken:'proof-1'});
 assert.equal(calls.length,1);assert.equal((await db.query('SELECT * FROM google_play_purchases')).rows.length,1);
 await assert.rejects(service.verify({companyId:other,userId:u,productId:p,purchaseToken:'proof-1'}),/another workspace/);
});
test('new purchase with mismatched account leaves no record',async()=>{
 data=base();data.externalAccountIdentifiers.obfuscatedExternalAccountId='wrong';
 await assert.rejects(service.verify({companyId:c,userId:u,productId:p,purchaseToken:'bad-proof'}),/signed-in/);
 assert.equal((await db.query('SELECT * FROM google_play_purchases')).rows.length,1);
});
test('authenticated notification refreshes store state instead of trusting event type',async()=>{
 data=base();data.subscriptionState='SUBSCRIPTION_STATE_ON_HOLD';
 await service.notification({message:{data:Buffer.from(JSON.stringify({packageName:'com.samuel33.futurejobspro',subscriptionNotification:{purchaseToken:'proof-1',notificationType:2}})).toString('base64')}});
 assert.equal((await db.query('SELECT subscription_status FROM companies WHERE id=$1',[c])).rows[0].subscription_status,'expired');
});
test('old Google notification cannot overwrite another billing provider',async()=>{
 await db.query("UPDATE companies SET subscription_provider='stripe',subscription_status='active' WHERE id=$1",[c]);
 data=base();data.subscriptionState='SUBSCRIPTION_STATE_EXPIRED';
 await service.notification({message:{data:Buffer.from(JSON.stringify({packageName:'com.samuel33.futurejobspro',subscriptionNotification:{purchaseToken:'proof-1'}})).toString('base64')}});
 assert.equal((await db.query('SELECT subscription_status FROM companies WHERE id=$1',[c])).rows[0].subscription_status,'active');
});
test('notification authentication checks audience and exact service-account identity',async()=>{
 await assert.rejects(verifyGooglePush(),/authentication/);
 process.env.GOOGLE_PLAY_RTDN_AUDIENCE='https://example.test/api/subscriptions/google/notifications';
 process.env.GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT='pubsub@example.iam.gserviceaccount.com';
 const original=OAuth2Client.prototype.verifyIdToken;
 try{
  OAuth2Client.prototype.verifyIdToken=async function(options){assert.equal(options.audience,process.env.GOOGLE_PLAY_RTDN_AUDIENCE);return {getPayload:()=>({email:'wrong',email_verified:true})};};
  await assert.rejects(verifyGooglePush('Bearer test'),/Invalid notification/);
  OAuth2Client.prototype.verifyIdToken=async()=>({getPayload:()=>({email:process.env.GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT,email_verified:true})});
  await verifyGooglePush('Bearer test');
 }finally{OAuth2Client.prototype.verifyIdToken=original;}
});
