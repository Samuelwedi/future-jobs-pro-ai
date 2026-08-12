import OAuthClient from 'intuit-oauth';
import { pool } from '../config/database';
import { decrypt, encrypt } from './encryptionService';

type QuickBooksTokens = {
  accessToken: string;
  realmId: string;
};

export type QuickBooksCompanyInfo = {
  companyName: string;
  legalName: string | null;
  country: string | null;
  email: string | null;
  fiscalYearStartMonth: string | null;
};

export type QuickBooksItemSummary = {
  id: string;
  name: string;
  type: string;
  active: boolean;
  description: string | null;
};

function required(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
}

function environment(): 'sandbox' | 'production' {
  return process.env.QUICKBOOKS_ENVIRONMENT === 'production'
    ? 'production'
    : 'sandbox';
}

function oauthClient(
  token?: Record<string, unknown>,
): OAuthClient {
  return new OAuthClient({
    clientId: required('QUICKBOOKS_CLIENT_ID'),
    clientSecret: required('QUICKBOOKS_CLIENT_SECRET'),
    environment: environment() as any,
    redirectUri: required('QUICKBOOKS_REDIRECT_URI'),
    ...(token ? { token } : {}),
  });
}

async function getValidToken(
  companyId: string,
): Promise<QuickBooksTokens> {
  const result = await pool.query(
    `SELECT
       access_token,
       refresh_token,
       realm_id,
       token_expires_at
     FROM integrations
     WHERE company_id = $1
       AND provider = 'quickbooks'
       AND is_active = TRUE`,
    [companyId],
  );

  if (!result.rowCount) {
    throw new Error(
      'Connect QuickBooks before running a sync',
    );
  }

  let accessToken = decrypt(
    result.rows[0].access_token,
  );

  let refreshToken = result.rows[0].refresh_token
    ? decrypt(result.rows[0].refresh_token)
    : null;

  const realmId = String(
    result.rows[0].realm_id || '',
  );

  if (!realmId) {
    throw new Error(
      'The QuickBooks company ID is missing; reconnect QuickBooks',
    );
  }

  const expiresAt = result.rows[0].token_expires_at
    ? new Date(
        result.rows[0].token_expires_at,
      ).getTime()
    : 0;

  // Refresh five minutes early to prevent expiry
  // during an API request.
  if (expiresAt <= Date.now() + 5 * 60 * 1000) {
    if (!refreshToken) {
      throw new Error(
        'QuickBooks authorization has expired; reconnect QuickBooks',
      );
    }

    const response =
      await oauthClient().refreshUsingToken(
        refreshToken,
      );

    const refreshed = response.getJson();

    accessToken = refreshed.access_token;
    refreshToken =
      refreshed.refresh_token || refreshToken;

    const newExpiresAt = new Date(
      Date.now() +
        Number(refreshed.expires_in || 3600) *
          1000,
    );

    await pool.query(
      `UPDATE integrations
       SET access_token = $1,
           refresh_token = $2,
           token_expires_at = $3,
           updated_at = NOW()
       WHERE company_id = $4
         AND provider = 'quickbooks'`,
      [
        encrypt(accessToken),
        encrypt(refreshToken),
        newExpiresAt,
        companyId,
      ],
    );
  }

  return {
    accessToken,
    realmId,
  };
}

function apiBase(): string {
  return environment() === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';
}

async function makeApiCall(
  companyId: string,
  path: string | ((realmId: string) => string),
  method: 'GET' | 'POST',
  body?: unknown,
): Promise<any> {
  const { accessToken, realmId } =
    await getValidToken(companyId);

  const resolvedPath =
    typeof path === 'function'
      ? path(realmId)
      : path;

  const client = oauthClient({
    access_token: accessToken,
    realmId,
  });

  const response: any =
    await client.makeApiCall({
      url:
        `${apiBase()}/v3/company/` +
        `${realmId}/${resolvedPath}`,
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      ...(body === undefined
        ? {}
        : {
            body: JSON.stringify(body),
          }),
    });

  if (
    typeof response.getJson === 'function'
  ) {
    return response.getJson();
  }

  return response.json || response;
}

function escapeQuickBooksQuery(
  value: string,
): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
}

/**
 * Performs a safe, read-only request against
 * the connected QuickBooks company.
 */
