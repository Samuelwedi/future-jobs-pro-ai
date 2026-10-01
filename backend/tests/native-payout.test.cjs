const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

process.env.NODE_ENV = 'test';

const {
  PayoutError,
  assertNoRawBankingData,
  confirmationForBatch,
  createPayoutOrchestrator,
  getCountryCapability,
} = require('../dist/services/nativePayoutService');

const ids = {
  company: '00000000-0000-4000-8000-000000000001',
  otherCompany: '00000000-0000-4000-8000-000000000002',
  maker: '00000000-0000-4000-8000-000000000011',
  checker: '00000000-0000-4000-8000-000000000012',
  employee: '00000000-0000-4000-8000-000000000013',
  outsider: '00000000-0000-4000-8000-000000000021',
  payroll: '00000000-0000-4000-8000-000000000031',
  otherPayroll: '00000000-0000-4000-8000-000000000032',
  recipientOne: '00000000-0000-4000-8000-000000000041',
  recipientTwo: '00000000-0000-4000-8000-000000000042',
};

const maker = { id: ids.maker, companyId: ids.company, role: 'manager' };
const checker = { id: ids.checker, companyId: ids.company, role: 'boss' };
const employee = { id: ids.employee, companyId: ids.company, role: 'employee' };
const outsider = { id: ids.outsider, companyId: ids.otherCompany, role: 'manager' };

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const clone = (value) => value === undefined ? undefined : structuredClone(value);
const batchKey = (companyId, batchId) => `${companyId}:${batchId}`;
const idemKey = (companyId, scope, key) => `${companyId}:${scope}:${key}`;

function expectPayoutError(code, status) {
  return (error) => {
    assert.ok(error instanceof PayoutError, `expected PayoutError, received ${error}`);
    assert.equal(error.code, code);
    if (status !== undefined) assert.equal(error.status, status);
    return true;
  };
}

