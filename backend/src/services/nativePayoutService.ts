import { createHash, randomUUID } from 'node:crypto';

export type PayoutBatchStatus =
  | 'awaiting_approval'
  | 'approved'
  | 'submitting'
  | 'submitted'
  | 'processing'
  | 'settled'
  | 'failed'
  | 'cancelled';

export type PayoutActor = {
  id: string;
  companyId: string;
  role: string;
};

export type CountryDefinition = {
  country: string;
  countryName: string;
  currency: string;
  minorUnit: number;
  rail: string;
};

export type PayoutSettings = {
  companyId: string;
  country: string;
  currency: string;
  adapterId: string | null;
  updatedAt: string;
};

export type PayoutAccountSummary = {
  employeeId: string;
  employeeName: string;
  email: string | null;
  country: string;
  currency: string;
  status: 'ready' | 'missing_destination' | 'inactive' | 'unsupported_country';
  destination: {
    configured: boolean;
    last4: string | null;
    label: string | null;
  };
};

export type PayrollSummary = {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  payoutCountry: string | null;
  payoutCurrency: string | null;
  payoutCalculationEngine: string | null;
  payoutCalculationVersion: string | null;
  payoutCertifiedAt: string | null;
  country: string;
  currency: string;
  employeeCount: number;
  totalMinor: number;
  totalFormatted: string;
  eligible: boolean;
  reason: string | null;
};

export type PayrollSnapshotLine = {
  employeeId: string;
  employeeName: string;
  email: string | null;
  amountMinor: number;
  recipientReference: string | null;
  destinationFingerprint: string | null;
  destinationStatus: string | null;
};

export type PayrollSnapshot = {
  payrollId: string;
  companyId: string;
  periodStart: string;
  periodEnd: string;
  payrollStatus: string;
  payoutCountry: string | null;
  payoutCurrency: string | null;
  payoutCalculationEngine: string | null;
  payoutCalculationVersion: string | null;
  payoutCertifiedAt: string | null;
  country: string;
  currency: string;
  lines: PayrollSnapshotLine[];
};

export type StoredPayoutBatch = {
  id: string;
  companyId: string;
  payrollId: string;
  country: string;
  currency: string;
  adapterId: string;
  adapterConfigurationVersion: string;
  calculationEngine: string;
  calculationVersion: string;
  calculationCertifiedAt: string;
  status: PayoutBatchStatus;
  employeeCount: number;
  totalMinor: number;
  createdBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  providerReference: string | null;
  executionKeyHash: string | null;
  failureCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PayoutBatch = Omit<StoredPayoutBatch, 'companyId' | 'executionKeyHash'> & {
  totalFormatted: string;
  actions: {
    canApprove: boolean;
    canExecute: boolean;
  };
};

export type PayoutEvent = {
  id: string;
  type: string;
  actorId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
};

export type StoredBatchItem = {
  employeeId: string;
  amountMinor: number;
  currency: string;
  destinationFingerprint: string;
  currentDestinationFingerprint?: string | null;
  recipientReference?: string | null;
};

export type IdempotencyRecord = {
  requestHash: string;
  batchId: string;
};

export interface PayoutRepository {
  transaction<T>(work: (repository: PayoutRepository) => Promise<T>): Promise<T>;
  acquireLock(scope: string): Promise<void>;
  getSettings(companyId: string): Promise<PayoutSettings | null>;
  saveSettings(input: {
    companyId: string;
    country: string;
    currency: string;
    adapterId: string | null;
    actorId: string;
  }): Promise<PayoutSettings>;
  isAccountingSyncConfigured(companyId: string): Promise<boolean>;
  listAccounts(companyId: string, settings: PayoutSettings | null): Promise<PayoutAccountSummary[]>;
  assertEmployee(companyId: string, employeeId: string): Promise<void>;
  listPayrolls(companyId: string, settings: PayoutSettings | null): Promise<Array<Omit<PayrollSummary, 'eligible' | 'reason' | 'totalFormatted'> & { hasBatch?: boolean }>>;
  getPayrollSnapshot(input: {
    companyId: string;
    payrollId: string;
    country: string;
    currency: string;
    adapterId: string;
    lock?: boolean;
  }): Promise<PayrollSnapshot | null>;
  listBatches(companyId: string, limit: number): Promise<StoredPayoutBatch[]>;
  getBatch(companyId: string, batchId: string, lock?: boolean): Promise<StoredPayoutBatch | null>;
  createBatch(batch: StoredPayoutBatch, items: StoredBatchItem[]): Promise<StoredPayoutBatch>;
  updateBatch(companyId: string, batchId: string, patch: Partial<StoredPayoutBatch>): Promise<StoredPayoutBatch>;
  listExecutionItems(companyId: string, batchId: string): Promise<StoredBatchItem[]>;
  appendEvent(input: {
    companyId: string;
    batchId: string;
    type: string;
    actorId: string | null;
    details?: Record<string, unknown>;
  }): Promise<PayoutEvent>;
  listEvents(companyId: string, batchId: string): Promise<PayoutEvent[]>;
  getIdempotency(companyId: string, scope: string, key: string): Promise<IdempotencyRecord | null>;
  saveIdempotency(input: {
    companyId: string;
    scope: string;
    key: string;
    requestHash: string;
    batchId: string;
  }): Promise<void>;
}

export type AdapterSubmission = {
  batchId: string;
  companyId: string;
  country: string;
  currency: string;
  adapterConfigurationVersion: string;
  totalMinor: number;
  idempotencyKey: string;
  recipients: Array<{
    employeeId: string;
    amountMinor: number;
    currency: string;
    recipientReference: string;
  }>;
};

export type AdapterSubmissionResult = {
  state: 'submitted' | 'processing' | 'settled' | 'failed';
  providerReference?: string;
  failureCode?: string;
};

export interface PayoutAdapter {
  readonly id: string;
  readonly supportedPairs: ReadonlyArray<{ country: string; currency: string }>;
  readonly hostedTokenizedEnrollment?: boolean;
  readonly enrollmentAllowedHosts?: ReadonlyArray<string>;
  isConfigured(): boolean;
  isCompanyReady(companyId: string): boolean;
  configurationVersion(companyId: string): string;
  companyLimits(companyId: string, currency: string): {
    maxBatchMinor: number;
    maxRecipientMinor: number;
  };
  createEnrollmentSession?(input: {
    companyId: string;
    employeeId: string;
    country: string;
    currency: string;
    returnUrl: string;
  }): Promise<{ url: string; expiresAt: string }>;
  submitBatch(input: AdapterSubmission): Promise<AdapterSubmissionResult>;
}

export class PayoutError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly code = 'PAYOUT_INVALID_REQUEST',
  ) {
    super(message);
    this.name = 'PayoutError';
  }
}

