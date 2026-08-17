import {
  Environment,
  AutoRenewStatus,
  NotificationTypeV2,
  SignedDataVerifier,
  type JWSTransactionDecodedPayload,
} from '@apple/app-store-server-library';
import { pool } from '../config/database';

const PLAN_BY_PRODUCT = new Map<string, 'basic' | 'professional' | 'enterprise'>([
  ['com.samuel33.futurejobspro.basic_monthly', 'basic'],
  ['com.samuel33.futurejobspro.professional_monthly', 'professional'],
  ['com.samuel33.futurejobspro.enterprise_monthly', 'enterprise'],
]);

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function decodePayloadWithoutTrust(jws: string): any {
  const parts = jws.split('.');
  if (parts.length !== 3) throw new Error('Apple signed payload is malformed');
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw new Error('Apple signed payload could not be decoded');
  }
}

function appleEnvironment(jws: string, notification = false): Environment {
  const payload = decodePayloadWithoutTrust(jws);
  const value = notification ? payload?.data?.environment : payload?.environment;
  if (value === Environment.PRODUCTION || value === 'Production') return Environment.PRODUCTION;
  if (value === Environment.SANDBOX || value === 'Sandbox') {
    if (process.env.APPLE_IAP_ALLOW_SANDBOX !== 'true') {
      throw new Error('Apple sandbox purchases are disabled on this server');
    }
    return Environment.SANDBOX;
  }
  throw new Error('Unsupported Apple purchase environment');
}

function rootCertificates(): Buffer[] {
  const names = ['APPLE_ROOT_CA_G2_BASE64', 'APPLE_ROOT_CA_G3_BASE64'];
  const certificates = names
    .map((name) => process.env[name]?.replace(/\s/g, ''))
    .filter((value): value is string => Boolean(value))
    .map((value) => Buffer.from(value, 'base64'));
  if (!certificates.length || certificates.some((certificate) => certificate.length < 500)) {
    throw new Error('Apple root certificates are not configured');
  }
  return certificates;
}

function verifier(environment: Environment): SignedDataVerifier {
  const appAppleId = environment === Environment.PRODUCTION
    ? Number(required('APPLE_APP_ID'))
    : undefined;
  if (environment === Environment.PRODUCTION && (!Number.isInteger(appAppleId) || Number(appAppleId) <= 0)) {
    throw new Error('APPLE_APP_ID must be a valid numeric App Store ID');
  }
  return new SignedDataVerifier(
    rootCertificates(),
    process.env.APPLE_IAP_ONLINE_CHECKS !== 'false',
    environment,
    process.env.APPLE_IAP_BUNDLE_ID?.trim() || 'com.samuel33.futurejobspro',
    appAppleId,
  );
}

function statusFromTransaction(transaction: JWSTransactionDecodedPayload): string {
  if (transaction.revocationDate) return 'revoked';
  if (!transaction.expiresDate || transaction.expiresDate <= Date.now()) return 'expired';
  return 'active';
}

function statusFromAppleStatus(status: number | string | undefined, transaction: JWSTransactionDecodedPayload): string {
  if (status === 1 || status === '1') return 'active';
  if (status === 2 || status === '2') return 'expired';
  if (status === 3 || status === '3') return 'billing_retry';
  if (status === 4 || status === '4') return 'grace_period';
  if (status === 5 || status === '5') return 'revoked';
  return statusFromTransaction(transaction);
}

function validateTransaction(
  transaction: JWSTransactionDecodedPayload,
  requestedProductId?: string,
  expectedUserId?: string,
) {
  const bundleId = process.env.APPLE_IAP_BUNDLE_ID?.trim() || 'com.samuel33.futurejobspro';
  if (transaction.bundleId !== bundleId) throw new Error('Apple transaction belongs to a different app');
  if (!transaction.productId || !PLAN_BY_PRODUCT.has(transaction.productId)) {
    throw new Error('Apple product is not recognized');
  }
  if (requestedProductId && transaction.productId !== requestedProductId) {
    throw new Error('Apple product does not match the requested plan');
  }
  if (!transaction.originalTransactionId || !transaction.transactionId) {
    throw new Error('Apple transaction identifiers are missing');
  }
  if (expectedUserId && transaction.appAccountToken !== expectedUserId) {
    throw new Error('Apple purchase is not linked to this signed-in user');
  }
}