function createMemoryRepository({ adapterId = 'test_ca', payrollMetadata = {} } = {}) {
  const recipientReferences = new Map([
    [ids.recipientOne, 'recipient_token_one'],
    [ids.recipientTwo, 'recipient_token_two'],
  ]);
  const certification = {
    payoutCountry: 'CA',
    payoutCurrency: 'CAD',
    payoutCalculationEngine: 'futurejobs-certified-payroll',
    payoutCalculationVersion: '2026.09.1',
    payoutCertifiedAt: '2026-09-24T11:00:00.000Z',
    ...payrollMetadata,
  };
  const snapshot = {
    payrollId: ids.payroll,
    companyId: ids.company,
    periodStart: '2026-09-01',
    periodEnd: '2026-09-15',
    payrollStatus: 'approved',
    ...certification,
    country: certification.payoutCountry || '',
    currency: certification.payoutCurrency || '',
    lines: [
      {
        employeeId: ids.recipientOne,
        employeeName: 'Alex Worker',
        email: 'alex@example.test',
        amountMinor: 12500,
        recipientReference: recipientReferences.get(ids.recipientOne),
        destinationFingerprint: sha256(`${adapterId}:${recipientReferences.get(ids.recipientOne)}`),
        destinationStatus: 'active',
      },
      {
        employeeId: ids.recipientTwo,
        employeeName: 'Blair Worker',
        email: 'blair@example.test',
        amountMinor: 7500,
        recipientReference: recipientReferences.get(ids.recipientTwo),
        destinationFingerprint: sha256(`${adapterId}:${recipientReferences.get(ids.recipientTwo)}`),
        destinationStatus: 'active',
      },
    ],
  };
  const state = {
    settings: new Map([
      [ids.company, {
        companyId: ids.company,
        country: 'CA',
        currency: 'CAD',
        adapterId,
        updatedAt: '2026-09-24T12:00:00.000Z',
      }],
      [ids.otherCompany, {
        companyId: ids.otherCompany,
        country: 'CA',
        currency: 'CAD',
        adapterId,
        updatedAt: '2026-09-24T12:00:00.000Z',
      }],
    ]),
    batches: new Map(),
    items: new Map(),
    events: new Map(),
    idempotency: new Map(),
    locks: [],
    createCalls: 0,
    updateCalls: 0,
    transactionCalls: 0,
    snapshot,
  };

  const repository = {
    state,
    async transaction(work) {
      state.transactionCalls += 1;
      return work(repository);
    },
    async acquireLock(scope) {
      state.locks.push(scope);
    },
    async getSettings(companyId) {
      return clone(state.settings.get(companyId) || null);
    },
    async saveSettings(input) {
      const saved = {
        companyId: input.companyId,
        country: input.country,
        currency: input.currency,
        adapterId: input.adapterId,
        updatedAt: '2026-09-24T12:00:00.000Z',
      };
      state.settings.set(input.companyId, saved);
      return clone(saved);
    },
    async isAccountingSyncConfigured() {
      return false;
    },
    async listAccounts() {
      return [];
    },
    async assertEmployee(companyId, employeeId) {
      if (companyId !== ids.company || !recipientReferences.has(employeeId)) {
        throw new PayoutError('Employee unavailable', 404, 'EMPLOYEE_NOT_FOUND');
      }
    },
    async listPayrolls(companyId) {
      if (companyId !== ids.company) return [];
      return [{
        id: snapshot.payrollId,
        periodStart: snapshot.periodStart,
        periodEnd: snapshot.periodEnd,
        status: snapshot.payrollStatus,
        payoutCountry: snapshot.payoutCountry,
        payoutCurrency: snapshot.payoutCurrency,
        payoutCalculationEngine: snapshot.payoutCalculationEngine,
        payoutCalculationVersion: snapshot.payoutCalculationVersion,
        payoutCertifiedAt: snapshot.payoutCertifiedAt,
        country: snapshot.country,
        currency: snapshot.currency,
        employeeCount: snapshot.lines.length,
        totalMinor: snapshot.lines.reduce((sum, line) => sum + line.amountMinor, 0),
      }];
    },
    async getPayrollSnapshot(input) {
      if (
        input.companyId !== ids.company
        || input.payrollId !== ids.payroll
        || input.adapterId !== adapterId
      ) return null;
      return clone(snapshot);
    },
    async listBatches(companyId, limit) {
      return [...state.batches.values()]
        .filter((batch) => batch.companyId === companyId)
        .slice(0, limit)
        .map(clone);
    },
    async getBatch(companyId, batchId) {
      return clone(state.batches.get(batchKey(companyId, batchId)) || null);
    },
    async createBatch(batch, items) {
      state.createCalls += 1;
      state.batches.set(batchKey(batch.companyId, batch.id), clone(batch));
      state.items.set(batchKey(batch.companyId, batch.id), items.map((item) => ({
        ...clone(item),
        recipientReference: recipientReferences.get(item.employeeId) || null,
      })));
      return clone(batch);
    },
    async updateBatch(companyId, batchId, patch) {
      const key = batchKey(companyId, batchId);
      const current = state.batches.get(key);
      if (!current) throw new Error('Batch not found');
      const updated = { ...current, ...clone(patch), updatedAt: '2026-09-24T12:00:00.000Z' };
      state.updateCalls += 1;
      state.batches.set(key, updated);
      return clone(updated);
    },
    async listExecutionItems(companyId, batchId) {
      return clone(state.items.get(batchKey(companyId, batchId)) || []);
    },
    async appendEvent(input) {
      const key = batchKey(input.companyId, input.batchId);
      const events = state.events.get(key) || [];
      const event = {
        id: `event-${events.length + 1}`,
        type: input.type,
        actorId: input.actorId,
        details: clone(input.details || {}),
        createdAt: '2026-09-24T12:00:00.000Z',
      };
      events.push(event);
      state.events.set(key, events);
      return clone(event);
    },
    async listEvents(companyId, batchId) {
      return clone(state.events.get(batchKey(companyId, batchId)) || []);
    },
    async getIdempotency(companyId, scope, key) {
      return clone(state.idempotency.get(idemKey(companyId, scope, key)) || null);
    },
    async saveIdempotency(input) {
      state.idempotency.set(idemKey(input.companyId, input.scope, input.key), {
        requestHash: input.requestHash,
        batchId: input.batchId,
      });
    },
  };
  return repository;
}