// This allowlist says which ISO pairs the application can model. It does not
// claim a live payment rail. A registered, configured adapter is still required.
export const PAYOUT_COUNTRIES: ReadonlyArray<CountryDefinition> = Object.freeze([
  { country: 'CA', countryName: 'Canada', currency: 'CAD', minorUnit: 2, rail: 'eft' },
  { country: 'US', countryName: 'United States', currency: 'USD', minorUnit: 2, rail: 'ach' },
  { country: 'GB', countryName: 'United Kingdom', currency: 'GBP', minorUnit: 2, rail: 'faster_payments' },
  { country: 'AU', countryName: 'Australia', currency: 'AUD', minorUnit: 2, rail: 'npp' },
  { country: 'NZ', countryName: 'New Zealand', currency: 'NZD', minorUnit: 2, rail: 'domestic_credit' },
  { country: 'SG', countryName: 'Singapore', currency: 'SGD', minorUnit: 2, rail: 'fast' },
  { country: 'IN', countryName: 'India', currency: 'INR', minorUnit: 2, rail: 'imps_neft' },
  { country: 'MY', countryName: 'Malaysia', currency: 'MYR', minorUnit: 2, rail: 'duitnow' },
  { country: 'ZA', countryName: 'South Africa', currency: 'ZAR', minorUnit: 2, rail: 'eft' },
  { country: 'MX', countryName: 'Mexico', currency: 'MXN', minorUnit: 2, rail: 'spei' },
  { country: 'BR', countryName: 'Brazil', currency: 'BRL', minorUnit: 2, rail: 'pix_ted' },
  { country: 'AT', countryName: 'Austria', currency: 'EUR', minorUnit: 2, rail: 'sepa_credit_transfer' },
  { country: 'BE', countryName: 'Belgium', currency: 'EUR', minorUnit: 2, rail: 'sepa_credit_transfer' },
  { country: 'HR', countryName: 'Croatia', currency: 'EUR', minorUnit: 2, rail: 'sepa_credit_transfer' },
  { country: 'CY', countryName: 'Cyprus', currency: 'EUR', minorUnit: 2, rail: 'sepa_credit_transfer' },
  { country: 'EE', countryName: 'Estonia', currency: 'EUR', minorUnit: 2, rail: 'sepa_credit_transfer' },
  { country: 'FI', countryName: 'Finland', currency: 'EUR', minorUnit: 2, rail: 'sepa_credit_transfer' },
  { country: 'FR', countryName: 'France', currency: 'EUR', minorUnit: 2, rail: 'sepa_credit_transfer' },
  { country: 'DE', countryName: 'Germany', currency: 'EUR', minorUnit: 2, rail: 'sepa_credit_transfer' },
  { country: 'GR', countryName: 'Greece', currency: 'EUR', minorUnit: 2, rail: 'sepa_credit_transfer' },
  { country: 'IE', countryName: 'Ireland', currency: 'EUR', minorUnit: 2, rail: 'sepa_credit_transfer' },
  { country: 'IT', countryName: 'Italy', currency: 'EUR', minorUnit: 2, rail: 'sepa_credit_transfer' },
  { country: 'LV', countryName: 'Latvia', currency: 'EUR', minorUnit: 2, rail: 'sepa_credit_transfer' },
  { country: 'LT', countryName: 'Lithuania', currency: 'EUR', minorUnit: 2, rail: 'sepa_credit_transfer' },
  { country: 'LU', countryName: 'Luxembourg', currency: 'EUR', minorUnit: 2, rail: 'sepa_credit_transfer' },
  { country: 'MT', countryName: 'Malta', currency: 'EUR', minorUnit: 2, rail: 'sepa_credit_transfer' },
  { country: 'NL', countryName: 'Netherlands', currency: 'EUR', minorUnit: 2, rail: 'sepa_credit_transfer' },
  { country: 'PT', countryName: 'Portugal', currency: 'EUR', minorUnit: 2, rail: 'sepa_credit_transfer' },
  { country: 'SK', countryName: 'Slovakia', currency: 'EUR', minorUnit: 2, rail: 'sepa_credit_transfer' },
  { country: 'SI', countryName: 'Slovenia', currency: 'EUR', minorUnit: 2, rail: 'sepa_credit_transfer' },
  { country: 'ES', countryName: 'Spain', currency: 'EUR', minorUnit: 2, rail: 'sepa_credit_transfer' },
]);

const RAW_BANK_KEYS = new Set([
  'accountnumber',
  'bankaccount',
  'bankaccountnumber',
  'bankdetails',
  'routingnumber',
  'bankroutingnumber',
  'transitnumber',
  'institutionnumber',
  'sortcode',
  'iban',
  'swift',
  'swiftcode',
  'bic',
  'bsb',
]);

const configuredAdapters = new Map<string, PayoutAdapter>();

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function assertNoRawBankingData(value: unknown, path = 'request'): void {
  if (value === null || value === undefined || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoRawBankingData(item, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (RAW_BANK_KEYS.has(normalizedKey(key))) {
      throw new PayoutError(
        'Raw bank details are not accepted. Use hosted tokenized enrollment.',
        400,
        'RAW_BANK_DATA_REJECTED',
      );
    }
    assertNoRawBankingData(child, `${path}.${key}`);
  }
}

function normalizeCode(value: unknown, length: number, label: string): string {
  const code = String(value || '').trim().toUpperCase();
  if (!new RegExp(`^[A-Z]{${length}}$`).test(code)) {
    throw new PayoutError(`${label} must be a ${length}-letter ISO code`, 400, 'INVALID_ISO_CODE');
  }
  return code;
}

export function getCountryDefinition(countryValue: unknown, currencyValue: unknown): CountryDefinition {
  const country = normalizeCode(countryValue, 2, 'Country');
  const currency = normalizeCode(currencyValue, 3, 'Currency');
  const definition = PAYOUT_COUNTRIES.find((item) => item.country === country && item.currency === currency);
  if (!definition) {
    throw new PayoutError(
      `Payouts are not enabled for ${country}/${currency}`,
      422,
      'UNSUPPORTED_COUNTRY_CURRENCY',
    );
  }
  return definition;
}

export function adapterSupports(adapter: PayoutAdapter, country: string, currency: string): boolean {
  return adapter.supportedPairs.some(
    (pair) => pair.country.toUpperCase() === country && pair.currency.toUpperCase() === currency,
  );
}

function validEnrollmentHosts(adapter: PayoutAdapter): string[] {
  if (!Array.isArray(adapter.enrollmentAllowedHosts) || !adapter.enrollmentAllowedHosts.length) return [];
  const hostnamePattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/;
  const hosts = adapter.enrollmentAllowedHosts.map((value) => String(value || '').trim().toLowerCase());
  if (hosts.some((host) => !hostnamePattern.test(host))) return [];
  return [...new Set(hosts)];
}

function hasSafeHostedEnrollment(adapter: PayoutAdapter): boolean {
  return Boolean(
    adapter.hostedTokenizedEnrollment
    && adapter.createEnrollmentSession
    && validEnrollmentHosts(adapter).length,
  );
}

function adapterConfigurationVersion(adapter: PayoutAdapter, companyId: string): string {
  const version = String(adapter.configurationVersion(companyId) || '').trim();
  if (!version || version.length > 128) {
    throw new PayoutError(
      'The payout adapter configuration version is unavailable for this company.',
      503,
      'PAYOUT_ADAPTER_CONFIGURATION_INVALID',
    );
  }
  return version;
}

function adapterCompanyLimits(adapter: PayoutAdapter, companyId: string, currency: string) {
  const limits = adapter.companyLimits(companyId, currency);
  if (
    !limits
    || !Number.isSafeInteger(limits.maxBatchMinor)
    || limits.maxBatchMinor <= 0
    || !Number.isSafeInteger(limits.maxRecipientMinor)
    || limits.maxRecipientMinor <= 0
    || limits.maxRecipientMinor > limits.maxBatchMinor
  ) {
    throw new PayoutError(
      'The payout adapter has no valid treasury limits for this company and currency.',
      503,
      'PAYOUT_ADAPTER_LIMITS_INVALID',
    );
  }
  return limits;
}

function adapterIsCompanyOperational(
  adapter: PayoutAdapter,
  companyId: string,
  currency: string,
): boolean {
  try {
    if (!adapter.isConfigured() || !adapter.isCompanyReady(companyId)) return false;
    adapterConfigurationVersion(adapter, companyId);
    adapterCompanyLimits(adapter, companyId, currency);
    return true;
  } catch {
    return false;
  }
}

export function registerPayoutAdapter(adapter: PayoutAdapter): void {
  if (!adapter || !/^[a-z][a-z0-9_-]{2,63}$/.test(String(adapter.id || ''))) {
    throw new Error('Payout adapter ID must be a stable lowercase identifier');
  }
  if (!Array.isArray(adapter.supportedPairs) || adapter.supportedPairs.length === 0) {
    throw new Error(`Payout adapter ${adapter.id} must declare supported country/currency pairs`);
  }
  if (
    typeof adapter.isConfigured !== 'function'
    || typeof adapter.isCompanyReady !== 'function'
    || typeof adapter.configurationVersion !== 'function'
    || typeof adapter.companyLimits !== 'function'
    || typeof adapter.submitBatch !== 'function'
  ) {
    throw new Error(`Payout adapter ${adapter.id} does not implement the required contract`);
  }
  if (adapter.hostedTokenizedEnrollment) {
    if (typeof adapter.createEnrollmentSession !== 'function' || !validEnrollmentHosts(adapter).length) {
      throw new Error(
        `Payout adapter ${adapter.id} must declare hosted enrollment and an HTTPS hostname allowlist`,
      );
    }
  }
  if (configuredAdapters.has(adapter.id)) throw new Error(`Payout adapter ${adapter.id} is already registered`);
  configuredAdapters.set(adapter.id, adapter);
}

export function unregisterPayoutAdapterForTests(adapterId: string): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('Adapters can only be unregistered in tests');
  configuredAdapters.delete(adapterId);
}