async function persistAppleEntitlement(args: {
  companyId: string;
  userId: string | null;
  environment: Environment;
  transaction: JWSTransactionDecodedPayload;
  status: string;
  notificationUUID?: string;
  cancelAtPeriodEnd?: boolean;
  notificationUpdate?: boolean;
}) {
  const {
    companyId, userId, environment, transaction, status, notificationUUID,
    cancelAtPeriodEnd = false, notificationUpdate = false,
  } = args;
  const productId = String(transaction.productId);
  const plan = PLAN_BY_PRODUCT.get(productId)!;
  const expiresAt = transaction.expiresDate ? new Date(transaction.expiresDate) : null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const owner = await client.query(
      `SELECT company_id FROM mobile_subscription_transactions
       WHERE provider = 'apple' AND original_transaction_id = $1
       FOR UPDATE`,
      [transaction.originalTransactionId],
    );
    if (owner.rowCount && owner.rows[0].company_id !== companyId) {
      throw new Error('This Apple subscription is already linked to another workspace');
    }

    await client.query(
      `INSERT INTO mobile_subscription_transactions (
         provider, original_transaction_id, latest_transaction_id, company_id, user_id,
         product_id, plan_key, store_environment, status, expires_at,
         last_notification_uuid, verified_at, updated_at
       ) VALUES ('apple', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
       ON CONFLICT (provider, original_transaction_id) DO UPDATE SET
         latest_transaction_id = EXCLUDED.latest_transaction_id,
         user_id = COALESCE(EXCLUDED.user_id, mobile_subscription_transactions.user_id),
         product_id = EXCLUDED.product_id,
         plan_key = EXCLUDED.plan_key,
         store_environment = EXCLUDED.store_environment,
         status = EXCLUDED.status,
         expires_at = EXCLUDED.expires_at,
         last_notification_uuid = COALESCE(EXCLUDED.last_notification_uuid, mobile_subscription_transactions.last_notification_uuid),
         verified_at = NOW(), updated_at = NOW()`,
      [transaction.originalTransactionId, transaction.transactionId, companyId, userId,
        productId, plan, environment, status, expiresAt, notificationUUID || null],
    );

    await client.query(
      `UPDATE companies SET
         subscription_tier = $1,
         subscription_status = $2,
         subscription_provider = 'apple',
         subscription_current_period_end = $3,
         subscription_expires_at = $3,
         subscription_cancel_at_period_end = $4,
         subscription_updated_at = NOW()
       WHERE id = $5
         AND ($6::boolean = FALSE OR subscription_provider IS NULL OR subscription_provider = 'apple')`,
      [plan, status, expiresAt, cancelAtPeriodEnd, companyId, notificationUpdate],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return {
    tier: plan,
    plan,
    status,
    provider: 'apple',
    expiresAt: expiresAt?.toISOString() || null,
    currentPeriodEnd: expiresAt?.toISOString() || null,
    cancelAtPeriodEnd,
  };
}

export async function verifyApplePurchase(args: {
  companyId: string;
  userId: string;
  productId: string;
  signedTransaction: string;
}) {
  const environment = appleEnvironment(args.signedTransaction);
  const transaction = await verifier(environment).verifyAndDecodeTransaction(args.signedTransaction);
  validateTransaction(transaction, args.productId, args.userId);
  const status = statusFromTransaction(transaction);
  if (status !== 'active') throw new Error(`Apple subscription is ${status}`);
  return persistAppleEntitlement({ companyId: args.companyId, userId: args.userId, environment, transaction, status });
}

export async function processAppleNotification(signedPayload: string) {
  const environment = appleEnvironment(signedPayload, true);
  const appleVerifier = verifier(environment);
  const notification = await appleVerifier.verifyAndDecodeNotification(signedPayload);
  if (notification.notificationType === NotificationTypeV2.TEST) {
    return { accepted: true, test: true };
  }
  const signedTransaction = notification.data?.signedTransactionInfo;
  if (!signedTransaction) return { accepted: true, ignored: true };

  const transaction = await appleVerifier.verifyAndDecodeTransaction(signedTransaction);
  validateTransaction(transaction);
  const signedRenewalInfo = notification.data?.signedRenewalInfo;
  const renewalInfo = signedRenewalInfo
    ? await appleVerifier.verifyAndDecodeRenewalInfo(signedRenewalInfo)
    : null;
  const record = await pool.query(
    `SELECT company_id FROM mobile_subscription_transactions
     WHERE provider = 'apple' AND original_transaction_id = $1 LIMIT 1`,
    [transaction.originalTransactionId],
  );
  if (!record.rowCount) return { accepted: true, ignored: true };

  const status = statusFromAppleStatus(notification.data?.status, transaction);
  await persistAppleEntitlement({
    companyId: record.rows[0].company_id,
    userId: null,
    environment,
    transaction,
    status,
    notificationUUID: notification.notificationUUID,
    cancelAtPeriodEnd: renewalInfo?.autoRenewStatus === AutoRenewStatus.OFF,
    notificationUpdate: true,
  });
  return { accepted: true, status };
}
