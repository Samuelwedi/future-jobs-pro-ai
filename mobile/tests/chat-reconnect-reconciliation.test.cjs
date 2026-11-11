const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture, message, settle } = require('./helpers/chat-lifecycle.cjs');

test('a successful reconnect fetches missed history without reopening the conversation', async () => {
  const f = fixture(); await f.start(); await f.join(); await f.resolveReads([message('before')]);
  const before = f.reads.length;
  f.fire('disconnect'); f.fire('connect'); f.joins.at(-1)({ success: true }); await settle();
  assert.equal(f.reads.length, before + 1, 'rejoin must request existing room history again');
  f.reads.at(-1).resolve({ messages: [message('before'), message('missed')] }); await settle();
  assert.deepEqual(Array.from(f.c.messages, row => row.id), ['before', 'missed']);
  assert.equal(f.maxInFlight, 1);
  f.cleanup();
});

test('initial HTTP history still loads when the socket has not connected', async () => {
  const f = fixture(); await f.start(); assert.equal(f.reads.length, 1);
  f.reads[0].resolve({ messages: [message('http')] }); await settle();
  assert.equal(f.c.messages[0].id, 'http'); assert.equal(f.c.connected, false); f.cleanup();
});

test('initial HTTP fallback survives a connection error before its response resolves', async () => {
  const f = fixture(); await f.start(); f.fire('connect_error', Error('socket unavailable'));
  f.reads[0].resolve({ messages: [message('http-fallback')] }); await settle();
  assert.deepEqual(Array.from(f.c.messages, row => row.id), ['http-fallback']);
  assert.equal(f.c.connected, false); assert.match(f.c.error, /connection failed/);
  assert.equal(f.reads.length, 1); f.cleanup();
});

test('initial HTTP fallback survives a rejected socket join before its response resolves', async () => {
  const f = fixture(); await f.start(); f.fire('connect'); f.joins.at(-1)({ success: false });
  f.reads[0].resolve({ messages: [message('http-fallback')] }); await settle();
  assert.deepEqual(Array.from(f.c.messages, row => row.id), ['http-fallback']);
  assert.equal(f.c.connected, false); assert.match(f.c.error, /Could not join/);
  assert.equal(f.reads.length, 1); f.cleanup();
});

test('first room join catches the gap after initial HTTP history', async () => {
  const f = fixture(); await f.start(); await f.resolveReads([message('old')]);
  await f.join(); assert.equal(f.reads.length, 2);
  f.reads[1].resolve({ messages: [message('old'), message('gap')] }); await settle();
  assert.deepEqual(Array.from(f.c.messages, row => row.id), ['gap', 'old']); f.cleanup();
});

test('pending initial history and many reconnects coalesce to one latest-generation follow-up', async () => {
  const f = fixture(); await f.start(); await f.join();
  for (let i = 0; i < 12; i++) { f.fire('disconnect'); await f.join(); }
  assert.equal(f.reads.length, 1); assert.equal(f.maxInFlight, 1);
  f.reads[0].resolve({ messages: [message('http-fallback')] }); await settle();
  assert.deepEqual(Array.from(f.c.messages, row => row.id), ['http-fallback']); assert.equal(f.reads.length, 2);
  f.reads[1].resolve({ messages: [message('latest')] }); await settle();
  assert.deepEqual(Array.from(f.c.messages, row => row.id), ['http-fallback', 'latest']);
  assert.equal(f.maxInFlight, 1); assert.equal(f.reads.length, 2); f.cleanup();
});

test('duplicate connect events and duplicate join acknowledgements do not queue extra fetches', async () => {
  const f = fixture(); await f.start(); await f.resolveReads(); await f.join();
  const count = f.reads.length, joins = f.joins.length;
  for (let i = 0; i < 12; i++) { f.fire('connect'); f.joins.at(-1)({ success: true }); }
  assert.equal(f.joins.length, joins); assert.equal(f.reads.length, count);
  f.joins.at(-1)({ success: false }); assert.equal(f.c.error, '');
  await f.resolveReads(); assert.equal(f.reads.length, count); f.cleanup();
});