export function getCountryCapability(
  countryValue: unknown,
  currencyValue: unknown,
  adapters: ReadonlyMap<string, PayoutAdapter> = configuredAdapters,
  companyId?: string,
) {
  const definition = getCountryDefinition(countryValue, currencyValue);
  const candidates = [...adapters.values()].filter((adapter) =>
    adapterSupports(adapter, definition.country, definition.currency),
  );
  const globallyConfigured = candidates.filter((adapter) => {
    try { return adapter.isConfigured(); } catch { return false; }
  });
  const configured = companyId
    ? globallyConfigured.find((adapter) =>
        adapterIsCompanyOperational(adapter, companyId, definition.currency),
      ) || null
    : null;
  return {
    ...definition,
    available: true,
    reason: null,
    payoutExecution: {
      available: candidates.length > 0,
      configured: Boolean(configured),
      adapterId: configured?.id || null,
      hostedTokenizedEnrollment: Boolean(
        configured && hasSafeHostedEnrollment(configured),
      ),
      reason: configured
        ? null
        : !candidates.length
          ? 'No payout adapter is registered for this country and currency.'
          : !globallyConfigured.length
            ? 'A payout adapter exists but is not configured.'
            : !companyId
              ? 'Company payout readiness has not been verified.'
              : 'No payout adapter is authorized and ready for this company.',
    },
  };
}

export function confirmationForBatch(batchId: string): string {
  return `EXECUTE ${batchId}`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value: unknown): string {
  return createHash('sha256').update(typeof value === 'string' ? value : stableJson(value)).digest('hex');
}

function validateId(value: unknown, label: string): string {
  const text = String(value || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw new PayoutError(`${label} must be a valid ID`, 400, 'INVALID_ID');
  }
  return text;
}

function validateIdempotencyKey(value: unknown): string {
  const key = String(value || '').trim();
  if (key.length < 16 || key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw new PayoutError(
      'A 16–128 character idempotency key is required',
      400,
      'INVALID_IDEMPOTENCY_KEY',
    );
  }
  return key;
}

function assertManager(actor: PayoutActor): void {
  if (!actor?.id || !actor.companyId) throw new PayoutError('Not authenticated', 401, 'NOT_AUTHENTICATED');
  if (!['boss', 'owner', 'manager', 'admin'].includes(String(actor.role || '').toLowerCase())) {
    throw new PayoutError('Payroll manager access is required', 403, 'PAYOUT_ACCESS_DENIED');
  }
}

function money(totalMinor: number, currency: string): string {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).format(totalMinor / 100);
}

type PayrollCertificationMetadata = Pick<
  PayrollSnapshot,
  | 'payoutCountry'
  | 'payoutCurrency'
  | 'payoutCalculationEngine'
  | 'payoutCalculationVersion'
  | 'payoutCertifiedAt'
>;

type PayrollCertificationProblem = {
  code: 'PAYROLL_PAYOUT_NOT_CERTIFIED' | 'PAYROLL_PAYOUT_PAIR_MISMATCH';
  message: string;
};

function payrollCertificationProblem(
  payroll: PayrollCertificationMetadata,
  expectedCountry?: string,
  expectedCurrency?: string,
): PayrollCertificationProblem | null {
  const country = typeof payroll.payoutCountry === 'string' ? payroll.payoutCountry.trim() : '';
  const currency = typeof payroll.payoutCurrency === 'string' ? payroll.payoutCurrency.trim() : '';
  const engine = typeof payroll.payoutCalculationEngine === 'string'
    ? payroll.payoutCalculationEngine.trim()
    : '';
  const version = typeof payroll.payoutCalculationVersion === 'string'
    ? payroll.payoutCalculationVersion.trim()
    : '';
  const certifiedAt = typeof payroll.payoutCertifiedAt === 'string'
    ? payroll.payoutCertifiedAt.trim()
    : '';
  const certifiedTime = certifiedAt ? new Date(certifiedAt).getTime() : Number.NaN;

  if (
    !/^[A-Z]{2}$/.test(country)
    || !/^[A-Z]{3}$/.test(currency)
    || !engine
    || engine.length > 100
    || !version
    || version.length > 100
    || !Number.isFinite(certifiedTime)
  ) {
    return {
      code: 'PAYROLL_PAYOUT_NOT_CERTIFIED',
      message: 'Payroll payout calculations are not certified. Recalculate and certify this payroll before payout.',
    };
  }

  if (
    (expectedCountry && country !== expectedCountry)
    || (expectedCurrency && currency !== expectedCurrency)
  ) {
    return {
      code: 'PAYROLL_PAYOUT_PAIR_MISMATCH',
      message: `Payroll is certified for ${country}/${currency}, not ${expectedCountry}/${expectedCurrency}.`,
    };
  }
  return null;
}