function createAdapter({
  configured = true,
  readyCompanies = [ids.company],
  configurationVersion = 'test-config-v1',
  limits = { maxBatchMinor: 1_000_000, maxRecipientMinor: 500_000 },
  enrollmentAllowedHosts = ['provider.example.test'],
  enrollmentUrl = 'https://provider.example.test/enroll/token',
  submit,
} = {}) {
  let ready = configured;
  let currentConfigurationVersion = configurationVersion;
  let currentLimits = { ...limits };
  const companies = new Set(readyCompanies);
  const calls = [];
  return {
    id: 'test_ca',
    supportedPairs: [{ country: 'CA', currency: 'CAD' }],
    hostedTokenizedEnrollment: true,
    enrollmentAllowedHosts,
    isConfigured: () => ready,
    isCompanyReady: (companyId) => companies.has(companyId),
    configurationVersion: () => currentConfigurationVersion,
    companyLimits: () => ({ ...currentLimits }),
    setConfigured(value) { ready = value; },
    setCompanyReady(companyId, value) {
      if (value) companies.add(companyId);
      else companies.delete(companyId);
    },
    setConfigurationVersion(value) { currentConfigurationVersion = value; },
    setLimits(value) { currentLimits = { ...value }; },
    async createEnrollmentSession() {
      return { url: enrollmentUrl, expiresAt: '2026-09-25T12:00:00.000Z' };
    },
    async submitBatch(input) {
      calls.push(clone(input));
      if (submit) return submit(input);
      return { state: 'submitted', providerReference: 'provider_batch_001' };
    },
    calls,
  };
}

function createFixture(options = {}) {
  const adapter = createAdapter(options.adapter);
  const repository = createMemoryRepository({
    adapterId: adapter.id,
    payrollMetadata: options.payrollMetadata,
  });
  const service = createPayoutOrchestrator({
    repository,
    adapters: options.adapters || [adapter],
    now: options.now || (() => new Date('2026-09-24T12:00:00.000Z')),
    enrollmentReturnUrl: 'https://app.example.test/settings/payouts',
    approvalTtlMs: options.approvalTtlMs,
  });
  return { service, repository, adapter };
}

async function createBatch(service, overrides = {}) {
  return service.createBatch({
    actor: maker,
    payrollId: ids.payroll,
    country: 'CA',
    currency: 'CAD',
    idempotencyKey: 'create-payout-batch-0001',
    ...overrides,
  });
}

async function approveBatch(service, batchId, overrides = {}) {
  return service.approveBatch({
    actor: checker,
    batchId,
    idempotencyKey: 'approve-payout-batch-0001',
    ...overrides,
  });
}

async function executeBatch(service, batchId, overrides = {}) {
  return service.executeBatch({
    actor: checker,
    batchId,
    confirmation: confirmationForBatch(batchId),
    idempotencyKey: 'execute-payout-batch-0001',
    ...overrides,
  });
}

