const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createGracefulShutdown, shutdownTimeoutMs } = require('../dist/utils/gracefulShutdown');
const { createPeriodicWorker } = require('../dist/utils/periodicWorker');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise(r => setImmediate(r));

test('shutdown stops all producers immediately, drains before ordered cleanup, and deduplicates signals', async () => {
  const worker = deferred(), http = deferred(), events = [], exits = [];
  const shutdown = createGracefulShutdown({
    drains: [
      { name: 'worker', run: () => { events.push('worker:stop'); return worker.promise; } },
      { name: 'HTTP', run: () => { events.push('http:stop'); return http.promise; } },
    ],
    resources: ['redis', 'database'].map(name => ({ name, run: () => { events.push(name); } })),
    forceClose: () => events.push('forced'), exit: code => exits.push(code), log: () => {},
  });
  assert.equal(shutdown.isStopping(), false);
  const pending = shutdown.shutdown('SIGTERM');
  assert.equal(shutdown.isStopping(), true);
  assert.equal(shutdown.shutdown('SIGINT'), pending);
  assert.deepEqual(events, ['worker:stop', 'http:stop']);
  worker.resolve(); await tick();
  assert.deepEqual(exits, []); assert.equal(events.length, 2);
  http.resolve(); await pending;
  assert.deepEqual(events, ['worker:stop', 'http:stop', 'redis', 'database']);
  assert.deepEqual(exits, [0]);
  await shutdown.shutdown('SIGTERM'); assert.deepEqual(exits, [0]);
});

test('deadline exits unsuccessfully without closing a database beneath unfinished work', async () => {
  const worker = deferred(), exited = deferred(), events = [];
  const shutdown = createGracefulShutdown({
    drains: [{ name: 'worker', run: () => worker.promise }],
    resources: [{ name: 'database', run: () => events.push('database') }],
    timeoutMs: 20, forceClose: () => events.push('forced'), exit: code => exited.resolve(code), log: () => {},
  });
  const pending = shutdown.shutdown('SIGTERM');
  assert.equal(await exited.promise, 1);
  worker.resolve(); await pending;
  assert.deepEqual(events, ['forced']);
});

test('the same deadline bounds hung resource cleanup', async () => {
  const redis = deferred(), exited = deferred(), events = [];
  const shutdown = createGracefulShutdown({ drains: [],
    resources: [ { name: 'redis', run: () => redis.promise }, { name: 'database', run: () => events.push('database') } ],
    timeoutMs: 20, forceClose: () => events.push('forced'), exit: code => exited.resolve(code), log: () => {},
  });
  const pending = shutdown.shutdown('SIGINT');
  assert.equal(await exited.promise, 1);
  redis.resolve(); await pending;
  assert.deepEqual(events, ['forced']);
});

test('a failed drain still stops other producers and does not claim clean shutdown', async () => {
  const events = [], exits = [];
  const shutdown = createGracefulShutdown({
    drains: [ { name: 'bad', run: () => { throw Error('private detail'); } }, { name: 'other', run: () => events.push('stopped') } ],
    resources: [{ name: 'database', run: () => events.push('database') }],
    forceClose: () => events.push('forced'), exit: code => exits.push(code), log: line => events.push(line),
  });
  await shutdown.shutdown('SIGTERM');
  assert.ok(events.includes('stopped')); assert.ok(events.includes('forced'));
  assert.ok(!events.includes('database')); assert.doesNotMatch(events.join(' '), /private detail/);
  assert.deepEqual(exits, [1]);
});

test('shutdown configuration uses a bounded default and rejects invalid values', () => {
  for (const value of ['', '0', '-1', 'Infinity', 'NaN', '121000', '20ms']) assert.equal(shutdownTimeoutMs(value), 25000);
  assert.equal(shutdownTimeoutMs('100'), 100); assert.equal(shutdownTimeoutMs('120000'), 120000);
});

test('periodic work has one slot and stop waits for an active run without restarting it', async () => {
  const run = deferred(); let calls = 0, errors = 0;
  const worker = createPeriodicWorker(async () => { calls++; await run.promise; }, () => { errors++; });
  worker.start(5); worker.start(5); await tick();
  assert.equal(calls, 1);
  const stop = worker.stop(); assert.equal(worker.stop(), stop);
  worker.start(5); await new Promise(r => setTimeout(r, 15)); assert.equal(calls, 1);
  run.resolve(); await stop;
  await new Promise(r => setTimeout(r, 15)); assert.equal(calls, 1); assert.equal(errors, 0);
});

test('stop before a scheduled microtask prevents that periodic run', async () => {
  let calls = 0;
  const worker = createPeriodicWorker(async () => { calls++; }, () => {});
  worker.start(5); await worker.stop(); assert.equal(calls, 0);
});

test('periodic work rejects invalid delays without changing valid configured cadence', async () => {
  const originalInterval = global.setInterval, originalClear = global.clearInterval;
  const delays = [];
  global.setInterval = (_run, delay) => { delays.push(delay); return { unref() {} }; };
  global.clearInterval = () => {};
  try {
    for (const delay of [NaN, Infinity, -1, 0, 0.5, 2147483648, 15000, 75000, 2147483647]) {
      const worker = createPeriodicWorker(async () => {}, () => {});
      worker.start(delay); await worker.stop();
    }
    assert.deepEqual(delays, [60000, 60000, 60000, 60000, 60000, 60000, 15000, 75000, 2147483647]);
  } finally { global.setInterval = originalInterval; global.clearInterval = originalClear; }
});