test('rejected or malformed join acknowledgements do not authorize history reconciliation', async () => {
  for (const result of [undefined, {}, { success: false }, { success: 'true' }]) {
    const f = fixture(); await f.start(); await f.resolveReads();
    f.fire('connect'); const count = f.reads.length; f.joins.at(-1)(result);
    f.joins.at(-1)({ success: true }); await settle();
    assert.equal(f.reads.length, count); assert.equal(f.c.connected, false);
    assert.match(f.c.error, /Could not join/); f.cleanup();
  }
});

test('old join acknowledgements cannot connect, error, or fetch after a later connection', async () => {
  for (const success of [false, true]) {
    const f = fixture(); await f.start(); await f.resolveReads(); f.fire('connect'); const old = f.joins.at(-1);
    f.fire('disconnect'); f.fire('connect'); const before = f.events.length, reads = f.reads.length;
    old({ success }); await settle(); assert.equal(f.events.length, before); assert.equal(f.reads.length, reads);
    f.joins.at(-1)({ success: true }); await settle(); assert.equal(f.reads.length, reads + 1); f.cleanup();
  }
});

test('socket and HTTP messages received during reconciliation survive deduped, ordered history', async () => {
  const f = fixture(); await f.start(); await f.resolveReads(); await f.join();
  f.fire('new-message', message('socket', { message: 'newer socket copy', created_at: '2026-11-11T12:02:00Z' }));
  f.c.setMessages(previous => f.c.mergeMessages(previous, [message('http', { created_at: '2026-11-11T12:01:00Z' })]));
  f.reads.at(-1).resolve({ messages: [message('socket', { message: 'older snapshot' }), message('older'), message('older')] });
  await settle(); assert.deepEqual(Array.from(f.c.messages, row => row.id), ['older', 'http', 'socket']);
  assert.equal(f.c.messages.at(-1).message, 'newer socket copy'); f.cleanup();
});

test('disconnect fences late history success and failure and cancels queued reconciliation', async () => {
  for (const fail of [false, true]) {
    const f = fixture(); await f.start(); await f.resolveReads(); await f.join();
    const pending = f.reads.at(-1); f.fire('disconnect'); await f.join(); f.fire('disconnect');
    const before = f.events.length;
    fail ? pending.reject(Error('late failure')) : pending.resolve({ messages: [message('stale')] });
    await settle(); assert.deepEqual(f.events.slice(before).map(event => event[0]), ['history']);
    assert.equal(f.c.history.busy, false); assert.equal(f.reads.length, 2); f.cleanup();
  }
});

test('reconnect fences late history success and failure from the previous connection', async () => {
  for (const fail of [false, true]) {
    const f = fixture(); await f.start(); await f.resolveReads(); await f.join(); const old = f.reads.at(-1);
    f.fire('disconnect'); await f.join(); const before = f.events.length;
    fail ? old.reject(Error('late failure')) : old.resolve({ messages: [message('stale')] });
    await settle(); assert.equal(f.events.length, before); assert.equal(f.c.messages.length, 0);
    assert.equal(f.reads.length, 3); assert.equal(f.maxInFlight, 1); f.cleanup();
  }
});

test('focus, owner, session, and unmount changes fence queued reads and retained callbacks', async () => {
  for (const change of ['scope', 'auth', 'sessionCurrent', 'unmount']) for (const fail of [false, true]) {
    const f = fixture(); await f.start(); await f.join();
    const retained = Object.fromEntries(f.listeners), ack = f.joins.at(-1);
    if (change === 'unmount') f.cleanup(); else f.c[change] = false;
    const before = f.events.length;
    ack({ success: true }); retained['new-message'](message('stale')); retained.disconnect(); retained.connect_error(Error('stale'));
    fail ? f.reads[0].reject(Error('late')) : f.reads[0].resolve({ messages: [message('stale')] });
    f.room.resolve({ room: { avatar_url: 'stale.jpg' } }); await settle();
    assert.equal(f.events.length, before); assert.equal(f.reads.length, 1);
    if (change !== 'unmount') f.cleanup();
  }
});