test('payout helpers reject raw banking data and report capabilities without overstating execution', () => {
  const id = '00000000-0000-4000-8000-000000000099';
  assert.ok(new PayoutError('bad') instanceof Error);
  assert.equal(confirmationForBatch(id), `EXECUTE ${id}`);
  assert.notEqual(confirmationForBatch(id), confirmationForBatch(ids.payroll));

  for (const value of [
    { accountNumber: '12345678' },
    { nested: { routing_number: '123456789' } },
    { employees: [{ transitNumber: '12345' }] },
    { IBAN: 'GB00TEST' },
    { payout: { sort_code: '001122' } },
  ]) {
    assert.throws(() => assertNoRawBankingData(value), expectPayoutError('RAW_BANK_DATA_REJECTED', 400));
  }
  assert.doesNotThrow(() => assertNoRawBankingData({
    recipientReference: 'recipient_token_one',
    destinationToken: 'destination_token_one',
    last4: '6789',
    bankLabel: 'Primary account',
  }));

  const catalogOnly = getCountryCapability('CA', 'CAD', new Map());
  assert.equal(catalogOnly.available, true);
  assert.equal(catalogOnly.payoutExecution.available, false);
  assert.equal(catalogOnly.payoutExecution.configured, false);

  const adapter = createAdapter();
  const unscoped = getCountryCapability('CA', 'CAD', new Map([[adapter.id, adapter]]));
  assert.equal(unscoped.payoutExecution.configured, false);
  assert.match(unscoped.payoutExecution.reason, /company payout readiness/i);

  const operational = getCountryCapability(
    'CA',
    'CAD',
    new Map([[adapter.id, adapter]]),
    ids.company,
  );
  assert.equal(operational.payoutExecution.available, true);
  assert.equal(operational.payoutExecution.configured, true);
  assert.equal(operational.payoutExecution.adapterId, adapter.id);

  const unauthorizedCompany = getCountryCapability(
    'CA',
    'CAD',
    new Map([[adapter.id, adapter]]),
    ids.otherCompany,
  );
  assert.equal(unauthorizedCompany.payoutExecution.configured, false);
  assert.match(unauthorizedCompany.payoutExecution.reason, /authorized and ready/i);

  assert.throws(
    () => getCountryCapability('CH', 'CHF', new Map()),
    expectPayoutError('UNSUPPORTED_COUNTRY_CURRENCY', 422),
  );
});

test('preview is read-only and unsupported corridors fail before persistence or provider calls', async () => {
  const { service, repository, adapter } = createFixture();
  const preview = await service.previewBatch({
    actor: maker,
    payrollId: ids.payroll,
    country: 'CA',
    currency: 'CAD',
  });
  assert.equal(preview.eligible, true);
  assert.equal(preview.employeeCount, 2);
  assert.equal(preview.totalMinor, 20000);
  assert.equal(repository.state.createCalls, 0);
  assert.equal(repository.state.transactionCalls, 0);
  assert.equal(adapter.calls.length, 0);

  await assert.rejects(
    service.createBatch({
      actor: maker,
      payrollId: ids.payroll,
      country: 'CH',
      currency: 'CHF',
      idempotencyKey: 'unsupported-payout-0001',
    }),
    expectPayoutError('UNSUPPORTED_COUNTRY_CURRENCY', 422),
  );
  assert.equal(repository.state.createCalls, 0);
  assert.equal(adapter.calls.length, 0);
});

test('uncertified payroll is display-safe and cannot be previewed or persisted', async () => {
  const { service, repository, adapter } = createFixture({
    payrollMetadata: { payoutCertifiedAt: null },
  });

  const payrolls = await service.listPayrolls(maker);
  assert.equal(payrolls.length, 1);
  assert.equal(payrolls[0].eligible, false);
  assert.equal(payrolls[0].currency, 'CAD');
  assert.equal(payrolls[0].totalFormatted, 'Amount unavailable until payout certification');
  assert.match(payrolls[0].reason, /not certified/i);

  await assert.rejects(
    service.previewBatch({ actor: maker, payrollId: ids.payroll, country: 'CA', currency: 'CAD' }),
    expectPayoutError('PAYROLL_PAYOUT_NOT_CERTIFIED', 409),
  );
  await assert.rejects(
    createBatch(service),
    expectPayoutError('PAYROLL_PAYOUT_NOT_CERTIFIED', 409),
  );
  assert.equal(repository.state.createCalls, 0);
  assert.equal(adapter.calls.length, 0);
});

