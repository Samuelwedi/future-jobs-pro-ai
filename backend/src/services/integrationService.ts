// ============================================
// INTEGRATION SERVICE
// Stripe Connect & QuickBooks OAuth + Sync
// Created by: Samuel B.
// ============================================

import OAuthClient from 'intuit-oauth';
import { pool } from '../config/database';
import { encrypt, decrypt, generateState } from './encryptionService';
import { recordUserEvent } from './adaptiveAIService';

// ----- QuickBooks OAuth configuration -----
const qbEnvironment = (process.env.QUICKBOOKS_ENVIRONMENT as 'sandbox' | 'production') || 'sandbox';

const qbOAuth = new OAuthClient({
  clientId: process.env.QUICKBOOKS_CLIENT_ID || 'QB_CLIENT_ID',
  clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET || 'QB_CLIENT_SECRET',
  environment: qbEnvironment as any,   // ← FIX: cast to any to avoid type conflict
  redirectUri: process.env.QUICKBOOKS_REDIRECT_URI || 'http://localhost:5000/api/integrations/quickbooks/callback',
});

// ----- Stripe Connect OAuth configuration -----
const stripeConnectClientId = process.env.STRIPE_CONNECT_CLIENT_ID || '';

// ============================================
// 1. Generate authorization URLs
// ============================================
export async function getQuickBooksAuthUrl(companyId: string): Promise<string> {
  const state = generateState();
  // Store state temporarily for CSRF protection
  await pool.query(
    `INSERT INTO sync_logs (company_id, provider, event_type, status, request_data)
     VALUES ($1,'quickbooks','auth_init','pending',$2)`,
    [companyId, JSON.stringify({ state })]
  );
  const authUri = qbOAuth.authorizeUri({
    scope: [OAuthClient.scopes.Accounting, OAuthClient.scopes.OpenId],
    state,
  });
  return authUri;
}

export function getStripeConnectUrl(companyId: string): string {
  const state = generateState();
  // Store state
  pool.query(
    `INSERT INTO sync_logs (company_id, provider, event_type, status, request_data)
     VALUES ($1,'stripe','connect_init','pending',$2)`,
    [companyId, JSON.stringify({ state })]
  );
  const params = new URLSearchParams({
    client_id: stripeConnectClientId,
    state,
    scope: 'read_write',
    response_type: 'code',
  });
  return `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
}

// ============================================
// 2. Handle QuickBooks OAuth callback
// ============================================
export async function handleQuickBooksCallback(
  companyId: string,
  code: string,
  realmId: string,
  state: string
): Promise<void> {
  // Verify state (skipped for brevity – check against stored state)
  const tokenResponse = await qbOAuth.createToken(code);
  const accessToken = tokenResponse.getJson().access_token;
  const refreshToken = tokenResponse.getJson().refresh_token;
  const expiresIn = tokenResponse.getJson().expires_in;
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  // Encrypt tokens and save
  const encryptedAccess = encrypt(accessToken);
  const encryptedRefresh = refreshToken ? encrypt(refreshToken) : null;

  await pool.query(
    `INSERT INTO integrations (company_id, provider, access_token, refresh_token, realm_id, token_expires_at)
     VALUES ($1,'quickbooks',$2,$3,$4,$5)
     ON CONFLICT (company_id, provider) DO UPDATE SET
       access_token=EXCLUDED.access_token,
       refresh_token=EXCLUDED.refresh_token,
       realm_id=EXCLUDED.realm_id,
       token_expires_at=EXCLUDED.token_expires_at,
       updated_at=NOW()`,
    [companyId, encryptedAccess, encryptedRefresh, realmId, expiresAt]
  );

  await recordUserEvent({ userId: companyId, eventType: 'quickbooks_connected', eventData: { realmId } });
}

// ============================================
// 3. Handle Stripe Connect OAuth callback
// ============================================
export async function handleStripeConnectCallback(
  companyId: string,
  code: string,
  state: string
): Promise<void> {
  // Exchange code for access token (using Stripe SDK, omitted for brevity – call Stripe API)
  // Here we simulate; in production, use stripe.oauth.token
  const encryptedAccess = encrypt('stripe_connected_token');
  await pool.query(
    `INSERT INTO integrations (company_id, provider, access_token, stripe_account_id)
     VALUES ($1,'stripe',$2,$2)
     ON CONFLICT (company_id, provider) DO UPDATE SET
       access_token=EXCLUDED.access_token,
       stripe_account_id=EXCLUDED.stripe_account_id,
       updated_at=NOW()`,
    [companyId, encryptedAccess]
  );

  await recordUserEvent({ userId: companyId, eventType: 'stripe_connected', eventData: {} });
}

// ============================================
// 4. Sync a Stripe event to QuickBooks (AI-powered)
// ============================================
export async function syncStripeEventToQuickBooks(stripeEvent: any): Promise<void> {
  // 1. Identify the company from the Stripe account ID
  const stripeAccountId = stripeEvent.account;
  const companyResult = await pool.query(
    `SELECT company_id, access_token FROM integrations WHERE provider='stripe' AND stripe_account_id=$1 AND is_active=true`,
    [stripeAccountId]
  );
  if (companyResult.rows.length === 0) return;
  const { company_id: companyId, access_token } = companyResult.rows[0];

  // 2. Get their QuickBooks tokens
  const qbResult = await pool.query(
    `SELECT access_token, refresh_token, realm_id FROM integrations WHERE company_id=$1 AND provider='quickbooks' AND is_active=true`,
    [companyId]
  );
  if (qbResult.rows.length === 0) return;

  const qbAccessToken = decrypt(qbResult.rows[0].access_token);
  const qbRealmId = qbResult.rows[0].realm_id;

  // 3. AI decision: map Stripe event to QuickBooks action
  const aiDecision = await decideSyncAction(stripeEvent, companyId);

  // 4. Execute the QuickBooks API call (simplified – uses qbAccessToken and realmId)
  console.log(`🧠 [Samuel B. AI] Would sync ${stripeEvent.type} for company ${companyId} with action: ${aiDecision.action}`);
  // TODO: actually call QuickBooks API with the access token

  // 5. Log the sync
  await pool.query(
    `INSERT INTO sync_logs (company_id, provider, event_type, status, request_data, ai_decision)
     VALUES ($1,'stripe->quickbooks',$2,'success',$3,$4)`,
    [companyId, stripeEvent.type, JSON.stringify(stripeEvent), JSON.stringify(aiDecision)]
  );
}

// ============================================
// AI decision engine (simplified – will be extended)
// ============================================
async function decideSyncAction(event: any, companyId: string): Promise<any> {
  // In the future, this will use the adaptive AI to learn from manual corrections.
  const type = event.type;
  if (type === 'payment_intent.succeeded') {
    return { action: 'createSalesReceipt', amount: event.data.object.amount };
  }
  if (type === 'invoice.paid') {
    return { action: 'createInvoicePayment', amount: event.data.object.amount_paid };
  }
  return { action: 'unknown' };
}

console.log('🔗 Integration Service loaded – Future Jobs Pro AI by Samuel B.');