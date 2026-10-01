// Receives Railway variable JSON over stdin. Never prints variable values.
const fs=require('node:fs');
const {BILLING_PLANS}=require('../dist/config/billingPlans');
const vars=process.argv.includes('--stdin')?JSON.parse(fs.readFileSync(0,'utf8')):process.env;
const rows=[];
const check=(name,pass)=>rows.push({check:name,passed:Boolean(pass)});
const present=n=>typeof vars[n]==='string'&&vars[n].trim().length>0;
const https=n=>{try{return new URL(vars[n]).protocol==='https:';}catch{return false;}};
check('Production mode',vars.NODE_ENV==='production');
for(const n of ['DATABASE_URL','REDIS_URL','JWT_SECRET','ENCRYPTION_KEY','SMTP_HOST','SMTP_USER','SMTP_PASS','CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET','OPENAI_API_KEY','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET'])check(n,present(n));
check('JWT secret length',(vars.JWT_SECRET||'').length>=32);check('Encryption key length',(vars.ENCRYPTION_KEY||'').length>=32);
check('FRONTEND_URL HTTPS',https('FRONTEND_URL'));
check('Local payout sandbox disabled',!vars.PAYOUT_LOCAL_SANDBOX || vars.PAYOUT_LOCAL_SANDBOX==='false');
check('Apple application ID',/^\d+$/.test(vars.APPLE_APP_ID||''));
for(const n of ['APPLE_IAP_PRIVATE_KEY','APPLE_IAP_KEY_ID','APPLE_IAP_ISSUER_ID'])check(n,present(n));
check('Apple trusted root certificates',present('APPLE_ROOT_CA_G2_BASE64')||present('APPLE_ROOT_CA_G3_BASE64'));
check('Apple sandbox company allowlist',vars.APPLE_IAP_ALLOW_SANDBOX!=='true'||present('APPLE_IAP_SANDBOX_COMPANY_IDS'));
let google;try{google=JSON.parse(vars.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON||'');}catch{}
check('Google service account JSON',google?.type==='service_account'&&google?.client_email&&google?.private_key);
check('Google RTDN HTTPS audience',https('GOOGLE_PLAY_RTDN_AUDIENCE'));
check('Google RTDN identity',/@.+\.iam\.gserviceaccount\.com$/.test(vars.GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT||''));
check('Google test company allowlist',vars.GOOGLE_PLAY_ALLOW_TEST_PURCHASES!=='true'||present('GOOGLE_PLAY_TEST_COMPANY_IDS'));
for(const p of Object.values(BILLING_PLANS).filter(p=>p.sale))check(p.envName,/^price_/.test(vars[p.envName]||''));
console.table(rows);const missing=rows.filter(r=>!r.passed).map(r=>r.check);
console.log(JSON.stringify({release:'1.2.1',configurationReady:!missing.length,missing,valuesPrinted:false,providerCredentialsVerified:false}));
if(missing.length)process.exitCode=2;