test('certified payroll pair is never relabeled to company settings', async () => {
  const { service, repository, adapter } = createFixture({
    payrollMetadata: {
      payoutCountry: 'US',
      payoutCurrency: 'USD',
    },
  });

  const payrolls = await service.listPayrolls(maker);
  assert.equal(payrolls[0].country, 'US');
  assert.equal(payrolls[0].currency, 'USD');
  assert.equal(payrolls[0].payoutCountry, 'US');
  assert.equal(payrolls[0].payoutCurrency, 'USD');
  assert.equal(payrolls[0].eligible, false);
  assert.match(payrolls[0].reason, /US\/USD, not CA\/CAD/);

  await assert.rejects(
    service.previewBatch({ actor: maker, payrollId: ids.payroll, country: 'CA', currency: 'CAD' }),
    expectPayoutError('PAYROLL_PAYOUT_PAIR_MISMATCH', 409),
  );
  await assert.rejects(
    createBatch(service),
    expectPayoutError('PAYROLL_PAYOUT_PAIR_MISMATCH', 409),
  );
  assert.equal(repository.state.createCalls, 0);
  assert.equal(adapter.calls.length, 0);
});

test('company-scoped adapter readiness is required before payout preparation', async () => {
  const { service, repository, adapter } = createFixture({
    adapter: { readyCompanies: [] },
  });
  const capabilities = await service.getCapabilities(maker);
  assert.equal(capabilities.executionEnabled, false);

  await assert.rejects(
    createBatch(service),
    expectPayoutError('PAYOUT_ADAPTER_COMPANY_NOT_READY', 503),
  );
  assert.equal(repository.state.createCalls, 0);
  assert.equal(adapter.calls.length, 0);
});

test('hosted enrollment rejects URLs outside the adapter hostname allowlist', async () => {
  const { service } = createFixture({
    adapter: { enrollmentUrl: 'https://attacker.example.test/enroll/token' },
  });
  await assert.rejects(
    service.createEnrollmentSession({ actor: maker, employeeId: ids.recipientOne }),
    expectPayoutError('PAYOUT_ADAPTER_INVALID_RESPONSE', 502),
  );
});

test('certified company treasury limits reject an oversized batch before persistence', async () => {
  const { service, repository, adapter } = createFixture({
    adapter: { limits: { maxBatchMinor: 19_999, maxRecipientMinor: 15_000 } },
  });
  await assert.rejects(
    createBatch(service),
    expectPayoutError('PAYOUT_BATCH_LIMIT_EXCEEDED', 422),
  );
  assert.equal(repository.state.createCalls, 0);
  assert.equal(adapter.calls.length, 0);
});

test('authorization and raw-bank validation fail before any payout data is persisted', async () => {
  const { service, repository, adapter } = createFixture();
  await assert.rejects(
    createBatch(service, { actor: employee }),
    expectPayoutError('PAYOUT_ACCESS_DENIED', 403),
  );

  const sentinel = 'RAW-ACCOUNT-SENTINEL-918273';
  let rejected;
  try {
    await createBatch(service, { metadata: { bank_account_number: sentinel } });
  } catch (error) {
    rejected = error;
  }
  assert.ok(rejected instanceof PayoutError);
  assert.equal(rejected.code, 'RAW_BANK_DATA_REJECTED');
  assert.doesNotMatch(rejected.message, new RegExp(sentinel));
  assert.equal(repository.state.createCalls, 0);
  assert.equal(repository.state.transactionCalls, 0);
  assert.equal(adapter.calls.length, 0);
  assert.doesNotMatch(JSON.stringify(repository.state), new RegExp(sentinel));
});

test('batch creation is idempotent and detects request-key reuse with another payload', async () => {
  const { service, repository } = createFixture();
  const first = await createBatch(service);
  assert.equal(first.batch.adapterConfigurationVersion, 'test-config-v1');
  assert.equal(first.batch.calculationEngine, 'futurejobs-certified-payroll');
  assert.equal(first.batch.calculationVersion, '2026.09.1');
  assert.equal(first.batch.calculationCertifiedAt, '2026-09-24T11:00:00.000Z');
  const replay = await createBatch(service);
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(replay.batch.id, first.batch.id);
  assert.equal(repository.state.createCalls, 1);
  assert.equal(repository.state.batches.size, 1);

  await assert.rejects(
    createBatch(service, { payrollId: ids.otherPayroll }),
    expectPayoutError('IDEMPOTENCY_CONFLICT', 409),
  );
  assert.equal(repository.state.createCalls, 1);
  assert.equal(repository.state.batches.size, 1);
});

