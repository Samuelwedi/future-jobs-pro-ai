import { createHash, randomUUID } from 'node:crypto';
import {
  PAYOUT_COUNTRIES,
  registerPayoutAdapter,
  type AdapterSubmission,
  type AdapterSubmissionResult,
  type PayoutAdapter,
} from './nativePayoutService';

export const LOCAL_SANDBOX_ADAPTER_ID = 'local_sandbox_no_money';

const REQUIRED_SENTINEL = 'LOCAL_ONLY_NO_MONEY';
const CONFIGURATION_PREFIX = 'local-sandbox-v1';
const bootNonce = randomUUID();

const supportedPairs = Object.freeze(
  PAYOUT_COUNTRIES.map((definition) => Object.freeze({
    country: definition.country,
    currency: definition.currency,
  })),
);

const cloudMarkers = Object.freeze([
  'RAILWAY_ENVIRONMENT',
  'RAILWAY_ENVIRONMENT_ID',
  'RAILWAY_PROJECT_ID',
  'RAILWAY_SERVICE_ID',
  'AWS_EXECUTION_ENV',
  'K_SERVICE',
  'WEBSITE_INSTANCE_ID',
  'DYNO',
  'VERCEL',
  'RENDER',
]);

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isLoopbackHost(value: string): boolean {
  const host = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\[/, '')
    .replace(/\]$/, '');

  return host === '127.0.0.1'
    || host === 'localhost'
    || host === '::1';
}

function readUrlHost(variableName: string): string | null {
  const raw = String(process.env[variableName] || '').trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    if (!parsed.hostname) {
      throw new Error(`${variableName} has no hostname`);
    }
    return parsed.hostname;
  } catch {
    throw new Error(
      `${variableName} must contain a valid local connection URL`,
    );
  }
}

function assertLoopbackTargets(
  urlVariable: string,
  hostVariable: string,
  label: string,
): void {
  const hosts: string[] = [];
  const urlHost = readUrlHost(urlVariable);
  const directHost = String(process.env[hostVariable] || '').trim();

  if (urlHost) hosts.push(urlHost);
  if (directHost) hosts.push(directHost);

  if (!hosts.length) {
    throw new Error(`${label} local target is not explicitly configured`);
  }

  if (hosts.some((host) => !isLoopbackHost(host))) {
    throw new Error(`${label} must use a loopback-only target`);
  }
}

function companyAllowlist(): ReadonlySet<string> {
  const values = String(
    process.env.PAYOUT_LOCAL_SANDBOX_COMPANY_IDS || '',
  )
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!values.length) {
    throw new Error(
      'PAYOUT_LOCAL_SANDBOX_COMPANY_IDS must explicitly allow local companies',
    );
  }

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (values.some((value) => !uuidPattern.test(value))) {
    throw new Error(
      'PAYOUT_LOCAL_SANDBOX_COMPANY_IDS contains an invalid company ID',
    );
  }

  return new Set(values);
}

