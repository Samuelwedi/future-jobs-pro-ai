const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function launch(t, options = {}) {
  const child = fork(path.join(__dirname, 'fixtures/shutdown-server.cjs'), [], {
    cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: { NODE_ENV: 'test', PORT: '0', HOST: '127.0.0.1', JWT_SECRET: 'shutdown-isolated-test',
      DATABASE_URL: 'postgres://unused@127.0.0.1:1/unused', REDIS_URL: 'redis://unused:1',
      LUCY_BACKGROUND_WORK_ENABLED: 'true', LUCY_RECORD_SEARCH_ENABLED: 'false', LUCY_WORK_BRIEFING_ENABLED: 'false',
      SHUTDOWN_TIMEOUT_MS: '3000', ...options },
  });
  const events = []; let output = '';
  child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
  child.on('message', event => events.push(event));
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); await exited; });
  async function wait(name) {
    for (let attempts = 0; attempts < 600; attempts++) {
      const found = events.find(item => item.event === name);
      if (found) return found;
      if (child.exitCode !== null || child.signalCode !== null) assert.fail(`Process ended before ${name}: ${output}`);
      await sleep(5);
    }
    assert.fail(`Timed out waiting for ${name}: ${output}`);
  }
  return { child, events, wait, exited, output: () => output };
}
const indexOf = (events, name) => events.findIndex(event => event.event === name);

for (const signal of ['SIGTERM', 'SIGINT']) test(`production entry drains Lucy and HTTP on ${signal}, then Redis and database`, { timeout: 10000 }, async t => {
  const run = launch(t);
  const { port } = await run.wait('listening'); await run.wait('provider-pending');
  for (const route of ['/ping', '/health', '/api/health']) {
    const response = await fetch(`http://127.0.0.1:${port}${route}`);
    assert.equal(response.status, 200); await response.arrayBuffer();
  }
  const pendingRequest = fetch(`http://127.0.0.1:${port}/api/lucy-v2/test-drain`).then(async response => ({ status: response.status, body: await response.json() }));
  await run.wait('request-pending'); run.child.kill(signal); await run.wait('stopping');
  run.child.kill(signal === 'SIGTERM' ? 'SIGINT' : 'SIGTERM');
  await sleep(30);
  assert.equal(indexOf(run.events, 'database-close'), -1);
  await assert.rejects(fetch(`http://127.0.0.1:${port}/health`));
  run.child.send('release-provider'); await run.wait('provider-returned');
  assert.equal(indexOf(run.events, 'database-close'), -1);
  run.child.send('release-request'); assert.equal((await pendingRequest).status, 200);
  assert.deepEqual(await run.exited, { code: 0, signal: null }, run.output());
  assert.equal(indexOf(run.events, 'work-published'), -1); assert.equal(indexOf(run.events, 'query-after-close'), -1);
  assert.ok(indexOf(run.events, 'redis-close') > indexOf(run.events, 'request-query'));
  assert.ok(indexOf(run.events, 'database-close') > indexOf(run.events, 'redis-close'));
  assert.equal(run.events.filter(event => event.event === 'database-close').length, 1);
  assert.equal(run.events.filter(event => event.event === 'stopping').length, 1);
});

test('actual process exits 1 within the deadline for an unresponsive Lucy provider', { timeout: 10000 }, async t => {
  const run = launch(t, { SHUTDOWN_TIMEOUT_MS: '150' });
  await run.wait('listening'); await run.wait('provider-pending');
  const started = Date.now(); run.child.kill('SIGTERM');
  assert.deepEqual(await run.exited, { code: 1, signal: null }, run.output());
  assert.ok(Date.now() - started < 2000); assert.ok(indexOf(run.events, 'forced') >= 0);
  assert.equal(indexOf(run.events, 'database-close'), -1); assert.equal(indexOf(run.events, 'redis-close'), -1);
  assert.equal(indexOf(run.events, 'work-published'), -1);
});

test('actual process also bounds a stuck database close', { timeout: 10000 }, async t => {
  const run = launch(t, { SHUTDOWN_TIMEOUT_MS: '150', TEST_HANG_DB: 'true' });
  await run.wait('listening'); await run.wait('provider-pending');
  run.child.kill('SIGINT'); await run.wait('stopping'); run.child.send('release-provider');
  assert.deepEqual(await run.exited, { code: 1, signal: null }, run.output());
  assert.ok(indexOf(run.events, 'database-close') >= 0); assert.ok(indexOf(run.events, 'forced') >= 0);
});