function ensureSafeMinorAmount(value: unknown): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 100_000_000_000) {
    throw new PayoutError('Payout amount is outside the supported range', 422, 'INVALID_PAYOUT_AMOUNT');
  }
  return amount;
}

function safeProviderCode(value: unknown, fallback: string): string {
  const code = String(value || fallback).trim().toUpperCase().replace(/[^A-Z0-9_.:-]/g, '_').slice(0, 80);
  return code || fallback;
}

export type PayoutOrchestratorOptions = {
  repository: PayoutRepository;
  adapters?: ReadonlyMap<string, PayoutAdapter> | ReadonlyArray<PayoutAdapter>;
  now?: () => Date;
  enrollmentReturnUrl?: string;
  approvalTtlMs?: number;
};

function mapAdapters(input?: ReadonlyMap<string, PayoutAdapter> | ReadonlyArray<PayoutAdapter>): ReadonlyMap<string, PayoutAdapter> {
  if (!input) return configuredAdapters;
  if (Array.isArray(input)) return new Map(input.map((adapter) => [adapter.id, adapter]));
  return input as ReadonlyMap<string, PayoutAdapter>;
}

export function createPayoutOrchestrator(options: PayoutOrchestratorOptions) {
  const repository = options.repository;
  const adapters = mapAdapters(options.adapters);
  const now = options.now || (() => new Date());
  const approvalTtlMs = options.approvalTtlMs ?? 24 * 60 * 60 * 1000;
  if (!Number.isSafeInteger(approvalTtlMs) || approvalTtlMs <= 0) {
    throw new Error('Payout approval TTL must be a positive whole number of milliseconds');
  }

  function resolveAdapter(
    adapterId: string | null,
    country: string,
    currency: string,
    companyId: string,
    _requireConfigured = true,
  ): PayoutAdapter {
    if (!adapterId) {
      throw new PayoutError(
        'A payout adapter has not been selected for this company.',
        503,
        'PAYOUT_ADAPTER_NOT_CONFIGURED',
      );
    }
    const adapter = adapters.get(adapterId);
    if (!adapter || !adapterSupports(adapter, country, currency)) {
      throw new PayoutError(
        'The selected payout adapter is unavailable for this country and currency.',
        503,
        'PAYOUT_ADAPTER_NOT_CONFIGURED',
      );
    }
    let globallyConfigured = false;
    let companyReady = false;
    try {
      globallyConfigured = adapter.isConfigured();
      companyReady = adapter.isCompanyReady(companyId);
    } catch {
      globallyConfigured = false;
      companyReady = false;
    }
    if (!globallyConfigured) {
      throw new PayoutError(
        'The selected payout adapter is not configured.',
        503,
        'PAYOUT_ADAPTER_NOT_CONFIGURED',
      );
    }
    if (!companyReady) {
      throw new PayoutError(
        'The selected payout adapter is not authorized and ready for this company.',
        503,
        'PAYOUT_ADAPTER_COMPANY_NOT_READY',
      );
    }
    return adapter;
  }

  function assertAdapterBinding(batch: StoredPayoutBatch, adapter: PayoutAdapter): void {
    const currentVersion = adapterConfigurationVersion(adapter, batch.companyId);
    if (currentVersion !== batch.adapterConfigurationVersion) {
      throw new PayoutError(
        'The payout connection configuration changed after this batch was prepared. Create a new batch.',
        409,
        'PAYOUT_ADAPTER_CONFIGURATION_CHANGED',
      );
    }
  }

  function enforceCompanyLimits(
    adapter: PayoutAdapter,
    companyId: string,
    currency: string,
    amounts: number[],
  ): number {
    const limits = adapterCompanyLimits(adapter, companyId, currency);
    const total = amounts.reduce((sum, value) => sum + ensureSafeMinorAmount(value), 0);
    if (!Number.isSafeInteger(total) || total <= 0) {
      throw new PayoutError('Payout amount is outside the supported range', 422, 'INVALID_PAYOUT_AMOUNT');
    }
    if (amounts.some((amount) => amount > limits.maxRecipientMinor)) {
      throw new PayoutError(
        'An employee payout exceeds this company\'s certified recipient limit.',
        422,
        'PAYOUT_RECIPIENT_LIMIT_EXCEEDED',
      );
    }
    if (total > limits.maxBatchMinor) {
      throw new PayoutError(
        'The payout batch exceeds this company\'s certified treasury limit.',
        422,
        'PAYOUT_BATCH_LIMIT_EXCEEDED',
      );
    }
    return total;
  }

  function approvalIsFresh(batch: StoredPayoutBatch): boolean {
    if (!batch.approvedAt) return false;
    const approvedTime = new Date(batch.approvedAt).getTime();
    const currentTime = now().getTime();
    return Number.isFinite(approvedTime)
      && approvedTime <= currentTime
      && currentTime - approvedTime <= approvalTtlMs;
  }

  function decorateBatch(batch: StoredPayoutBatch, actor: PayoutActor): PayoutBatch {
    const adapter = adapters.get(batch.adapterId);
    const adapterReady = Boolean(
      adapter
      && adapterSupports(adapter, batch.country, batch.currency)
      && adapterIsCompanyOperational(adapter, batch.companyId, batch.currency)
      && (() => {
        try {
          return adapterConfigurationVersion(adapter, batch.companyId)
            === batch.adapterConfigurationVersion;
        } catch {
          return false;
        }
      })(),
    );
    const roleAllowed = ['boss', 'owner', 'manager', 'admin'].includes(String(actor.role || '').toLowerCase());
    const { companyId: _companyId, executionKeyHash: _executionKeyHash, ...safe } = batch;
    return {
      ...safe,
      totalFormatted: money(batch.totalMinor, batch.currency),
      actions: {
        canApprove: roleAllowed
          && batch.status === 'awaiting_approval'
          && batch.createdBy !== actor.id
          && adapterReady,
        canExecute: roleAllowed && batch.status === 'approved' && adapterReady && approvalIsFresh(batch),
      },
    };
  }

  async function settingsForPair(
    companyId: string,
    countryValue: unknown,
    currencyValue: unknown,
    requireAdapter: boolean,
  ): Promise<{ settings: PayoutSettings; definition: CountryDefinition; adapter: PayoutAdapter | null }> {
    const definition = getCountryDefinition(countryValue, currencyValue);
    const settings = await repository.getSettings(companyId);
    if (!settings) {
      throw new PayoutError(
        'Choose the company payout country and currency before preparing a batch.',
        409,
        'PAYOUT_SETTINGS_REQUIRED',
      );
    }
    if (settings.country !== definition.country || settings.currency !== definition.currency) {
      throw new PayoutError(
        'The requested country and currency do not match company payout settings.',
        409,
        'PAYOUT_SETTINGS_MISMATCH',
      );
    }
    const adapter = requireAdapter
      ? resolveAdapter(settings.adapterId, definition.country, definition.currency, companyId, true)
      : settings.adapterId
        ? resolveAdapter(settings.adapterId, definition.country, definition.currency, companyId, false)
        : null;
    return { settings, definition, adapter };
  }

  function validateSnapshot(
    snapshot: PayrollSnapshot | null,
    expectedCountry: string,
    expectedCurrency: string,
  ): PayrollSnapshot {
    if (!snapshot) throw new PayoutError('Payroll was not found in your company.', 404, 'PAYROLL_NOT_FOUND');
    const certificationProblem = payrollCertificationProblem(
      snapshot,
      expectedCountry,
      expectedCurrency,
    );
    if (certificationProblem) {
      throw new PayoutError(certificationProblem.message, 409, certificationProblem.code);
    }
    if (!['approved', 'processed'].includes(snapshot.payrollStatus.toLowerCase())) {
      throw new PayoutError(
        'Only approved or processed payroll can be prepared for payout.',
        409,
        'PAYROLL_NOT_APPROVED',
      );
    }
    if (!snapshot.lines.length) {
      throw new PayoutError('Payroll has no positive employee payouts.', 409, 'EMPTY_PAYOUT_BATCH');
    }
    for (const line of snapshot.lines) ensureSafeMinorAmount(line.amountMinor);
    return snapshot;
  }

  async function previewBatch(input: {
    actor: PayoutActor;
    payrollId: unknown;
    country: unknown;
    currency: unknown;
  }) {
    assertNoRawBankingData(input);
    assertManager(input.actor);
    const payrollId = validateId(input.payrollId, 'Payroll ID');
    const { settings, definition } = await settingsForPair(
      input.actor.companyId,
      input.country,
      input.currency,
      false,
    );
    if (!settings.adapterId) {
      return {
        payrollId,
        country: definition.country,
        currency: definition.currency,
        eligible: false,
        reason: 'Choose a configured payout connection before creating a batch.',
        employeeCount: 0,
        totalMinor: 0,
        totalFormatted: money(0, definition.currency),
        recipients: [],
      };
    }
    const adapter = resolveAdapter(
      settings.adapterId,
      definition.country,
      definition.currency,
      input.actor.companyId,
      true,
    );
    const snapshot = validateSnapshot(await repository.getPayrollSnapshot({
      companyId: input.actor.companyId,
      payrollId,
      country: definition.country,
      currency: definition.currency,
      adapterId: settings.adapterId,
    }), definition.country, definition.currency);
    const missing = snapshot.lines.filter((line) =>
      !line.recipientReference || !line.destinationFingerprint || line.destinationStatus !== 'active',
    );
    const totalMinor = enforceCompanyLimits(
      adapter,
      input.actor.companyId,
      definition.currency,
      snapshot.lines.map((line) => line.amountMinor),
    );
    return {
      payrollId,
      country: definition.country,
      currency: definition.currency,
      eligible: missing.length === 0,
      reason: missing.length ? `${missing.length} employee payout destination${missing.length === 1 ? ' is' : 's are'} not ready.` : null,
      employeeCount: snapshot.lines.length,
      totalMinor,
      totalFormatted: money(totalMinor, definition.currency),
      recipients: snapshot.lines.map((line) => ({
        employeeId: line.employeeId,
        employeeName: line.employeeName,
        amountMinor: line.amountMinor,
        amountFormatted: money(line.amountMinor, definition.currency),
        destinationReady: Boolean(
          line.recipientReference && line.destinationFingerprint && line.destinationStatus === 'active',
        ),
      })),
    };
  }

  async function createBatch(input: {
    actor: PayoutActor;
    payrollId: unknown;
    country: unknown;
    currency: unknown;
    idempotencyKey: unknown;
  }): Promise<{ replayed: boolean; batch: PayoutBatch }> {
    assertNoRawBankingData(input);
    assertManager(input.actor);
    const payrollId = validateId(input.payrollId, 'Payroll ID');
    const idempotencyKey = validateIdempotencyKey(input.idempotencyKey);
    const { settings, definition, adapter } = await settingsForPair(
      input.actor.companyId,
      input.country,
      input.currency,
      true,
    );
    if (!adapter || !settings.adapterId) throw new PayoutError('Payout adapter unavailable', 503, 'PAYOUT_ADAPTER_NOT_CONFIGURED');
    if (!hasSafeHostedEnrollment(adapter)) {
      throw new PayoutError(
        'This payout connection does not support hosted tokenized employee enrollment.',
        503,
        'PAYOUT_ENROLLMENT_NOT_CONFIGURED',
      );
    }
    const scope = 'create_batch';
    const requestHash = digest({ payrollId, country: definition.country, currency: definition.currency, actorId: input.actor.id });
    return repository.transaction(async (tx) => {
      await tx.acquireLock(`${input.actor.companyId}:${scope}:${idempotencyKey}`);
      const prior = await tx.getIdempotency(input.actor.companyId, scope, idempotencyKey);
      if (prior) {
        if (prior.requestHash !== requestHash) {
          throw new PayoutError('Idempotency key was already used for a different request.', 409, 'IDEMPOTENCY_CONFLICT');
        }
        const existing = await tx.getBatch(input.actor.companyId, prior.batchId);
        if (!existing) throw new PayoutError('Idempotent batch record is unavailable.', 409, 'IDEMPOTENCY_RECORD_INVALID');
        return { replayed: true, batch: decorateBatch(existing, input.actor) };
      }
      const snapshot = validateSnapshot(await tx.getPayrollSnapshot({
        companyId: input.actor.companyId,
        payrollId,
        country: definition.country,
        currency: definition.currency,
        adapterId: settings.adapterId,
        lock: true,
      }), definition.country, definition.currency);
      const invalid = snapshot.lines.filter((line) =>
        !line.recipientReference || !line.destinationFingerprint || line.destinationStatus !== 'active',
      );
      if (invalid.length) {
        throw new PayoutError(
          `${invalid.length} employee payout destination${invalid.length === 1 ? ' is' : 's are'} not ready.`,
          409,
          'PAYOUT_DESTINATION_NOT_READY',
        );
      }
      const totalMinor = enforceCompanyLimits(
        adapter,
        input.actor.companyId,
        definition.currency,
        snapshot.lines.map((line) => line.amountMinor),
      );
      const stamp = now().toISOString();
      const stored: StoredPayoutBatch = {
        id: randomUUID(),
        companyId: input.actor.companyId,
        payrollId,
        country: definition.country,
        currency: definition.currency,
        adapterId: settings.adapterId,
        adapterConfigurationVersion: adapterConfigurationVersion(adapter, input.actor.companyId),
        calculationEngine: snapshot.payoutCalculationEngine!,
        calculationVersion: snapshot.payoutCalculationVersion!,
        calculationCertifiedAt: snapshot.payoutCertifiedAt!,
        status: 'awaiting_approval',
        employeeCount: snapshot.lines.length,
        totalMinor,
        createdBy: input.actor.id,
        approvedBy: null,
        approvedAt: null,
        providerReference: null,
        executionKeyHash: null,
        failureCode: null,
        createdAt: stamp,
        updatedAt: stamp,
      };
      const created = await tx.createBatch(stored, snapshot.lines.map((line) => ({
        employeeId: line.employeeId,
        amountMinor: line.amountMinor,
        currency: definition.currency,
        destinationFingerprint: line.destinationFingerprint!,
      })));
      await tx.appendEvent({
        companyId: input.actor.companyId,
        batchId: created.id,
        type: 'batch_created',
        actorId: input.actor.id,
        details: {
          payrollId,
          employeeCount: created.employeeCount,
          totalMinor,
          currency: definition.currency,
          calculationEngine: created.calculationEngine,
          calculationVersion: created.calculationVersion,
          calculationCertifiedAt: created.calculationCertifiedAt,
        },
      });
      await tx.saveIdempotency({
        companyId: input.actor.companyId,
        scope,
        key: idempotencyKey,
        requestHash,
        batchId: created.id,
      });
      return { replayed: false, batch: decorateBatch(created, input.actor) };
    });
  }

  async function approveBatch(input: {
    actor: PayoutActor;
    batchId: unknown;
    idempotencyKey: unknown;
  }): Promise<{ replayed: boolean; batch: PayoutBatch }> {
    assertNoRawBankingData(input);
    assertManager(input.actor);
    const batchId = validateId(input.batchId, 'Batch ID');
    const idempotencyKey = validateIdempotencyKey(input.idempotencyKey);
    const scope = `approve_batch:${batchId}`;
    const requestHash = digest({ batchId, actorId: input.actor.id });
    return repository.transaction(async (tx) => {
      await tx.acquireLock(`${input.actor.companyId}:${scope}:${idempotencyKey}`);
      const prior = await tx.getIdempotency(input.actor.companyId, scope, idempotencyKey);
      if (prior) {
        if (prior.requestHash !== requestHash) {
          throw new PayoutError('Idempotency key was already used for a different request.', 409, 'IDEMPOTENCY_CONFLICT');
        }
        const existing = await tx.getBatch(input.actor.companyId, prior.batchId);
        if (!existing) throw new PayoutError('Idempotent batch record is unavailable.', 409, 'IDEMPOTENCY_RECORD_INVALID');
        return { replayed: true, batch: decorateBatch(existing, input.actor) };
      }
      const batch = await tx.getBatch(input.actor.companyId, batchId, true);
      if (!batch) throw new PayoutError('Payout batch was not found.', 404, 'PAYOUT_BATCH_NOT_FOUND');
      if (batch.createdBy === input.actor.id) {
        throw new PayoutError(
          'The person who prepared this batch cannot approve it.',
          403,
          'PAYOUT_SEPARATION_OF_DUTIES',
        );
      }
      if (batch.status !== 'awaiting_approval') {
        throw new PayoutError('Only a batch awaiting approval can be approved.', 409, 'PAYOUT_INVALID_STATE');
      }
      // Re-resolve the adapter at approval time so a disabled integration cannot be approved for execution.
      const adapter = resolveAdapter(
        batch.adapterId,
        batch.country,
        batch.currency,
        input.actor.companyId,
        true,
      );
      assertAdapterBinding(batch, adapter);
      const updated = await tx.updateBatch(input.actor.companyId, batchId, {
        status: 'approved',
        approvedBy: input.actor.id,
        approvedAt: now().toISOString(),
      });
      await tx.appendEvent({
        companyId: input.actor.companyId,
        batchId,
        type: 'batch_approved',
        actorId: input.actor.id,
        details: {},
      });
      await tx.saveIdempotency({
        companyId: input.actor.companyId,
        scope,
        key: idempotencyKey,
        requestHash,
        batchId,
      });
      return { replayed: false, batch: decorateBatch(updated, input.actor) };
    });
  }

  async function executeBatch(input: {
    actor: PayoutActor;
    batchId: unknown;
    confirmation: unknown;
    idempotencyKey: unknown;
  }): Promise<{ replayed: boolean; batch: PayoutBatch }> {
    assertNoRawBankingData(input);
    assertManager(input.actor);
    const batchId = validateId(input.batchId, 'Batch ID');
    const idempotencyKey = validateIdempotencyKey(input.idempotencyKey);
    if (String(input.confirmation || '') !== confirmationForBatch(batchId)) {
      throw new PayoutError(
        `Confirmation must exactly match "${confirmationForBatch(batchId)}".`,
        400,
        'PAYOUT_CONFIRMATION_REQUIRED',
      );
    }
    const scope = `execute_batch:${batchId}`;
    const requestHash = digest({ batchId, confirmation: input.confirmation, actorId: input.actor.id });

    const prepared = await repository.transaction(async (tx) => {
      await tx.acquireLock(`${input.actor.companyId}:${scope}:${idempotencyKey}`);
      const prior = await tx.getIdempotency(input.actor.companyId, scope, idempotencyKey);
      if (prior) {
        if (prior.requestHash !== requestHash) {
          throw new PayoutError('Idempotency key was already used for a different request.', 409, 'IDEMPOTENCY_CONFLICT');
        }
        const existing = await tx.getBatch(input.actor.companyId, prior.batchId, true);
        if (!existing) throw new PayoutError('Idempotent batch record is unavailable.', 409, 'IDEMPOTENCY_RECORD_INVALID');
        if (['submitted', 'processing', 'settled', 'failed'].includes(existing.status)) {
          return { replayed: true, complete: existing, batch: existing, items: [] as StoredBatchItem[], adapter: null as PayoutAdapter | null };
        }
      }
      const batch = await tx.getBatch(input.actor.companyId, batchId, true);
      if (!batch) throw new PayoutError('Payout batch was not found.', 404, 'PAYOUT_BATCH_NOT_FOUND');
      if (!batch.approvedBy || !batch.approvedAt) {
        throw new PayoutError('The payout batch requires approval before execution.', 409, 'PAYOUT_APPROVAL_REQUIRED');
      }
      if (!approvalIsFresh(batch)) {
        throw new PayoutError(
          'Payout approval has expired. Prepare and approve a new batch.',
          409,
          'PAYOUT_APPROVAL_EXPIRED',
        );
      }
      if (!['approved', 'submitting'].includes(batch.status)) {
        throw new PayoutError('This payout batch cannot be executed in its current state.', 409, 'PAYOUT_INVALID_STATE');
      }
      const adapter = resolveAdapter(
        batch.adapterId,
        batch.country,
        batch.currency,
        input.actor.companyId,
        true,
      );
      assertAdapterBinding(batch, adapter);
      const providerKeyHash = digest(`payout-batch:${batch.id}`);
      if (batch.executionKeyHash && batch.executionKeyHash !== providerKeyHash) {
        throw new PayoutError('Payout execution identity does not match this batch.', 409, 'PAYOUT_EXECUTION_CONFLICT');
      }
      const items = await tx.listExecutionItems(input.actor.companyId, batch.id);
      if (items.length !== batch.employeeCount) {
        throw new PayoutError('Payout destinations changed; create a new batch.', 409, 'PAYOUT_DESTINATION_CHANGED');
      }
      const itemTotal = enforceCompanyLimits(
        adapter,
        input.actor.companyId,
        batch.currency,
        items.map((item) => item.amountMinor),
      );
      if (itemTotal !== batch.totalMinor || items.some((item) => item.currency !== batch.currency)) {
        throw new PayoutError('The immutable payout snapshot does not match the batch total.', 409, 'PAYOUT_SNAPSHOT_MISMATCH');
      }
      for (const item of items) {
        const currentFingerprint = item.currentDestinationFingerprint
          || (item.recipientReference ? digest(`${adapter.id}:${item.recipientReference}`) : null);
        if (!item.recipientReference || currentFingerprint !== item.destinationFingerprint) {
          throw new PayoutError('Payout destinations changed; create a new batch.', 409, 'PAYOUT_DESTINATION_CHANGED');
        }
      }
      const current = batch.status === 'approved'
        ? await tx.updateBatch(input.actor.companyId, batch.id, {
            status: 'submitting',
            executionKeyHash: providerKeyHash,
            failureCode: null,
          })
        : batch;
      if (batch.status === 'approved') {
        await tx.appendEvent({
          companyId: input.actor.companyId,
          batchId: batch.id,
          type: 'submission_started',
          actorId: input.actor.id,
          details: {},
        });
      }
      if (!prior) {
        await tx.saveIdempotency({
          companyId: input.actor.companyId,
          scope,
          key: idempotencyKey,
          requestHash,
          batchId: batch.id,
        });
      }
      return { replayed: Boolean(prior), complete: null, batch: current, items, adapter };
    });

    if (prepared.complete) return { replayed: true, batch: decorateBatch(prepared.complete, input.actor) };

    const adapterRequest: AdapterSubmission = {
      batchId: prepared.batch.id,
      companyId: prepared.batch.companyId,
      country: prepared.batch.country,
      currency: prepared.batch.currency,
      adapterConfigurationVersion: prepared.batch.adapterConfigurationVersion,
      totalMinor: prepared.batch.totalMinor,
      // Derived from the immutable batch ID so transport retries cannot duplicate a payout.
      idempotencyKey: `payout-batch:${prepared.batch.id}`,
      recipients: prepared.items.map((item) => ({
        employeeId: item.employeeId,
        amountMinor: item.amountMinor,
        currency: item.currency,
        recipientReference: item.recipientReference!,
      })),
    };
    assertNoRawBankingData(adapterRequest);

    let result: AdapterSubmissionResult;
    try {
      result = await prepared.adapter!.submitBatch(adapterRequest);
      assertNoRawBankingData(result);
      if (!['submitted', 'processing', 'settled', 'failed'].includes(result?.state)) {
        throw new PayoutError('Payout adapter returned an invalid state.', 502, 'PAYOUT_ADAPTER_INVALID_RESPONSE');
      }
      if (result.state !== 'failed' && (!result.providerReference || result.providerReference.length > 200)) {
        throw new PayoutError('Payout adapter omitted its submission reference.', 502, 'PAYOUT_ADAPTER_INVALID_RESPONSE');
      }
    } catch (error: any) {
      await repository.transaction(async (tx) => {
        await tx.acquireLock(`${input.actor.companyId}:submission_failure:${batchId}`);
        const current = await tx.getBatch(input.actor.companyId, batchId, true);
        if (current?.status === 'submitting') {
          await tx.appendEvent({
            companyId: input.actor.companyId,
            batchId,
            type: 'submission_outcome_unknown',
            actorId: input.actor.id,
            details: { code: safeProviderCode(error?.code, 'PROVIDER_UNAVAILABLE') },
          });
        }
      });
      if (error instanceof PayoutError) throw error;
      throw new PayoutError(
        'The payout provider did not confirm submission. Retry safely with the same batch; no second provider key will be created.',
        502,
        'PAYOUT_SUBMISSION_UNCONFIRMED',
      );
    }

    const finalized = await repository.transaction(async (tx) => {
      await tx.acquireLock(`${input.actor.companyId}:submission_result:${batchId}`);
      const current = await tx.getBatch(input.actor.companyId, batchId, true);
      if (!current) throw new PayoutError('Payout batch was not found.', 404, 'PAYOUT_BATCH_NOT_FOUND');
      if (['submitted', 'processing', 'settled', 'failed'].includes(current.status)) return current;
      if (current.status !== 'submitting') {
        throw new PayoutError('Payout batch changed during submission.', 409, 'PAYOUT_EXECUTION_CONFLICT');
      }
      const providerReference = result.providerReference ? String(result.providerReference).slice(0, 200) : null;
      const updated = await tx.updateBatch(input.actor.companyId, batchId, {
        status: result.state,
        providerReference,
        failureCode: result.state === 'failed' ? safeProviderCode(result.failureCode, 'PROVIDER_REJECTED') : null,
      });
      await tx.appendEvent({
        companyId: input.actor.companyId,
        batchId,
        type: result.state === 'failed' ? 'submission_failed' : 'batch_submitted',
        actorId: input.actor.id,
        details: {
          state: result.state,
          providerReference,
          failureCode: updated.failureCode,
        },
      });
      return updated;
    });
    return { replayed: prepared.replayed, batch: decorateBatch(finalized, input.actor) };
  }

  return {
    async getCapabilities(actor: PayoutActor) {
      assertManager(actor);
      const [settings, accountingConfigured] = await Promise.all([
        repository.getSettings(actor.companyId),
        repository.isAccountingSyncConfigured(actor.companyId),
      ]);
      const capabilities = PAYOUT_COUNTRIES.map((definition) => {
        const capability = getCountryCapability(
          definition.country,
          definition.currency,
          adapters,
          actor.companyId,
        );
        const pairIsSelected = settings?.country === definition.country && settings.currency === definition.currency;
        const selectedAdapter = pairIsSelected ? settings?.adapterId || null : null;
        const selected = selectedAdapter ? adapters.get(selectedAdapter) : null;
        const selectedConfigured = Boolean(
          selected
          && adapterSupports(selected, definition.country, definition.currency)
          && adapterIsCompanyOperational(selected, actor.companyId, definition.currency),
        );
        const enforceSelectedAdapter = Boolean(pairIsSelected && selectedAdapter);
        const executionConfigured = enforceSelectedAdapter
          ? selectedConfigured
          : capability.payoutExecution.configured;
        const advertisedAdapterId = enforceSelectedAdapter
          ? selectedConfigured ? selectedAdapter : null
          : capability.payoutExecution.adapterId;
        return {
          country: definition.country,
          countryName: definition.countryName,
          currency: definition.currency,
          available: true,
          reason: null,
          payoutExecution: {
            ...capability.payoutExecution,
            configured: executionConfigured,
            adapterId: advertisedAdapterId,
            hostedTokenizedEnrollment: Boolean(
              enforceSelectedAdapter
                ? selectedConfigured && selected && hasSafeHostedEnrollment(selected)
                : capability.payoutExecution.hostedTokenizedEnrollment,
            ),
            reason: executionConfigured
              ? null
              : enforceSelectedAdapter
                ? 'The selected payout adapter is not configured for this country and currency.'
                : capability.payoutExecution.reason,
          },
          accountingSync: {
            available: true,
            configured: accountingConfigured,
            provider: accountingConfigured ? 'quickbooks' : null,
            reason: accountingConfigured ? null : 'QuickBooks accounting sync is not connected.',
          },
        };
      });
      let executionEnabled = false;
      if (settings?.adapterId) {
        const selected = adapters.get(settings.adapterId);
        executionEnabled = Boolean(
          selected
          && adapterSupports(selected, settings.country, settings.currency)
          && adapterIsCompanyOperational(selected, actor.companyId, settings.currency),
        );
      }
      return { executionEnabled, capabilities };
    },

    async getSettings(actor: PayoutActor) {
      assertManager(actor);
      const settings = await repository.getSettings(actor.companyId);
      return {
        settings: settings ? {
          country: settings.country,
          currency: settings.currency,
          adapterId: settings.adapterId,
          updatedAt: settings.updatedAt,
        } : null,
        requiresConfiguration: !settings,
      };
    },

    async updateSettings(input: {
      actor: PayoutActor;
      country: unknown;
      currency: unknown;
      adapterId?: unknown;
    }) {
      assertNoRawBankingData(input);
      assertManager(input.actor);
      const definition = getCountryDefinition(input.country, input.currency);
      const adapterId = input.adapterId === null || input.adapterId === undefined || input.adapterId === ''
        ? null
        : String(input.adapterId).trim();
      if (adapterId) {
        resolveAdapter(
          adapterId,
          definition.country,
          definition.currency,
          input.actor.companyId,
          false,
        );
      }
      const settings = await repository.saveSettings({
        companyId: input.actor.companyId,
        country: definition.country,
        currency: definition.currency,
        adapterId,
        actorId: input.actor.id,
      });
      return {
        country: settings.country,
        currency: settings.currency,
        adapterId: settings.adapterId,
        updatedAt: settings.updatedAt,
      };
    },

    async listAccounts(actor: PayoutActor) {
      assertManager(actor);
      const settings = await repository.getSettings(actor.companyId);
      return repository.listAccounts(actor.companyId, settings);
    },

    async createEnrollmentSession(input: { actor: PayoutActor; employeeId: unknown }) {
      assertNoRawBankingData(input);
      assertManager(input.actor);
      const employeeId = validateId(input.employeeId, 'Employee ID');
      const settings = await repository.getSettings(input.actor.companyId);
      if (!settings) throw new PayoutError('Payout settings are required.', 409, 'PAYOUT_SETTINGS_REQUIRED');
      const adapter = resolveAdapter(
        settings.adapterId,
        settings.country,
        settings.currency,
        input.actor.companyId,
        true,
      );
      if (!hasSafeHostedEnrollment(adapter)) {
        throw new PayoutError(
          'Hosted tokenized payout enrollment is not configured.',
          503,
          'PAYOUT_ENROLLMENT_NOT_CONFIGURED',
        );
      }
      const returnUrl = String(options.enrollmentReturnUrl || '').trim();
      let parsedReturn: URL;
      try { parsedReturn = new URL(returnUrl); } catch {
        throw new PayoutError('Payout enrollment return URL is not configured.', 503, 'PAYOUT_ENROLLMENT_NOT_CONFIGURED');
      }
      if (parsedReturn.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
        throw new PayoutError('Payout enrollment requires an HTTPS return URL.', 503, 'PAYOUT_ENROLLMENT_NOT_CONFIGURED');
      }
      await repository.assertEmployee(input.actor.companyId, employeeId);
      const session = await adapter.createEnrollmentSession({
        companyId: input.actor.companyId,
        employeeId,
        country: settings.country,
        currency: settings.currency,
        returnUrl: parsedReturn.toString(),
      });
      assertNoRawBankingData(session);
      let sessionUrl: URL;
      try { sessionUrl = new URL(String(session?.url || '')); } catch {
        throw new PayoutError('Payout adapter returned an invalid enrollment URL.', 502, 'PAYOUT_ADAPTER_INVALID_RESPONSE');
      }
      const expiresAt = new Date(session.expiresAt);
      const allowedEnrollmentHosts = validEnrollmentHosts(adapter);
      if (
        sessionUrl.protocol !== 'https:'
        || !allowedEnrollmentHosts.includes(sessionUrl.hostname.toLowerCase())
        || !Number.isFinite(expiresAt.getTime())
        || expiresAt <= now()
      ) {
        throw new PayoutError('Payout adapter returned an invalid enrollment session.', 502, 'PAYOUT_ADAPTER_INVALID_RESPONSE');
      }
      return { url: sessionUrl.toString(), expiresAt: expiresAt.toISOString() };
    },

    async listPayrolls(actor: PayoutActor): Promise<PayrollSummary[]> {
      assertManager(actor);
      const settings = await repository.getSettings(actor.companyId);
      if (!settings) return [];
      const adapter = (() => {
        try {
          return resolveAdapter(
            settings.adapterId,
            settings.country,
            settings.currency,
            actor.companyId,
            true,
          );
        } catch {
          return null;
        }
      })();
      const rows = await repository.listPayrolls(actor.companyId, settings);
      return rows.map((row) => {
        const statusReady = ['approved', 'processed'].includes(row.status.toLowerCase());
        const certificationProblem = payrollCertificationProblem(
          row,
          settings.country,
          settings.currency,
        );
        let limitProblem: string | null = null;
        if (!certificationProblem && adapter && row.totalMinor > 0) {
          try {
            const limits = adapterCompanyLimits(adapter, actor.companyId, settings.currency);
            if (row.totalMinor > limits.maxBatchMinor) {
              limitProblem = 'Payroll exceeds this company\'s certified treasury limit.';
            }
          } catch {
            limitProblem = 'Company treasury limits are not configured.';
          }
        }
        const eligible = !certificationProblem
          && Boolean(adapter)
          && !limitProblem
          && statusReady
          && row.employeeCount > 0
          && row.totalMinor > 0
          && !row.hasBatch;
        const reason = certificationProblem?.message
          || (!adapter
          ? 'Payout execution is not configured.'
          : limitProblem
            ? limitProblem
            : !statusReady
            ? 'Payroll must be approved or processed.'
            : row.employeeCount <= 0 || row.totalMinor <= 0
              ? 'Payroll has no positive employee payouts.'
              : row.hasBatch
                ? 'A payout batch already exists for this payroll.'
                : null);
        const { hasBatch: _hasBatch, ...summary } = row;
        const hasCompleteCertification = !payrollCertificationProblem(row);
        return {
          ...summary,
          totalFormatted: hasCompleteCertification
            ? money(row.totalMinor, row.payoutCurrency!)
            : 'Amount unavailable until payout certification',
          eligible,
          reason,
        };
      });
    },

    previewBatch,
    createBatch,

    async listBatches(actor: PayoutActor, limit = 100) {
      assertManager(actor);
      const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 200) : 100;
      return (await repository.listBatches(actor.companyId, safeLimit)).map((batch) => decorateBatch(batch, actor));
    },

    async getBatch(input: { actor: PayoutActor; batchId: unknown }) {
      assertManager(input.actor);
      const batchId = validateId(input.batchId, 'Batch ID');
      const batch = await repository.getBatch(input.actor.companyId, batchId);
      if (!batch) throw new PayoutError('Payout batch was not found.', 404, 'PAYOUT_BATCH_NOT_FOUND');
      const events = await repository.listEvents(input.actor.companyId, batchId);
      return { batch: decorateBatch(batch, input.actor), events };
    },

    approveBatch,
    executeBatch,
  };
}

export type PayoutOrchestrator = ReturnType<typeof createPayoutOrchestrator>;