test('adapter configuration is immutably bound and rechecked at approval and execution', async () => {
  const { service, repository, adapter } = createFixture();
  const created = await createBatch(service);

  adapter.setConfigurationVersion('test-config-v2');
  await assert.rejects(
    approveBatch(service, created.batch.id),
    expectPayoutError('PAYOUT_ADAPTER_CONFIGURATION_CHANGED', 409),
  );
  assert.equal((await repository.getBatch(ids.company, created.batch.id)).status, 'awaiting_approval');

  adapter.setConfigurationVersion('test-config-v1');
  await approveBatch(service, created.batch.id);
  adapter.setConfigurationVersion('test-config-v2');
  await assert.rejects(
    executeBatch(service, created.batch.id),
    expectPayoutError('PAYOUT_ADAPTER_CONFIGURATION_CHANGED', 409),
  );
  assert.equal(adapter.calls.length, 0);
  assert.equal((await repository.getBatch(ids.company, created.batch.id)).status, 'approved');
});

test('approval expires after the configured TTL and execution stays disabled', async () => {
  const { service, repository, adapter } = createFixture({ approvalTtlMs: 60 * 60 * 1000 });
  const created = await createBatch(service);
  await approveBatch(service, created.batch.id);

  const key = batchKey(ids.company, created.batch.id);
  repository.state.batches.get(key).approvedAt = '2026-09-24T10:59:59.000Z';
  const detail = await service.getBatch({ actor: checker, batchId: created.batch.id });
  assert.equal(detail.batch.actions.canExecute, false);

  await assert.rejects(
    executeBatch(service, created.batch.id),
    expectPayoutError('PAYOUT_APPROVAL_EXPIRED', 409),
  );
  assert.equal(adapter.calls.length, 0);
  assert.equal((await repository.getBatch(ids.company, created.batch.id)).status, 'approved');
});

test('maker-checker approval, role checks, tenancy, and confirmation gate execution', async () => {
  const { service, repository, adapter } = createFixture();
  const created = await createBatch(service);
  const batchId = created.batch.id;

  await assert.rejects(
    executeBatch(service, batchId),
    expectPayoutError('PAYOUT_APPROVAL_REQUIRED', 409),
  );
  await assert.rejects(
    approveBatch(service, batchId, { actor: maker }),
    expectPayoutError('PAYOUT_SEPARATION_OF_DUTIES', 403),
  );
  await assert.rejects(
    approveBatch(service, batchId, { actor: employee }),
    expectPayoutError('PAYOUT_ACCESS_DENIED', 403),
  );
  await assert.rejects(
    service.getBatch({ actor: outsider, batchId }),
    expectPayoutError('PAYOUT_BATCH_NOT_FOUND', 404),
  );
  assert.equal(adapter.calls.length, 0);

  const approved = await approveBatch(service, batchId);
  assert.equal(approved.batch.status, 'approved');
  assert.equal(approved.batch.approvedBy, checker.id);

  await assert.rejects(
    executeBatch(service, batchId, { confirmation: confirmationForBatch(ids.payroll) }),
    expectPayoutError('PAYOUT_CONFIRMATION_REQUIRED', 400),
  );
  assert.equal(adapter.calls.length, 0);
  assert.equal((await repository.getBatch(ids.company, batchId)).status, 'approved');
});

test('execution fails closed if the selected adapter becomes unavailable', async () => {
  const { service, repository, adapter } = createFixture();
  const created = await createBatch(service);
  await approveBatch(service, created.batch.id);
  adapter.setConfigured(false);

  await assert.rejects(
    executeBatch(service, created.batch.id),
    expectPayoutError('PAYOUT_ADAPTER_NOT_CONFIGURED', 503),
  );
  assert.equal(adapter.calls.length, 0);
  const stored = await repository.getBatch(ids.company, created.batch.id);
  assert.equal(stored.status, 'approved');
  assert.equal(stored.providerReference, null);
});

