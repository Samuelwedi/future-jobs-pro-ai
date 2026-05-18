// ============================================
// QUICKBOOKS API SERVICE
// Creates Sales Receipts, Invoices, etc.
// Created by: Samuel B.
// ============================================

import OAuthClient from 'intuit-oauth';
import { pool } from '../config/database';
import { decrypt } from './encryptionService';

// OAuth client instance (used to refresh tokens)
const qbOAuth = new OAuthClient({
  clientId: process.env.QUICKBOOKS_CLIENT_ID || 'QB_CLIENT_ID',
  clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET || 'QB_CLIENT_SECRET',
  environment: process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox',
  redirectUri: process.env.QUICKBOOKS_REDIRECT_URI || 'http://localhost:5000/api/integrations/quickbooks/callback',
});

// ----- Helper: get a valid token object (refreshes if needed) -----
async function getValidToken(companyId: string) {
  const result = await pool.query(
    `SELECT access_token, refresh_token, realm_id, token_expires_at FROM integrations WHERE company_id=$1 AND provider='quickbooks' AND is_active=true`,
    [companyId]
  );
  if (result.rows.length === 0) throw new Error('No QuickBooks integration found');

  let { access_token, refresh_token, realm_id, token_expires_at } = result.rows[0];
  access_token = decrypt(access_token);
  refresh_token = refresh_token ? decrypt(refresh_token) : null;

  // Check if token is expired and refresh
  if (token_expires_at && new Date() > new Date(token_expires_at)) {
    if (!refresh_token) throw new Error('Token expired and no refresh token available');
    const authResponse = await qbOAuth.refreshUsingToken(refresh_token);
    const newToken = authResponse.getJson();
    access_token = newToken.access_token;
    refresh_token = newToken.refresh_token;
    const expiresIn = newToken.expires_in;
    const newExpiresAt = new Date(Date.now() + expiresIn * 1000);

    // Update encrypted tokens in database
    const encryptedAccess = (await import('./encryptionService')).encrypt(access_token);
    const encryptedRefresh = refresh_token ? (await import('./encryptionService')).encrypt(refresh_token) : null;

    await pool.query(
      `UPDATE integrations SET access_token=$1, refresh_token=$2, token_expires_at=$3 WHERE company_id=$4 AND provider='quickbooks'`,
      [encryptedAccess, encryptedRefresh, newExpiresAt, companyId]
    );
  }

  return { access_token, realm_id };
}

// ----- Create a Sales Receipt -----
export async function createSalesReceipt(
  companyId: string,
  customerRef: string,   // QuickBooks customer ID
  amount: number,
  description: string,
  txnDate: string        // YYYY-MM-DD
): Promise<any> {
  const { access_token, realm_id } = await getValidToken(companyId);

  const qbClient = new OAuthClient({
    clientId: process.env.QUICKBOOKS_CLIENT_ID || 'QB_CLIENT_ID',
    clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET || 'QB_CLIENT_SECRET',
    environment: process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox',
    redirectUri: process.env.QUICKBOOKS_REDIRECT_URI || 'http://localhost:5000/api/integrations/quickbooks/callback',
    token: { access_token, realmId: realm_id },
  });

  const response = await qbClient.makeApiCall({
    url: `https://sandbox-quickbooks.api.intuit.com/v3/company/${realm_id}/salesreceipt`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Line: [
        {
          DetailType: 'SalesItemLineDetail',
          Amount: amount,
          SalesItemLineDetail: { ItemRef: { value: '1' } }, // default item
          Description: description,
        },
      ],
      CustomerRef: { value: customerRef },
      TxnDate: txnDate,
    }),
  });

  return response.json;
}

// ----- Create an Invoice Payment (when an invoice is paid) -----
export async function createInvoicePayment(
  companyId: string,
  invoiceId: string,     // QuickBooks invoice ID
  amount: number,
  txnDate: string
): Promise<any> {
  const { access_token, realm_id } = await getValidToken(companyId);

  const qbClient = new OAuthClient({
    clientId: process.env.QUICKBOOKS_CLIENT_ID || 'QB_CLIENT_ID',
    clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET || 'QB_CLIENT_SECRET',
    environment: process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox',
    redirectUri: process.env.QUICKBOOKS_REDIRECT_URI || 'http://localhost:5000/api/integrations/quickbooks/callback',
    token: { access_token, realmId: realm_id },
  });

  const response = await qbClient.makeApiCall({
    url: `https://sandbox-quickbooks.api.intuit.com/v3/company/${realm_id}/payment`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      CustomerRef: { value: '1' }, // will be overridden later
      TotalAmt: amount,
      Line: [
        {
          Amount: amount,
          LinkedTxn: [{ TxnId: invoiceId, TxnType: 'Invoice' }],
        },
      ],
      TxnDate: txnDate,
    }),
  });

  return response.json;
}

console.log('📊 QuickBooks API Service loaded – Future Jobs Pro AI by Samuel B.');