export async function getQuickBooksCompanyInfo(
  companyId: string,
): Promise<QuickBooksCompanyInfo> {
  const response = await makeApiCall(
    companyId,
    (realmId) =>
      `companyinfo/${encodeURIComponent(
        realmId,
      )}?minorversion=75`,
    'GET',
  );

  const companyInfo = response?.CompanyInfo;

  if (!companyInfo) {
    throw new Error(
      'QuickBooks did not return company information',
    );
  }

  return {
    companyName: String(
      companyInfo.CompanyName ||
        companyInfo.LegalName ||
        'QuickBooks company',
    ),
    legalName: companyInfo.LegalName
      ? String(companyInfo.LegalName)
      : null,
    country: companyInfo.Country
      ? String(companyInfo.Country)
      : null,
    email: companyInfo.Email?.Address
      ? String(companyInfo.Email.Address)
      : null,
    fiscalYearStartMonth:
      companyInfo.FiscalYearStartMonth
        ? String(
            companyInfo.FiscalYearStartMonth,
          )
        : null,
  };
}

/**
 * Returns safe information about active
 * QuickBooks products and services.
 */
export async function listQuickBooksItems(
  companyId: string,
): Promise<QuickBooksItemSummary[]> {
  const query =
    'select * from Item where Active = true maxresults 100';

  const response = await makeApiCall(
    companyId,
    `query?query=${encodeURIComponent(
      query,
    )}&minorversion=75`,
    'GET',
  );

  const items =
    response?.QueryResponse?.Item;

  if (!Array.isArray(items)) {
    return [];
  }

  return items.map((item: any) => ({
    id: String(item.Id),
    name: String(
      item.Name || 'Unnamed item',
    ),
    type: String(
      item.Type || 'Unknown',
    ),
    active: item.Active !== false,
    description: item.Description
      ? String(item.Description)
      : null,
  }));
}

export async function findOrCreateQuickBooksCustomer(
  companyId: string,
  displayName: string,
  email?: string,
): Promise<string> {
  const safeName =
    displayName.trim().slice(0, 100) ||
    'Stripe customer';

  const query = email
    ? `select * from Customer where PrimaryEmailAddr = '${escapeQuickBooksQuery(
        email,
      )}' maxresults 1`
    : `select * from Customer where DisplayName = '${escapeQuickBooksQuery(
        safeName,
      )}' maxresults 1`;

  const found = await makeApiCall(
    companyId,
    `query?query=${encodeURIComponent(
      query,
    )}&minorversion=75`,
    'GET',
  );

  const existing =
    found?.QueryResponse?.Customer?.[0];

  if (existing?.Id) {
    return String(existing.Id);
  }

  const uniqueDisplayName =
    `${safeName} ${Date.now()
      .toString()
      .slice(-6)}`.slice(0, 100);

  const created = await makeApiCall(
    companyId,
    'customer?minorversion=75',
    'POST',
    {
      DisplayName: uniqueDisplayName,
      ...(email
        ? {
            PrimaryEmailAddr: {
              Address: email,
            },
          }
        : {}),
    },
  );

  if (!created?.Customer?.Id) {
    throw new Error(
      'QuickBooks did not return the new customer ID',
    );
  }

  return String(created.Customer.Id);
}

export async function createSalesReceipt(
  companyId: string,
  customerRef: string,
  amount: number,
  description: string,
  txnDate: string,
): Promise<any> {
  const itemId = required(
    'QUICKBOOKS_DEFAULT_ITEM_ID',
  );

  return makeApiCall(
    companyId,
    'salesreceipt?minorversion=75',
    'POST',
    {
      CustomerRef: {
        value: customerRef,
      },
      TxnDate: txnDate,
      PrivateNote:
        description.slice(0, 4000),
      Line: [
        {
          DetailType:
            'SalesItemLineDetail',
          Amount: Number(
            amount.toFixed(2),
          ),
          Description:
            description.slice(0, 4000),
          SalesItemLineDetail: {
            ItemRef: {
              value: itemId,
            },
            Qty: 1,
            UnitPrice: Number(
              amount.toFixed(2),
            ),
          },
        },
      ],
    },
  );
}

export async function createInvoicePayment(
  companyId: string,
  invoiceId: string,
  customerRef: string,
  amount: number,
  txnDate: string,
): Promise<any> {
  return makeApiCall(
    companyId,
    'payment?minorversion=75',
    'POST',
    {
      CustomerRef: {
        value: customerRef,
      },
      TotalAmt: Number(
        amount.toFixed(2),
      ),
      TxnDate: txnDate,
      Line: [
        {
          Amount: Number(
            amount.toFixed(2),
          ),
          LinkedTxn: [
            {
              TxnId: invoiceId,
              TxnType: 'Invoice',
            },
          ],
        },
      ],
    },
  );
}

console.log(
  'QuickBooks API service loaded.',
);