test('execution rechecks company treasury limits before calling the provider', async () => {
  const { service, repository, adapter } = createFixture();
  const created = await createBatch(service);
  await approveBatch(service, created.batch.id);
  adapter.setLimits({ maxBatchMinor: 19_999, maxRecipientMinor: 15_000 });

  await assert.rejects(
    executeBatch(service, created.batch.id),
    expectPayoutError('PAYOUT_BATCH_LIMIT_EXCEEDED', 422),
  );
  assert.equal(adapter.calls.length, 0);
  assert.equal((await repository.getBatch(ids.company, created.batch.id)).status, 'approved');
});

test('execution rejects a payout-item snapshot that no longer matches the immutable batch total', async () => {
  const { service, repository, adapter } = createFixture();
  const created = await createBatch(service);
  await approveBatch(service, created.batch.id);

  const key = batchKey(ids.company, created.batch.id);
  const items = repository.state.items.get(key);
  items[0].amountMinor += 1;
  items[0].currency = 'USD';

  await assert.rejects(
    executeBatch(service, created.batch.id),
    expectPayoutError('PAYOUT_SNAPSHOT_MISMATCH', 409),
  );
  assert.equal(adapter.calls.length, 0);
  const stored = await repository.getBatch(ids.company, created.batch.id);
  assert.equal(stored.status, 'approved');
  assert.equal(stored.providerReference, null);
});

test('provider uncertainty never claims success or persists a provider reference', async () => {
  const { service, repository, adapter } = createFixture({
    adapter: { submit: async () => { throw Object.assign(new Error('network timeout'), { code: 'ETIMEDOUT' }); } },
  });
  const created = await createBatch(service);
  await approveBatch(service, created.batch.id);

  await assert.rejects(
    executeBatch(service, created.batch.id),
    expectPayoutError('PAYOUT_SUBMISSION_UNCONFIRMED', 502),
  );
  assert.equal(adapter.calls.length, 1);
  const stored = await repository.getBatch(ids.company, created.batch.id);
  assert.equal(stored.status, 'submitting');
  assert.equal(stored.providerReference, null);
  const events = await repository.listEvents(ids.company, created.batch.id);
  assert.ok(events.some((event) => event.type === 'submission_outcome_unknown'));
});

test('approved execution sends tokenized references once and safely replays the result', async () => {
  const { service, repository, adapter } = createFixture();
  const created = await createBatch(service);
  await approveBatch(service, created.batch.id);

  const first = await executeBatch(service, created.batch.id);
  const replay = await executeBatch(service, created.batch.id);
  assert.equal(first.replayed, false);
  assert.equal(first.batch.status, 'submitted');
  assert.equal(first.batch.providerReference, 'provider_batch_001');
  assert.equal(replay.replayed, true);
  assert.equal(replay.batch.id, first.batch.id);
  assert.equal(adapter.calls.length, 1);

  const submission = adapter.calls[0];
  assert.equal(submission.idempotencyKey, `payout-batch:${created.batch.id}`);
  assert.equal(submission.adapterConfigurationVersion, 'test-config-v1');
  assert.equal(submission.totalMinor, 20000);
  assert.equal(submission.recipients.length, 2);
  assert.ok(submission.recipients.every((recipient) => Number.isSafeInteger(recipient.amountMinor)));
  assert.deepEqual(
    submission.recipients.map((recipient) => recipient.recipientReference),
    ['recipient_token_one', 'recipient_token_two'],
  );
  assert.doesNotThrow(() => assertNoRawBankingData(submission));
  assert.equal(JSON.stringify(submission).includes('accountNumber'), false);
  assert.equal(JSON.stringify(submission).includes('routingNumber'), false);

  const stored = await repository.getBatch(ids.company, created.batch.id);
  assert.equal(stored.status, 'submitted');
  assert.equal(stored.providerReference, 'provider_batch_001');
});
