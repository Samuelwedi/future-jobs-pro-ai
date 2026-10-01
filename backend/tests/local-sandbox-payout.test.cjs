const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const modulePath = require.resolve('../dist/services/localSandboxPayoutAdapter.js');
const {
  LOCAL_SANDBOX_ADAPTER_ID,
  localSandboxPayoutAdapter: adapter,
} = require(modulePath);

const COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_COMPANY_ID = '22222222-2222-4222-8222-222222222222';

const TRACKED_VARIABLES = [
  'PAYOUT_LOCAL_SANDBOX',
  'PAYOUT_LOCAL_SANDBOX_COMPANY_IDS',
  'FUTUREJOBS_RUNTIME',
  'NODE_ENV',
  'HOST',
  'APP_HOST',
  'SERVER_HOST',
  'DATABASE_URL',
  'DB_HOST',
  'REDIS_URL',
  'REDIS_HOST',
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
];

const LOCAL_ENVIRONMENT = {
  PAYOUT_LOCAL_SANDBOX: 'LOCAL_ONLY_NO_MONEY',
  PAYOUT_LOCAL_SANDBOX_COMPANY_IDS: COMPANY_ID,
  FUTUREJOBS_RUNTIME: 'local',
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  DATABASE_URL: 'postgresql://sandbox:sandbox@127.0.0.1:1/unreachable',
  DB_HOST: '127.0.0.1',
  REDIS_URL: 'redis://127.0.0.1:56380',
  REDIS_HOST: '127.0.0.1',
};

