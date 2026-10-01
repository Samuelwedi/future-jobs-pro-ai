const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const sdkPath=require.resolve('@apple/app-store-server-library');
const sdk=require(sdkPath);
const jws=value=>'header.'+Buffer.from(JSON.stringify(value)).toString('base64url')+'.signature';
const payload=s=>JSON.parse(Buffer.from(s.split('.')[1],'base64url').toString());
let current,apiCalls=0;
require.cache[sdkPath].exports={...sdk,
 SignedDataVerifier:class {async verifyAndDecodeTransaction(s){return payload(s);}async verifyAndDecodeRenewalInfo(s){return payload(s);}async verifyAndDecodeNotification(s){return payload(s);}},
 AppStoreServerAPIClient:class{async getAllSubscriptionStatuses(){apiCalls++;return current;}}};
const {pool}=require('../dist/config/database');
const {verifyApplePurchase,processAppleNotification}=require('../dist/services/appleSubscriptionService');
const {applyPlanAllowance}=require('../dist/config/billingPlans');
const c='00000000-0000-4000-a000-000000000001',u='00000000-0000-4000-a000-000000000002',other='00000000-0000-4000-a000-000000000003';
const p='com.samuel33.futurejobspro.team_10_monthly';let db;
const transaction=()=>({environment:'Sandbox',bundleId:'com.samuel33.futurejobspro',productId:p,originalTransactionId:'original-1',transactionId:'latest-1',appAccountToken:u,expiresDate:Date.now()+86400000});
const setup=(status=1,tx=transaction())=>{current={data:[{lastTransactions:[{status,originalTransactionId:tx.originalTransactionId,signedTransactionInfo:jws(tx),signedRenewalInfo:jws({autoRenewStatus:1})}]}]};};
before(async()=>{
 Object.assign(process.env,{APPLE_IAP_ALLOW_SANDBOX:'true',APPLE_IAP_SANDBOX_COMPANY_IDS:[c,other].join(','),APPLE_ROOT_CA_G3_BASE64:Buffer.alloc(600).toString('base64'),APPLE_IAP_PRIVATE_KEY:'test-only',APPLE_IAP_KEY_ID:'test',APPLE_IAP_ISSUER_ID:'test'});
 db=new PGlite();await db.exec(`CREATE TABLE companies(id uuid primary key,subscription_tier text,subscription_status text,subscription_provider text,subscription_expires_at timestamptz,subscription_current_period_end timestamptz,subscription_cancel_at_period_end boolean,subscription_updated_at timestamptz);
 CREATE TABLE users(id uuid primary key,company_id uuid,is_active boolean default true);
 CREATE TABLE ops_limits(company_id uuid primary key,employees integer,monthly_ai_requests integer,document_bytes bigint);
 INSERT INTO companies(id) VALUES('${c}'),('${other}');INSERT INTO users(id,company_id) VALUES('${u}','${c}');`);
 for(const file of ['20260817_apple_iap.sql','20260930_google_play_billing.sql','20260930_billing_catalog.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../migrations',file),'utf8'));
 await db.exec(fs.readFileSync(path.join(__dirname,'../migrations/20260930_billing_catalog.sql'),'utf8'));
 const query=async(sql,args)=>{if(sql.includes('pg_advisory_xact_lock'))return {rows:[],rowCount:0};const r=await db.query(sql,args);return {rows:r.rows,rowCount:r.rows.length||r.affectedRows||0};};
 pool.query=query;pool.connect=async()=>({query,release(){}});
});
after(async()=>{await db.close();await pool.end();});
test('old valid Apple receipt cannot restore a revoked purchase',async()=>{
 setup(5);await assert.rejects(verifyApplePurchase({companyId:c,userId:u,productId:p,signedTransaction:jws(transaction())}),/revoked/);
 assert.equal((await db.query('SELECT * FROM mobile_subscription_transactions')).rows.length,0);assert.equal(apiCalls,1);
});
test('live Apple status grants exactly one company entitlement and finite allowance',async()=>{
 setup();const args={companyId:c,userId:u,productId:p,signedTransaction:jws(transaction())};
 assert.equal((await verifyApplePurchase(args)).status,'active');await verifyApplePurchase(args);
 assert.equal((await db.query('SELECT * FROM mobile_subscription_transactions')).rows.length,1);
 assert.equal((await db.query('SELECT employees FROM ops_limits')).rows[0].employees,10);
 await assert.rejects(verifyApplePurchase({...args,companyId:other}),/another workspace/);
});
test('Apple rejects mismatched account and provider switching with an active subscription',async()=>{
 setup();await assert.rejects(verifyApplePurchase({companyId:c,userId:other,productId:p,signedTransaction:jws(transaction())}),/signed-in/);
 await db.query("UPDATE companies SET subscription_provider='stripe' WHERE id=$1",[c]);
 await assert.rejects(verifyApplePurchase({companyId:c,userId:u,productId:p,signedTransaction:jws(transaction())}),/existing subscription/);
});
test('old Apple notification cannot overwrite a different provider',async()=>{
 setup(5);await processAppleNotification(jws({data:{environment:'Sandbox',signedTransactionInfo:jws(transaction())},notificationUUID:'event-1'}));
 const company=(await db.query('SELECT * FROM companies WHERE id=$1',[c])).rows[0];assert.equal(company.subscription_provider,'stripe');assert.equal(company.subscription_status,'active');
});
test('configured account cap blocks every insertion path without deleting existing users',async()=>{
 await db.query('UPDATE ops_limits SET employees=1 WHERE company_id=$1',[c]);
 await assert.rejects(db.query('INSERT INTO users(id,company_id) VALUES($1,$2)',['00000000-0000-4000-a000-000000000099',c]),/allowance reached/);
 assert.equal((await db.query('SELECT * FROM users')).rows.length,1);
 await applyPlanAllowance(pool,c,'team_35');await db.query('INSERT INTO users(id,company_id) VALUES($1,$2)',['00000000-0000-4000-a000-000000000099',c]);
});