function assertLocalRuntime(): ReadonlySet<string> {
  if (
    process.env.PAYOUT_LOCAL_SANDBOX !== REQUIRED_SENTINEL
  ) {
    throw new Error('Local payout simulation is not enabled');
  }

  if (
    String(process.env.FUTUREJOBS_RUNTIME || '').trim().toLowerCase()
      !== 'local'
  ) {
    throw new Error('Local payout simulation requires FUTUREJOBS_RUNTIME=local');
  }

  const nodeEnvironment = String(process.env.NODE_ENV || '')
    .trim()
    .toLowerCase();

  if (
    nodeEnvironment !== 'development'
    && nodeEnvironment !== 'test'
  ) {
    throw new Error(
      'Local payout simulation requires NODE_ENV=development or test',
    );
  }

  if (
    cloudMarkers.some(
      (name) => String(process.env[name] || '').trim().length > 0,
    )
  ) {
    throw new Error(
      'Local payout simulation cannot run in a cloud deployment',
    );
  }

  const applicationHosts = [
    process.env.HOST,
    process.env.APP_HOST,
    process.env.SERVER_HOST,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  if (
    !applicationHosts.length
    || applicationHosts.some((host) => !isLoopbackHost(host))
  ) {
    throw new Error(
      'Local payout simulation requires an explicit loopback application host',
    );
  }

  assertLoopbackTargets(
    'DATABASE_URL',
    'DB_HOST',
    'PostgreSQL',
  );

  assertLoopbackTargets(
    'REDIS_URL',
    'REDIS_HOST',
    'Redis',
  );

  return companyAllowlist();
}

function assertCompanyAllowed(companyId: string): void {
  const normalizedCompanyId = String(companyId || '')
    .trim()
    .toLowerCase();

  if (!companyAllowlist().has(normalizedCompanyId)) {
    throw new Error(
      'Company is not authorized for local payout simulation',
    );
  }
}

function assertOperational(companyId?: string): void {
  assertLocalRuntime();

  if (companyId) {
    assertCompanyAllowed(companyId);
  }
}

function configurationVersion(companyId: string): string {
  assertOperational(companyId);

  return `${CONFIGURATION_PREFIX}-${sha256(
    `${bootNonce}:${companyId}`,
  ).slice(0, 32)}`;
}

function supports(country: string, currency: string): boolean {
  return supportedPairs.some(
    (pair) =>
      pair.country === String(country || '').toUpperCase()
      && pair.currency === String(currency || '').toUpperCase(),
  );
}

function submitBatch(
  input: AdapterSubmission,
): Promise<AdapterSubmissionResult> {
  assertOperational(input.companyId);

  if (!supports(input.country, input.currency)) {
    throw new Error('Unsupported sandbox country and currency');
  }

  if (
    input.adapterConfigurationVersion
      !== configurationVersion(input.companyId)
  ) {
    throw new Error('Sandbox adapter configuration changed');
  }

  if (
    !input.batchId
    || input.idempotencyKey !== `payout-batch:${input.batchId}`
  ) {
    throw new Error('Invalid sandbox payout idempotency identity');
  }

  if (
    !Number.isSafeInteger(input.totalMinor)
    || input.totalMinor <= 0
    || !Array.isArray(input.recipients)
    || input.recipients.length === 0
  ) {
    throw new Error('Invalid sandbox payout total or recipients');
  }

  const employeeIds = new Set<string>();
  let calculatedTotal = 0;

  const recipients = input.recipients.map((recipient) => {
    const employeeId = String(recipient.employeeId || '').trim();
    const reference = String(
      recipient.recipientReference || '',
    ).trim();

    if (!employeeId || employeeIds.has(employeeId)) {
      throw new Error('Invalid or duplicate sandbox employee');
    }

    employeeIds.add(employeeId);

    if (
      !Number.isSafeInteger(recipient.amountMinor)
      || recipient.amountMinor <= 0
      || recipient.currency !== input.currency
    ) {
      throw new Error('Invalid sandbox recipient amount');
    }

    if (!/^sandbox:[a-z0-9_-]{16,128}$/i.test(reference)) {
      throw new Error('Invalid sandbox recipient token');
    }

    calculatedTotal += recipient.amountMinor;

    if (!Number.isSafeInteger(calculatedTotal)) {
      throw new Error('Sandbox payout total is outside the safe range');
    }

    return {
      employeeId,
      amountMinor: recipient.amountMinor,
      currency: recipient.currency,
      recipientReference: reference,
    };
  });

  if (calculatedTotal !== input.totalMinor) {
    throw new Error('Sandbox recipient totals do not match the batch');
  }

  const canonical = JSON.stringify({
    batchId: input.batchId,
    companyId: input.companyId,
    country: input.country,
    currency: input.currency,
    adapterConfigurationVersion:
      input.adapterConfigurationVersion,
    totalMinor: input.totalMinor,
    idempotencyKey: input.idempotencyKey,
    recipients: recipients.sort((left, right) =>
      left.employeeId.localeCompare(right.employeeId)),
  });

  return Promise.resolve({
    state: 'submitted',
    providerReference:
      `sandbox_sim_${sha256(canonical).slice(0, 40)}`,
  });
}

export const localSandboxPayoutAdapter: PayoutAdapter = Object.freeze({
  id: LOCAL_SANDBOX_ADAPTER_ID,
  supportedPairs,
  hostedTokenizedEnrollment: false,

  isConfigured(): boolean {
    try {
      assertOperational();
      return true;
    } catch {
      return false;
    }
  },

  isCompanyReady(companyId: string): boolean {
    try {
      assertOperational(companyId);
      return true;
    } catch {
      return false;
    }
  },

  configurationVersion,

  companyLimits(companyId: string, currency: string) {
    assertOperational(companyId);

    if (
      !supportedPairs.some((pair) => pair.currency === currency)
    ) {
      throw new Error('Unsupported sandbox currency');
    }

    return {
      maxBatchMinor: 10_000_000,
      maxRecipientMinor: 1_000_000,
    };
  },

  submitBatch,
});

export function registerLocalSandboxPayoutAdapter(): void {
  registerPayoutAdapter(localSandboxPayoutAdapter);
}