test('current invalid or cross-scope history is rejected without replacing existing messages', async () => {
  for (const messages of [null, [message('foreign', { company_id: 'other' })], [message('foreign', { room_id: 'other' })], [{}]]) {
    const f = fixture(); await f.start(); await f.resolveReads([message('kept')]); await f.join();
    f.reads.at(-1).resolve({ messages }); await settle();
    assert.deepEqual(Array.from(f.c.messages, row => row.id), ['kept']); assert.match(f.c.error, /could not be loaded/); f.cleanup();
  }
});

test('current history failures do not loop and the next successful join can recover', async () => {
  const f = fixture(); await f.start(); await f.resolveReads([message('kept')]); await f.join();
  f.reads.at(-1).reject(Error('offline')); await settle(); const count = f.reads.length;
  assert.match(f.c.error, /could not be loaded/); await settle(); assert.equal(f.reads.length, count);
  f.fire('disconnect'); await f.join(); f.reads.at(-1).resolve({ messages: [message('new')] }); await settle();
  assert.equal(f.c.error, ''); assert.deepEqual(Array.from(f.c.messages, row => row.id), ['kept', 'new']); f.cleanup();
});

test('successful reconciliation does not erase unrelated send or upload errors', async () => {
  const f = fixture(); await f.start(); await f.resolveReads(); await f.join();
  f.c.setError('Upload not confirmed. Check the conversation before uploading again.');
  f.reads.at(-1).resolve({ messages: [] }); await settle(); assert.match(f.c.error, /Upload not confirmed/); f.cleanup();
});

test('failed reconciliation or connection cannot hide an uncertain upload warning', async () => {
  for (const failure of ['history', 'connection', 'join']) {
    const f = fixture(); await f.start(); await f.resolveReads();
    if (failure !== 'join') await f.join(); else f.fire('connect');
    f.c.setError('Upload not confirmed. Check the conversation before uploading again.');
    if (failure === 'history') f.reads.at(-1).reject(Error('offline'));
    if (failure === 'connection') f.fire('connect_error', Error('offline'));
    if (failure === 'join') f.joins.at(-1)({ success: false });
    await settle(); assert.match(f.c.error, /Upload not confirmed/); f.cleanup();
  }
});

test('connection errors invalidate pending joins and reads, with later successful joins recovering', async () => {
  const f = fixture(); await f.start(); await f.resolveReads(); f.fire('connect'); const ack = f.joins.at(-1);
  f.fire('connect_error', Error('failure')); ack({ success: true }); await settle();
  assert.equal(f.c.connected, false); assert.equal(f.reads.length, 1); assert.match(f.c.error, /connection failed/);
  await f.join(); await f.resolveReads(); assert.equal(f.c.connected, true); assert.equal(f.c.error, ''); f.cleanup();
});

test('cleanup removes only its listeners, leaves its room, disconnects, and clears its socket reference', async () => {
  const f = fixture(); await f.start(); await f.join();
  assert.equal(f.listeners.size, 4); f.cleanup();
  assert.equal(f.listeners.size, 0); assert.equal(f.disconnects, 1);
  assert.equal(f.c.sessionRef.current, null); assert.equal(f.c.socketRef.current, null);
  assert.ok(f.events.some(event => event[0] === 'emit' && event[1] === 'leave-room' && event[2] === 'room'));
});

test('startup results after unmount create neither a socket nor a history read', async () => {
  const f = fixture(); f.cleanup(); await f.start(); assert.equal(f.sockets, 0); assert.equal(f.reads.length, 0);
});