async function withEnvironment(values, work) {
  const previous = new Map(
    TRACKED_VARIABLES.map((name) => [name, process.env[name]]),
  );

  for (const name of TRACKED_VARIABLES) delete process.env[name];
  for (const [name, value] of Object.entries(values)) {
    process.env[name] = String(value);
  }

  try {
    return await work();
  } finally {
    for (const name of TRACKED_VARIABLES) {
      const value = previous.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

function validSubmission() {
  const version = adapter.configurationVersion(COMPANY_ID);
  return {
    batchId: '33333333-3333-4333-8333-333333333333',
    companyId: COMPANY_ID,
    country: 'CA',
    currency: 'CAD',
    adapterConfigurationVersion: version,
    totalMinor: 10000,
    idempotencyKey: 'payout-batch:33333333-3333-4333-8333-333333333333',
    recipients: [
      {
        employeeId: '44444444-4444-4444-8444-444444444444',
        amountMinor: 2500,
        currency: 'CAD',
        recipientReference: 'sandbox:recipient_alpha_0001',
      },
      {
        employeeId: '55555555-5555-4555-8555-555555555555',
        amountMinor: 7500,
        currency: 'CAD',
        recipientReference: 'sandbox:recipient_beta_00002',
      },
    ],
  };
}

test('local payout sandbox is disabled by default', async () => {
  await withEnvironment({}, async () => {
    assert.equal(adapter.isConfigured(), false);
    assert.equal(adapter.isCompanyReady(COMPANY_ID), false);
    assert.equal(LOCAL_SANDBOX_ADAPTER_ID, 'local_sandbox_no_money');
    assert.equal(adapter.hostedTokenizedEnrollment, false);
  });
});

test('local payout sandbox rejects production and cloud environments', async () => {
  await withEnvironment({ ...LOCAL_ENVIRONMENT, NODE_ENV: 'production' }, async () => {
    assert.equal(adapter.isConfigured(), false);
    assert.equal(adapter.isCompanyReady(COMPANY_ID), false);
  });

  await withEnvironment({
    ...LOCAL_ENVIRONMENT,
    RAILWAY_PROJECT_ID: 'must-never-run-here',
  }, async () => {
    assert.equal(adapter.isConfigured(), false);
    assert.equal(adapter.isCompanyReady(COMPANY_ID), false);
  });
});

test('local payout sandbox rejects non-loopback infrastructure', async () => {
  await withEnvironment({
    ...LOCAL_ENVIRONMENT,
    DATABASE_URL: 'postgresql://sandbox:sandbox@database.example.com:5432/app',
  }, async () => assert.equal(adapter.isConfigured(), false));

  await withEnvironment({
    ...LOCAL_ENVIRONMENT,
    REDIS_URL: 'redis://cache.example.com:6379',
  }, async () => assert.equal(adapter.isConfigured(), false));

  await withEnvironment({
    ...LOCAL_ENVIRONMENT,
    HOST: '0.0.0.0',
  }, async () => assert.equal(adapter.isConfigured(), false));
});

test('local payout sandbox requires an explicit company allowlist', async () => {
  await withEnvironment(LOCAL_ENVIRONMENT, async () => {
    assert.equal(adapter.isConfigured(), true);
    assert.equal(adapter.isCompanyReady(COMPANY_ID), true);
    assert.equal(adapter.isCompanyReady(OTHER_COMPANY_ID), false);

    const firstVersion = adapter.configurationVersion(COMPANY_ID);
    const secondVersion = adapter.configurationVersion(COMPANY_ID);
    assert.equal(firstVersion, secondVersion);
    assert.match(firstVersion, /^local-sandbox-v1-[a-f0-9]{32}$/);
    assert.deepEqual(adapter.companyLimits(COMPANY_ID, 'CAD'), {
      maxBatchMinor: 10000000,
      maxRecipientMinor: 1000000,
    });
  });
});

test('local payout submission is deterministic and never claims settlement', async () => {
  await withEnvironment(LOCAL_ENVIRONMENT, async () => {
    let networkCalls = 0;
    const originalFetch = global.fetch;
    global.fetch = async () => {
      networkCalls += 1;
      throw new Error('Network access is forbidden in sandbox tests');
    };

    try {
      const input = validSubmission();
      const first = await adapter.submitBatch(input);
      const replay = await adapter.submitBatch(input);
      assert.deepEqual(first, replay);
      assert.equal(first.state, 'submitted');
      assert.notEqual(first.state, 'settled');
      assert.match(first.providerReference, /^sandbox_sim_[a-f0-9]{40}$/);
      assert.equal(networkCalls, 0);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

test('local payout submission rejects altered or unsafe requests', async () => {
  await withEnvironment(LOCAL_ENVIRONMENT, async () => {
    const input = validSubmission();

    await assert.rejects(
      async () => adapter.submitBatch({
        ...input,
        adapterConfigurationVersion: 'changed',
      }),
      /configuration changed/i,
    );

    await assert.rejects(
      async () => adapter.submitBatch({
        ...input,
        totalMinor: input.totalMinor + 1,
      }),
      /totals do not match/i,
    );

    await assert.rejects(
      async () => adapter.submitBatch({
        ...input,
        recipients: input.recipients.map((recipient, index) => ({
          ...recipient,
          recipientReference: index === 0
            ? '1234567890123456'
            : recipient.recipientReference,
        })),
      }),
      /recipient token/i,
    );

    await assert.rejects(
      async () => adapter.submitBatch({
        ...input,
        idempotencyKey: 'different-key',
      }),
      /idempotency identity/i,
    );
  });
});

test('sandbox configuration is boot-bound and source contains no network client', async () => {
  const childEnvironment = { ...process.env, ...LOCAL_ENVIRONMENT };
  for (const marker of [
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
  ]) delete childEnvironment[marker];

  const probe = [
    `const adapter = require(${JSON.stringify(modulePath)})`,
    '.localSandboxPayoutAdapter;',
    'process.stdout.write(adapter.configurationVersion(',
    `${JSON.stringify(COMPANY_ID)}));`,
  ].join('');

  const first = spawnSync(process.execPath, ['-e', probe], {
    env: childEnvironment,
    encoding: 'utf8',
  });
  const second = spawnSync(process.execPath, ['-e', probe], {
    env: childEnvironment,
    encoding: 'utf8',
  });

  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.notEqual(first.stdout, second.stdout);

  const source = fs.readFileSync(
    path.join(__dirname, '../src/services/localSandboxPayoutAdapter.ts'),
    'utf8',
  );
  assert.doesNotMatch(
    source,
    /from\s+['"](?:node:)?(?:http|https|net|tls|undici)['"]/i,
  );
  assert.doesNotMatch(source, /\bfetch\s*\(/);

  const routes = fs.readFileSync(
    path.join(__dirname, '../src/routes/payoutRoutes.ts'),
    'utf8',
  );
  const registration = routes.indexOf('registerLocalSandboxPayoutAdapter();');
  const orchestrator = routes.indexOf(
    'const defaultOrchestrator = createPayoutOrchestrator({',
  );
  assert.equal(registration, -1, 'Manual-payroll release must not register a payout adapter');
  assert.ok(orchestrator >= 0);
});