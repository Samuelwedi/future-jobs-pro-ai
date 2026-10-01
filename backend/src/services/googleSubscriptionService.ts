import { createHash } from 'crypto';
import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import { pool } from '../config/database';
import { encrypt, decrypt } from './encryptionService';
import { STORE_PLANS, applyPlanAllowance } from '../config/billingPlans';

const PACKAGE = 'com.samuel33.futurejobspro';
const ROOT = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}`;
const PRODUCTS: Record<string, string> = Object.fromEntries(STORE_PLANS);
export class BillingError extends Error {
 constructor(message: string, public status = 400) { super(message); }
}
export const purchaseHash = (value: string) => createHash('sha256').update(value).digest('hex');
export const googleAccountId = (company: string, user: string) => purchaseHash(`futurejobs:${company}:${user}`);
export function googleBillingReady() {
 return Boolean(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON && (process.env.ENCRYPTION_KEY?.length || 0) >= 32 &&
  process.env.GOOGLE_PLAY_RTDN_AUDIENCE && process.env.GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT);
}
async function googleRequest(path: string, method = 'GET') {
 if (!googleBillingReady()) throw new BillingError('Google Play billing is not configured', 503);
 let credentials;
 try { credentials = JSON.parse(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON!); }
 catch { throw new BillingError('Google Play credentials are not configured correctly', 503); }
 const auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/androidpublisher'] });
 try {
  const client = await auth.getClient();
  const response = await client.request({ url: ROOT + path, method: method as 'GET' | 'POST',
   ...(method === 'POST' ? { data: {} } : {}), timeout: 15000 });
  return response.data;
 } catch { throw new BillingError('Google Play could not verify this purchase. Please retry.', 503); }
}
export function parseGoogleEntitlement(data: any, productId: string, expectedAccount?: string) {
 const plan = Object.hasOwn(PRODUCTS,productId) ? PRODUCTS[productId] : undefined;
 if (!plan) throw new BillingError('Google Play product is not recognized');
 if (expectedAccount && data.externalAccountIdentifiers?.obfuscatedExternalAccountId !== expectedAccount)
  throw new BillingError('Purchase is not linked to this signed-in account', 403);
 if (data.testPurchase && process.env.GOOGLE_PLAY_ALLOW_TEST_PURCHASES !== 'true')
  throw new BillingError('Test purchases are disabled on this server');
 const items = data.lineItems?.filter((item: any) => item.productId === productId) || [];
 if (items.length !== 1 || data.lineItems.length !== 1) throw new BillingError('Purchase product does not match the requested plan');
 const expiry = new Date(items[0].expiryTime);
 if (!Number.isFinite(expiry.getTime())) throw new BillingError('Purchase expiry is invalid');
 const eligible = ['SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED'];
 const status = expiry.getTime() > Date.now() && eligible.includes(data.subscriptionState) ? 'active' : 'expired';
 return { plan, status, expiresAt: expiry.toISOString(), currentPeriodEnd: expiry.toISOString(), provider: 'google',
  cancelAtPeriodEnd: data.subscriptionState === 'SUBSCRIPTION_STATE_CANCELED' || items[0].autoRenewingPlan?.autoRenewEnabled === false };
}

// Dependencies can be replaced by tests; production always uses Google's API.
export function createGoogleBilling(db: any = pool, request: typeof googleRequest = googleRequest) {
 async function sync(args: { companyId: string; userId: string; productId: string; purchaseToken: string }, initial: boolean) {
  if (!args.purchaseToken || args.purchaseToken.length > 8192) throw new BillingError('Invalid purchase token');
  if (!Object.hasOwn(PRODUCTS,args.productId)) throw new BillingError('Google Play product is not recognized');
  const hash = purchaseHash(args.purchaseToken);
  const client = await db.connect();
  let committed=false;
  try {
   await client.query('BEGIN');
   // Locks prevent replay into two companies and stale concurrent entitlement updates.
   await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['google:' + hash]);
   const company = await client.query('SELECT * FROM companies WHERE id=$1 FOR UPDATE', [args.companyId]);
   if (!company.rowCount) throw new BillingError('Company was not found', 404);
   const owner = await client.query('SELECT company_id FROM google_play_purchases WHERE token_hash=$1', [hash]);
   if (owner.rowCount && String(owner.rows[0].company_id) !== args.companyId)
    throw new BillingError('Purchase already belongs to another workspace', 409);
   const data: any = await request(`/purchases/subscriptionsv2/tokens/${encodeURIComponent(args.purchaseToken)}`);
   if(data.testPurchase && !(process.env.GOOGLE_PLAY_TEST_COMPANY_IDS || '').split(',').map(s=>s.trim()).includes(args.companyId))
    throw new BillingError('Test purchase is not allowed for this company',403);
   if (data.linkedPurchaseToken) {
    const linked = await client.query('SELECT company_id FROM google_play_purchases WHERE token_hash=$1', [purchaseHash(data.linkedPurchaseToken)]);
    if (linked.rowCount && String(linked.rows[0].company_id) !== args.companyId)
     throw new BillingError('Linked purchase belongs to another workspace', 409);
   }
   const entitlement = parseGoogleEntitlement(data, args.productId,
    initial ? googleAccountId(args.companyId, args.userId) : undefined);
   const c = company.rows[0];
   if (initial) {
    if (entitlement.status !== 'active') throw new BillingError('Google Play purchase is not active');
    const end = c.subscription_current_period_end || c.subscription_expires_at;
    if (c.subscription_provider && !['google','internal'].includes(c.subscription_provider) &&
      ['active','trialing'].includes(c.subscription_status) && (!end || new Date(end).getTime() > Date.now()))
     throw new BillingError('Manage the existing subscription before changing billing provider', 409);
    if (c.subscription_provider === 'google' && c.subscription_status === 'active' && (!end || new Date(end).getTime() > Date.now()) &&
      c.google_purchase_hash && c.google_purchase_hash !== hash &&
      (!data.linkedPurchaseToken || purchaseHash(data.linkedPurchaseToken) !== c.google_purchase_hash))
     throw new BillingError('This purchase has been replaced; restore the current subscription', 409);
   }
   await client.query(`INSERT INTO google_play_purchases(token_hash,token_encrypted,company_id,user_id,product_id,status,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(token_hash) DO UPDATE SET status=EXCLUDED.status,
    expires_at=EXCLUDED.expires_at,verified_at=now()`,
    [hash,encrypt(args.purchaseToken),args.companyId,args.userId,args.productId,entitlement.status,entitlement.expiresAt]);
   if (initial || (c.subscription_provider === 'google' && c.google_purchase_hash === hash)) {
    await client.query(`UPDATE companies SET subscription_tier=$1,subscription_status=$2,subscription_provider='google',
     subscription_expires_at=$3,subscription_current_period_end=$3,subscription_cancel_at_period_end=$4,
     subscription_updated_at=now(),google_purchase_hash=$5 WHERE id=$6`,
     [entitlement.plan,entitlement.status,entitlement.expiresAt,entitlement.cancelAtPeriodEnd,hash,args.companyId]);
    await applyPlanAllowance(client,args.companyId,entitlement.plan);
   }
   await client.query('COMMIT');
   committed=true;
   // Commit entitlement before acknowledgement; retries safely repeat both operations.
   if (entitlement.status === 'active' && data.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING')
    await request(`/purchases/subscriptions/${encodeURIComponent(args.productId)}/tokens/${encodeURIComponent(args.purchaseToken)}:acknowledge`, 'POST');
   return entitlement;
  } catch (error) { if (!committed) await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
 }
 async function refresh(companyId: string) {
  const r = await db.query(`SELECT p.* FROM google_play_purchases p JOIN companies c ON c.google_purchase_hash=p.token_hash
   WHERE c.id=$1 AND c.subscription_provider='google'`, [companyId]);
  if (!r.rowCount) return;
  const p = r.rows[0];
  return sync({ companyId, userId:p.user_id, productId:p.product_id, purchaseToken:decrypt(p.token_encrypted) }, false);
 }
 async function notification(body: any) {
  let message;
  try { message = JSON.parse(Buffer.from(body?.message?.data || '', 'base64').toString('utf8')); }
  catch { throw new BillingError('Invalid notification'); }
  if (message.packageName !== PACKAGE) throw new BillingError('Wrong notification package');
  if (message.testNotification) return { accepted: true, test: true };
  const token = message.subscriptionNotification?.purchaseToken || message.voidedPurchaseNotification?.purchaseToken;
  if (!token || typeof token !== 'string') return { accepted: true, ignored: true };
  const r = await db.query('SELECT * FROM google_play_purchases WHERE token_hash=$1', [purchaseHash(token)]);
  if (!r.rowCount) return { accepted: true, ignored: true };
  const p=r.rows[0];
  await sync({ companyId:p.company_id,userId:p.user_id,productId:p.product_id,purchaseToken:token }, false);
  return { accepted:true };
 }
 return { verify: (args: Parameters<typeof sync>[0]) => sync(args,true), refresh, notification };
}
export async function verifyGooglePush(authorization?: string) {
 if (!authorization?.startsWith('Bearer ')) throw new BillingError('Notification authentication required',401);
 const audience=process.env.GOOGLE_PLAY_RTDN_AUDIENCE, email=process.env.GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT;
 if (!audience || !email) throw new BillingError('Google notification authentication is not configured',503);
 try {
  const ticket=await new OAuth2Client().verifyIdToken({idToken:authorization.slice(7),audience});
  const payload=ticket.getPayload();
  if (!payload?.email_verified || payload.email!==email) throw new Error('Wrong identity');
 } catch { throw new BillingError('Invalid notification identity',401); }
}
export const googleBilling = createGoogleBilling();
