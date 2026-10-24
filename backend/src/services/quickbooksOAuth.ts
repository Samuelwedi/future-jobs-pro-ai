const AUTHORIZE_ENDPOINT = 'https://appcenter.intuit.com/connect/oauth2';
const TOKEN_ENDPOINT = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const REVOKE_ENDPOINT = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke';
const ACCOUNTING_SCOPE = 'com.intuit.quickbooks.accounting';
const REQUEST_TIMEOUT_MS = 30_000;

export type QuickBooksOAuthTokens = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  token_type?: string;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function clientAuthorization(): string {
  const credentials = Buffer.from(
    `${required('QUICKBOOKS_CLIENT_ID')}:${required('QUICKBOOKS_CLIENT_SECRET')}`,
    'utf8',
  ).toString('base64');
  return `Basic ${credentials}`;
}

export class QuickBooksRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly providerCode: string,
    public readonly intuitTid: string | null,
  ) {
    super(providerCode === 'invalid_grant'
      ? 'QuickBooks authorization has expired or been revoked; reconnect QuickBooks'
      : `QuickBooks request failed (HTTP ${status}, code ${providerCode})${intuitTid ? `; reference ${intuitTid}` : ''}`);
    this.name = 'QuickBooksRequestError';
  }
}

function responseError(response: Response, payload: any): Error {
  const fault = payload?.Fault?.Error?.[0];
  const rawCode = String(fault?.code || payload?.error || payload?.code || response.status);
  const providerCode = /^[a-zA-Z0-9_-]{1,80}$/.test(rawCode) ? rawCode : String(response.status);
  const rawTid = response.headers.get('intuit_tid');
  const tid = rawTid && /^[a-zA-Z0-9_-]{1,128}$/.test(rawTid) ? rawTid : null;
  // Provider descriptions can contain customer data. Keep only diagnostic IDs.
  return new QuickBooksRequestError(response.status, providerCode, tid);
}

async function readJson(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`QuickBooks returned an invalid response (HTTP ${response.status})`);
  }
}

async function checkedJson(response: Response): Promise<any> {
  const payload = await readJson(response);
  if (!response.ok) throw responseError(response, payload);
  return payload;
}

function requestSignal(): AbortSignal {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
}

async function tokenRequest(params: URLSearchParams): Promise<QuickBooksOAuthTokens> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    redirect: 'error',
    signal: requestSignal(),
    headers: {
      Authorization: clientAuthorization(),
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-include-refresh-token-hard-expires-in': 'true',
    },
    body: params.toString(),
  });
  const payload = await checkedJson(response);

  if (typeof payload.access_token !== 'string' || !payload.access_token) {
    throw new Error('QuickBooks did not return an access token');
  }
  return payload as QuickBooksOAuthTokens;
}

export function createQuickBooksAuthorizationUrl(state: string): string {
  if (!state) throw new Error('Missing OAuth state');
  const url = new URL(AUTHORIZE_ENDPOINT);
  url.search = new URLSearchParams({
    response_type: 'code',
    redirect_uri: required('QUICKBOOKS_REDIRECT_URI'),
    client_id: required('QUICKBOOKS_CLIENT_ID'),
    scope: ACCOUNTING_SCOPE,
    state,
  }).toString();
  return url.toString();
}

export async function exchangeQuickBooksAuthorizationCode(
  code: string,
): Promise<QuickBooksOAuthTokens> {
  if (!code) throw new Error('QuickBooks did not return an authorization code');
  return tokenRequest(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: required('QUICKBOOKS_REDIRECT_URI'),
    }),
  );
}

export async function refreshQuickBooksAccessToken(
  refreshToken: string,
): Promise<QuickBooksOAuthTokens> {
  if (!refreshToken) throw new Error('The QuickBooks refresh token is missing');
  return tokenRequest(
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  );
}

export async function revokeQuickBooksToken(token: string): Promise<void> {
  if (!token) return;
  const response = await fetch(REVOKE_ENDPOINT, {
    method: 'POST',
    redirect: 'error',
    signal: requestSignal(),
    headers: {
      Authorization: clientAuthorization(),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token }),
  });
  await checkedJson(response);
}

export async function callQuickBooksApi(
  accessToken: string,
  realmId: string,
  path: string,
  method: 'GET' | 'POST',
  body?: unknown,
): Promise<any> {
  if (!accessToken) throw new Error('The QuickBooks access token is missing');
  if (!/^\d+$/.test(realmId)) throw new Error('The QuickBooks company ID is invalid');
  if (!path || path.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(path)) {
    throw new Error('The QuickBooks API path is invalid');
  }

  const base = process.env.QUICKBOOKS_ENVIRONMENT === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';
  const url = new URL(
    `/v3/company/${encodeURIComponent(realmId)}/${path.replace(/^\/+/, '')}`,
    base,
  );
  const response = await fetch(url, {
    method,
    redirect: 'error',
    signal: requestSignal(),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return checkedJson(response);
}