test('shutdown during Redis initialization destroys the reconnecting client without holding startup health', { timeout: 10000 }, async t => {
  const run = launch(t, { TEST_REDIS_CONNECTING: 'true' });
  const { port } = await run.wait('listening'); await run.wait('redis-pending'); await run.wait('provider-pending');
  const health = await fetch(`http://127.0.0.1:${port}/health`); assert.equal(health.status, 200); await health.arrayBuffer();
  run.child.kill('SIGTERM'); await run.wait('stopping'); run.child.send('release-provider');
  assert.deepEqual(await run.exited, { code: 0, signal: null }, run.output());
  assert.ok(indexOf(run.events, 'redis-destroy') >= 0);
  assert.ok(indexOf(run.events, 'database-close') > indexOf(run.events, 'redis-destroy'));
});

test('signal during awaited final authorization cannot publish Lucy results', { timeout: 10000 }, async t => {
  const run = launch(t, { TEST_ACCESS_RACE: 'true' });
  await run.wait('provider-pending'); run.child.send('release-provider'); await run.wait('access-pending');
  run.child.kill('SIGTERM'); await run.wait('stopping'); run.child.send('release-access');
  assert.deepEqual(await run.exited, { code: 0, signal: null }, run.output());
  assert.equal(indexOf(run.events, 'work-published'), -1); assert.equal(indexOf(run.events, 'work-failed'), -1);
});

test('in-flight Socket.IO database work drains even after its socket disconnects', { timeout: 10000 }, async t => {
  const run = launch(t);
  const { port } = await run.wait('listening'); await run.wait('provider-pending');
  const ws = new WebSocket(`ws://127.0.0.1:${port}/socket.io/?EIO=4&transport=websocket`);
  t.after(() => ws.close());
  const connected = new Promise((resolve, reject) => {
    ws.onerror = reject;
    ws.onmessage = message => {
      const payload = String(message.data);
      if (payload.startsWith('0')) ws.send('40' + JSON.stringify({ token: jwt.sign({ id: 'user' }, 'shutdown-isolated-test') }));
      if (payload.startsWith('40')) resolve();
    };
  });
  await connected;
  ws.send('42' + JSON.stringify(['chat-message', { roomId: 'room', message: 'Hello' }]));
  await run.wait('socket-pending'); run.child.kill('SIGTERM'); await run.wait('stopping');
  run.child.send('release-provider'); await run.wait('provider-returned'); await sleep(30);
  assert.equal(indexOf(run.events, 'database-close'), -1);
  run.child.send('release-socket');
  assert.deepEqual(await run.exited, { code: 0, signal: null }, run.output());
  assert.ok(indexOf(run.events, 'database-close') > indexOf(run.events, 'socket-query'));
  assert.equal(indexOf(run.events, 'query-after-close'), -1);
});

test('client disconnect during drain cannot close the database under its unfinished HTTP handler', { timeout: 10000 }, async t => {
  const run = launch(t, { SHUTDOWN_TIMEOUT_MS: '200' });
  const { port } = await run.wait('listening'); await run.wait('provider-pending');
  const abort = new AbortController();
  const request = fetch(`http://127.0.0.1:${port}/api/lucy-v2/test-drain`, { signal: abort.signal }).catch(() => undefined);
  await run.wait('request-pending'); run.child.kill('SIGTERM'); await run.wait('stopping');
  abort.abort(); await request; run.child.send('release-provider');
  assert.deepEqual(await run.exited, { code: 1, signal: null }, run.output());
  assert.equal(indexOf(run.events, 'database-close'), -1); assert.ok(indexOf(run.events, 'forced') >= 0);
});

test('client disconnect before SIGTERM keeps unconfirmed HTTP work fenced until forced exit', { timeout: 10000 }, async t => {
  const run = launch(t, { SHUTDOWN_TIMEOUT_MS: '200' });
  const { port } = await run.wait('listening'); await run.wait('provider-pending');
  const abort = new AbortController();
  const request = fetch(`http://127.0.0.1:${port}/api/lucy-v2/test-drain`, { signal: abort.signal }).catch(() => undefined);
  await run.wait('request-pending'); abort.abort(); await request; await run.wait('request-aborted');
  run.child.send('release-provider'); await run.wait('provider-returned');
  run.child.kill('SIGTERM'); await run.wait('stopping');
  assert.deepEqual(await run.exited, { code: 1, signal: null }, run.output());
  assert.equal(indexOf(run.events, 'database-close'), -1); assert.equal(indexOf(run.events, 'redis-close'), -1);
  assert.equal(indexOf(run.events, 'query-after-close'), -1); assert.ok(indexOf(run.events, 'forced') >= 0);
});
