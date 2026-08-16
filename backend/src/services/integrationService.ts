import crypto from 'crypto';
import OAuthClient from 'intuit-oauth';
import Stripe from 'stripe';
import { pool } from '../config/database';
import { decrypt, encrypt } from './encryptionService';
import {
  createSalesReceipt,
  findOrCreateQuickBooksCustomer,
} from './quickbooksService';

type Provider = 'quickbooks' | 'stripe';

function integrationEnvironment(provider: Provider): 'sandbox' | 'production' {
  if (provider === 'quickbooks') {
    return process.env.QUICKBOOKS_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
  }
  return requireEnvironment('STRIPE_CONNECT_SECRET_KEY').startsWith('sk_live_')
    ? 'production'
    : 'sandbox';
}

const frontendUrl = (process.env.FRONTEND_URL || 'https://www.futurejobsproai.com').replace(/\/$/, '');
const quickBooksEnvironment = process.env.QUICKBOOKS_ENVIRONMENT === 'production'
  ? 'production'
  : 'sandbox';

function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function quickBooksClient(): OAuthClient {
  return new OAuthClient({
    clientId: requireEnvironment('QUICKBOOKS_CLIENT_ID'),
    clientSecret: requireEnvironment('QUICKBOOKS_CLIENT_SECRET'),
    environment: quickBooksEnvironment as any,
    redirectUri: requireEnvironment('QUICKBOOKS_REDIRECT_URI'),
  });
}

function stripeClient(): any {
  // Customer-owned Stripe Connect data is deliberately isolated from
  // Future Jobs Pro AI's own live subscription billing account.
  return new Stripe(requireEnvironment('STRIPE_CONNECT_SECRET_KEY'));
}

function hashState(state: string): string {
  return crypto.createHash('sha256').update(state).digest('hex');
}

async function createOAuthState(companyId: string, userId: string, provider: Provider): Promise<string> {
  const state = crypto.randomBytes(32).toString('base64url');
  await pool.query(
    `INSERT INTO integration_oauth_states
       (state_hash, company_id, user_id, provider, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + INTERVAL '10 minutes')`,
    [hashState(state), companyId, userId, provider],
  );
  return state;
}

async function consumeOAuthState(state: string, provider: Provider): Promise<{ companyId: string; userId: string }> {
  if (!state) throw new Error('Missing OAuth state');

  const result = await pool.query(
    `DELETE FROM integration_oauth_states
     WHERE state_hash = $1
       AND provider = $2
       AND used_at IS NULL
       AND expires_at > NOW()
     RETURNING company_id, user_id`,
    [hashState(state), provider],
  );

  if (result.rowCount !== 1) {
    throw new Error('OAuth state is invalid, expired, or already used');
  }

  return {
    companyId: result.rows[0].company_id,
    userId: result.rows[0].user_id,
  };
}

export function integrationResultUrl(provider: Provider, result: 'connected' | 'error', message?: string): string {
  const url = new URL('/integrations', frontendUrl);
  url.searchParams.set('provider', provider);
  url.searchParams.set('result', result);
  if (message) url.searchParams.set('message', message.slice(0, 180));
  return url.toString();
}

export async function getQuickBooksAuthUrl(companyId: string, userId: string): Promise<string> {
  const state = await createOAuthState(companyId, userId, 'quickbooks');
  return quickBooksClient().authorizeUri({
    scope: [OAuthClient.scopes.Accounting],
    state,
  });
}

