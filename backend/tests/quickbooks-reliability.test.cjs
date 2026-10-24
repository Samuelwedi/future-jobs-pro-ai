const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
process.env.ENCRYPTION_KEY = 'quickbooks-test-encryption-key-not-for-production';
process.env.QUICKBOOKS_CLIENT_ID = 'test-client';
process.env.QUICKBOOKS_CLIENT_SECRET = 'test-secret';
process.env.QUICKBOOKS_ENVIRONMENT = 'sandbox';
const { pool } = require('../dist/config/database');
const { encrypt, decrypt } = require('../dist/services/encryptionService');
const { getQuickBooksCompanyInfo } = require('../dist/services/quickbooksService');
const { callQuickBooksApi, QuickBooksRequestError } = require('../dist/services/quickbooksOAuth');
const db = new PGlite();
const originalFetch = global.fetch;
let releases = 0;
before(async () => {
  await db.exec(`CREATE TABLE integrations(company_id text, provider text, environment text,
    is_active boolean, access_token text, refresh_token text, realm_id text,
    token_expires_at timestamptz, updated_at timestamptz DEFAULT now());`);
  pool.connect = async () => ({
    query: async (sql, params) => {
      const result = await db.query(sql, params);
      return { rows: result.rows, rowCount: result.rows.length || result.affectedRows || 0 };
    },
    release: () => { releases++; },
  });
});
after(async () => { global.fetch = originalFetch; await db.close(); await pool.end(); });
async function seed(refresh = 'old-refresh') {
  await db.exec('DELETE FROM integrations');
  for (const [company, environment] of [['a','sandbox'], ['b','sandbox'], ['a','production']]) {
    await db.query(`INSERT INTO integrations VALUES ($1,'quickbooks',$2,true,$3,$4,'123',now()-interval '1 hour',now())`,
      [company, environment, encrypt('old-access'), refresh ? encrypt(refresh) : null]);
  }
}
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });
test('refresh stores encrypted tokens only for the matching tenant and environment', async () => {
  await seed(); let calls = 0;
  global.fetch = async (url, options) => {
    calls++;
    if (String(url).includes('/tokens/')) return json({ access_token:'new-access', refresh_token:'new-refresh', expires_in:3600 });
    assert.equal(options.headers.Authorization, 'Bearer new-access');
    return json({ CompanyInfo: { CompanyName:'Test company' } });
  };
  assert.equal((await getQuickBooksCompanyInfo('a')).companyName, 'Test company');
  const rows = (await db.query('SELECT * FROM integrations')).rows;
  for (const row of rows) {
    assert.equal(decrypt(row.access_token), row.company_id === 'a' && row.environment === 'sandbox' ? 'new-access' : 'old-access');
  }
  assert.equal(calls, 2);
  await getQuickBooksCompanyInfo('a');
  assert.equal(calls, 3, 'valid tokens must not refresh again');
});
test('invalid grant marks only the failed connection inactive and requests reconnection', async () => {
  await seed();
  global.fetch = async () => json({ error:'invalid_grant', error_description:'private account details' }, 400);
  await assert.rejects(getQuickBooksCompanyInfo('a'), /reconnect QuickBooks/);
  const rows = (await db.query('SELECT company_id, environment, is_active FROM integrations')).rows;
  assert.equal(rows.filter(r => !r.is_active).length, 1);
  assert.equal(rows.find(r => !r.is_active).company_id, 'a');
  assert.equal(rows.find(r => !r.is_active).environment, 'sandbox');
});
test('temporary failure preserves the connection and never leaks provider descriptions', async () => {
  await seed();
  global.fetch = async () => json({ error:'server_error', error_description:'private payroll details' }, 503, { intuit_tid:'trace-123' });
  await assert.rejects(getQuickBooksCompanyInfo('a'), error => {
    assert.ok(error instanceof QuickBooksRequestError);
    assert.equal(error.intuitTid, 'trace-123');
    assert.doesNotMatch(error.message, /private payroll/);
    return true;
  });
  assert.equal((await db.query('SELECT count(*)::int AS n FROM integrations WHERE is_active')).rows[0].n, 3);
});
test('missing refresh token becomes reconnect-required and releases the DB client', async () => {
  await seed(null); const before = releases;
  global.fetch = async () => { throw new Error('Must not call provider'); };
  await assert.rejects(getQuickBooksCompanyInfo('a'), /reconnect QuickBooks/);
  assert.equal(releases, before + 1);
});
test('API validation errors retain safe trace metadata, not customer payloads', async () => {
  global.fetch = async () => json({ Fault:{ Error:[{ code:'6000', Detail:'customer private data' }] } }, 400, { intuit_tid:'trace-456' });
  await assert.rejects(callQuickBooksApi('token','123','query','GET'), error => {
    assert.equal(error.providerCode, '6000');
    assert.equal(error.intuitTid, 'trace-456');
    assert.doesNotMatch(error.message, /private data/);
    return true;
  });
});