export async function getStripeConnectUrl(companyId: string, userId: string): Promise<string> {
  const state = await createOAuthState(companyId, userId, 'stripe');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: requireEnvironment('STRIPE_CONNECT_CLIENT_ID'),
    scope: 'read_write',
    state,
    redirect_uri: requireEnvironment('STRIPE_REDIRECT_URI'),
  });
  return `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
}

export async function handleQuickBooksCallback(callbackUrl: string, state: string, realmId: string): Promise<void> {
  const { companyId } = await consumeOAuthState(state, 'quickbooks');
  if (!realmId) throw new Error('QuickBooks did not return a company realm');

  const tokenResponse = await quickBooksClient().createToken(callbackUrl);
  const token = tokenResponse.getJson();
  const expiresAt = new Date(Date.now() + Number(token.expires_in || 3600) * 1000);

  await pool.query(
    `INSERT INTO integrations
       (company_id, provider, access_token, refresh_token, realm_id, token_expires_at, environment, is_active, updated_at)
     VALUES ($1, 'quickbooks', $2, $3, $4, $5, $6, TRUE, NOW())
     ON CONFLICT (company_id, provider) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token,
       realm_id = EXCLUDED.realm_id,
       token_expires_at = EXCLUDED.token_expires_at,
       environment = EXCLUDED.environment,
       is_active = TRUE,
       updated_at = NOW()`,
    [
      companyId,
      encrypt(token.access_token),
      token.refresh_token ? encrypt(token.refresh_token) : null,
      realmId,
      expiresAt,
      integrationEnvironment('quickbooks'),
    ],
  );
}

export async function handleStripeConnectCallback(code: string, state: string): Promise<void> {
  const { companyId } = await consumeOAuthState(state, 'stripe');
  if (!code) throw new Error('Stripe did not return an authorization code');

  const response = await stripeClient().oauth.token({
    grant_type: 'authorization_code',
    code,
  });

  if (!response.stripe_user_id) throw new Error('Stripe did not return a connected account ID');

  const compatibilityToken = response.access_token || response.stripe_user_id;
  await pool.query(
    `INSERT INTO integrations
       (company_id, provider, access_token, refresh_token, stripe_account_id, environment, is_active, updated_at)
     VALUES ($1, 'stripe', $2, $3, $4, $5, TRUE, NOW())
     ON CONFLICT (company_id, provider) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token,
       stripe_account_id = EXCLUDED.stripe_account_id,
       environment = EXCLUDED.environment,
       is_active = TRUE,
       updated_at = NOW()`,
    [
      companyId,
      encrypt(compatibilityToken),
      response.refresh_token ? encrypt(response.refresh_token) : null,
      response.stripe_user_id,
      integrationEnvironment('stripe'),
    ],
  );
}

export async function getIntegrationStatus(companyId: string): Promise<Record<string, unknown>> {
  const result = await pool.query(
    `SELECT provider, is_active, realm_id, stripe_account_id, environment, updated_at
     FROM integrations
     WHERE company_id = $1`,
    [companyId],
  );

  const status: Record<string, unknown> = {
    quickbooks: { connected: false },
    stripe: { connected: false },
  };

  for (const row of result.rows) {
    const expectedEnvironment = integrationEnvironment(row.provider as Provider);
    const environmentMatches = row.environment === expectedEnvironment;
    status[row.provider] = {
      connected: Boolean(row.is_active && environmentMatches),
      reconnectRequired: Boolean(row.is_active && !environmentMatches),
      environment: expectedEnvironment,
      accountId: row.provider === 'stripe' ? row.stripe_account_id : row.realm_id,
      updatedAt: row.updated_at,
    };
  }
  return status;
}

export async function disconnectIntegration(companyId: string, provider: Provider): Promise<void> {
  const existing = await pool.query(
    `SELECT stripe_account_id, refresh_token FROM integrations
     WHERE company_id = $1 AND provider = $2 AND is_active = TRUE`,
    [companyId, provider],
  );

  if (provider === 'stripe' && existing.rows[0]?.stripe_account_id) {
    await stripeClient().oauth.deauthorize({
      client_id: requireEnvironment('STRIPE_CONNECT_CLIENT_ID'),
      stripe_user_id: existing.rows[0].stripe_account_id,
    });
  }

  if (provider === 'quickbooks' && existing.rows[0]?.refresh_token) {
    try {
      await quickBooksClient().revoke({
        refresh_token: decrypt(existing.rows[0].refresh_token),
      });
    } catch (error) {
      // An already-expired/revoked grant should not prevent local disconnection.
      console.warn('QuickBooks revoke returned an error; clearing the local connection:', error);
    }
  }

  await pool.query(
    `UPDATE integrations SET
       is_active = FALSE,
       access_token = NULL,
       refresh_token = NULL,
       updated_at = NOW()
     WHERE company_id = $1 AND provider = $2`,
    [companyId, provider],
  );
}

export async function syncRecentStripePayments(companyId: string): Promise<{ created: number; skipped: number; failed: number }> {
  const connection = await pool.query(
    `SELECT stripe_account_id FROM integrations
     WHERE company_id = $1 AND provider = 'stripe' AND is_active = TRUE AND environment = $2`,
    [companyId, integrationEnvironment('stripe')],
  );
  const stripeAccount = connection.rows[0]?.stripe_account_id;
  if (!stripeAccount) throw new Error('Connect Stripe before running a sync');

  const payments = await stripeClient().paymentIntents.list(
    { limit: 25 },
    { stripeAccount },
  );

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const payment of payments.data.filter((item) => item.status === 'succeeded')) {
    const mapped = await pool.query(
      `SELECT 1 FROM integration_sync_mappings
       WHERE company_id = $1 AND source_provider = 'stripe'
         AND source_type = 'payment_intent' AND source_id = $2`,
      [companyId, payment.id],
    );
    if (mapped.rowCount) {
      skipped += 1;
      continue;
    }

    try {
      let customerName = payment.description || 'Stripe customer';
      let customerEmail: string | undefined;
      if (typeof payment.customer === 'string') {
        const customer = await stripeClient().customers.retrieve(payment.customer, {}, { stripeAccount });
        if (!customer.deleted) {
          customerName = customer.name || customer.email || customerName;
          customerEmail = customer.email || undefined;
        }
      }

      const quickBooksCustomerId = await findOrCreateQuickBooksCustomer(
        companyId,
        customerName,
        customerEmail,
      );
      const amount = payment.amount_received / 100;
      const transactionDate = new Date(payment.created * 1000).toISOString().slice(0, 10);
      const receipt = await createSalesReceipt(
        companyId,
        quickBooksCustomerId,
        amount,
        `Stripe payment ${payment.id}`,
        transactionDate,
      );
      const receiptId = String(receipt?.SalesReceipt?.Id || receipt?.Id || payment.id);

      await pool.query(
        `INSERT INTO integration_sync_mappings
           (company_id, source_provider, source_type, source_id,
            destination_provider, destination_type, destination_id, sync_hash)
         VALUES ($1, 'stripe', 'payment_intent', $2,
                 'quickbooks', 'sales_receipt', $3, $4)
         ON CONFLICT DO NOTHING`,
        [companyId, payment.id, receiptId, payment.id],
      );
      created += 1;
    } catch (error) {
      failed += 1;
      console.error(`Failed to sync Stripe payment ${payment.id}:`, error);
    }
  }

  return { created, skipped, failed };
}

export async function syncStripeEventToQuickBooks(event: any): Promise<void> {
  if (!event.account) return;
  const connection = await pool.query(
    `SELECT company_id FROM integrations
     WHERE provider = 'stripe' AND stripe_account_id = $1
       AND is_active = TRUE AND environment = $2`,
    [event.account, integrationEnvironment('stripe')],
  );
  if (!connection.rowCount) return;

  if (event.type === 'payment_intent.succeeded' || event.type === 'invoice.paid') {
    await syncRecentStripePayments(connection.rows[0].company_id);
  }
}
