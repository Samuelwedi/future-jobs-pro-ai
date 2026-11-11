const { test } = require('node:test'), assert = require('node:assert/strict');
const { setup, owner, second, receipt, missing, deferred, settle, clone } = require('./helpers/chat-text-outbox.cjs');

test('dedicated ordinary text transport persists canonical intent before POST, sends actor/company, validates save, never claims delivery', async () => {
  const f = setup(), r = await f.intent('  café\n👋  ', 'room/with space');
  await f.engine.enqueue(r, () => true); await f.drain();
  assert.equal(f.sent.length, 1); const request = f.sent[0];
  assert.equal(request.url, '/chat/message-requests'); assert.equal(request.body.message, 'café\n👋');
  assert.equal(request.body.expectedActorId, owner.id); assert.equal(request.body.expectedCompanyId, owner.companyId);
  assert.equal(f.events[0][0], 'persist'); assert.equal(f.events[0][1].state, 'queued');
  assert.equal(f.events[1][1].state, 'sending'); assert.equal((await f.records())[0].state, 'saved');
  assert.equal(f.engine.nextWakeDelay(), null);
});
test('empty, support, malformed Unicode and oversized raw text cannot enter the durable queue', async () => {
  const f = setup();
  for (const text of ['', ' ', '\0', '\ud800', '\udc00', 'x'.repeat(5001), ' ' + 'x'.repeat(5000)]) assert.throws(() => f.store.createChatTextIntent(owner, 'room', text));
  assert.throws(() => f.store.createChatTextIntent(owner, 'support-ticket-id', 'hello'));
  assert.throws(() => f.store.createChatTextIntent(owner, ' room', 'hello'));
  assert.equal(f.data.size, 0);
});
test('offline admission survives process restart and foreground recovery with the original key', async () => {
  const f = setup(); f.online = false; const r = await f.intent(); await f.engine.enqueue(r, () => true); await f.drain();
  assert.equal(f.sent.length, 0); assert.equal((await f.records())[0].state, 'queued'); assert.equal(f.engine.nextWakeDelay(), null);
  const restarted = setup(f.data); await restarted.drain();
  assert.equal(restarted.sent.length, 1); assert.equal(restarted.sent[0].body.requestKey, r.requestKey);
});
test('storage rejects before or after preparation write: retain intent and only retry the same key; no network before durability', async () => {
  for (const when of ['before', 'after']) {
    const f = setup(), r = await f.intent(); let once = true;
    const fail = async operation => { if (operation === 'set' && once) { once = false; throw Error('storage failure'); } };
    if (when === 'before') f.beforeStorage = fail; else f.afterStorage = fail;
    await assert.rejects(f.engine.enqueue(r, () => true)); await f.drain();
    assert.equal(f.sent.length, 0); assert.equal((await f.records())[0].requestKey, r.requestKey);
    await f.engine.retry((await f.records())[0]);
    assert.equal(f.sent.filter(r => r.method === 'post').length, 1);
    assert.equal(f.sent.at(-1).body.requestKey, r.requestKey);
    assert.equal((await f.records())[0].state, 'saved');
  }
});
test('restart after a persisted-then-rejected preparation recovers the original intent without replacement', async () => {
  const f = setup(), r = await f.intent(); f.afterStorage = async operation => { if (operation === 'set') throw Error('lost storage ACK'); };
  await assert.rejects(f.engine.enqueue(r, () => true));
  const next = setup(f.data); await next.drain(); assert.equal(next.sent[0].body.requestKey, r.requestKey); assert.equal((await next.records())[0].state, 'saved');
});
test('sending-state write ambiguity cannot dispatch until recovery confirms the same persisted request', async () => {
  const f = setup(); await f.seed(); let fail = true;
  f.afterStorage = async (op, _key, raw) => { if (op === 'set' && JSON.parse(raw).state === 'sending' && fail) { fail = false; throw Error('lost state ACK'); } };
  await f.drain(); assert.equal(f.sent.length, 0);
  f.response = async (r, method) => method === 'get' ? missing(r) : receipt(r);
  await f.engine.retry((await f.records())[0]); assert.deepEqual(f.sent.map(r => r.method), ['get', 'post']);
});
test('lost server ACK and restart recover by GET, without a duplicate POST or new key', async () => {
  const f = setup(), r = await f.seed(); f.response = async () => { throw Error('connection lost after commit'); }; await f.drain();
  assert.equal((await f.records())[0].state, 'uncertain');
  const next = setup(f.data); next.now += 100000; next.response = async r => receipt(r, true); await next.drain();
  assert.deepEqual(next.sent.map(r => r.method), ['get']); assert.equal(next.sent[0].record.requestKey, r.requestKey);
  assert.equal((await next.records())[0].state, 'saved');
});
test('authorized missing requires full identity and permits only an identical same-key POST', async () => {
  for (const mismatch of [null, 'actorId', 'companyId', 'roomId', 'key', 'state']) {
    const f = setup(), r = await f.seed(); await f.store.updateChatTextRecord({ ...r, state: 'uncertain', attempts: 1 }, () => {});
    f.response = async (record, method) => { if (method === 'post') return receipt(record); const response = missing(record); if (mismatch) response.data.request[mismatch] = 'foreign'; return response; };
    await f.drain(); assert.deepEqual(f.sent.map(r => r.method), mismatch ? ['get'] : ['get', 'post']);
    assert.equal((await f.records())[0].state, mismatch ? 'needs-review' : 'saved');
  }
});
test('unavailable/conflict keys permanently forbid POST, even if a later status says missing', async () => {
  for (const mode of ['unavailable', 'conflict']) {
    const f = setup(); await f.seed(); f.response = async r => mode === 'unavailable' ? missing(r, 'unavailable') : { status: 409, data: { success: false, code: 'CHAT_REQUEST_CONFLICT' } };
    await f.drain(); const blocked = (await f.records())[0]; assert.equal(blocked.stopPost, true);
    f.response = async r => missing(r); const before = f.sent.length;
    await f.engine.retry(blocked); await f.drain(); await f.engine.retry((await f.records())[0]);
    assert.deepEqual(f.sent.slice(before).map(r => r.method), ['get', 'get']); assert.equal((await f.records())[0].stopPost, true);
  }
});
test('old-server unknown404, auth/material4xx and invalid success stop automatic attempts without fallback', async () => {
  for (const status of [200, 400, 401, 402, 403, 404, 409, 410, 422]) {
    const f = setup(); await f.seed(); f.response = async () => ({ status, data: {} }); await f.drain();
    assert.equal((await f.records())[0].state, 'needs-review'); assert.equal(f.engine.nextWakeDelay(), null);
    await f.drain(); assert.equal(f.sent.length, 1); assert.equal(f.sent[0].url, '/chat/message-requests');
  }
});
test('transient503/schema-unavailable,429 and transport failure use persisted backoff and stop after five attempts', async () => {
  for (const status of [503, 429, null]) {
    const f = setup(); await f.seed(); f.response = async () => { if (status === null) throw Error('timeout'); return { status, data: { code: 'CHAT_REQUEST_SCHEMA_UNAVAILABLE' } }; };
    for (let i = 0; i < 5; i++) { await f.drain(); const count = f.sent.length; await f.drain(); assert.equal(f.sent.length, count); f.now += 100000; }
    assert.equal(f.sent.length, 5); assert.equal((await f.records())[0].state, 'needs-review'); assert.equal(f.engine.nextWakeDelay(), null);
  }
});
test('strict ACK identity, exact canonical text, message identity and text-only kind precede saved display', async () => {
  const mutations = [v => v.request.key = 'other-key', v => v.request.actorId = second.id, v => v.request.companyId = second.id,
    v => v.request.roomId = 'other', v => v.request.replayed = undefined, v => v.request.state = 'missing',
    v => v.message.id = '', v => v.message.sender_id = second.id, v => v.message.company_id = second.id,
    v => v.message.room_id = 'other', v => v.message.message = 'changed', v => v.message.attachment_id = 'file',
    v => delete v.message.attachment_id, v => v.message.attachment_type = 'image/jpeg', v => v.message.created_at = null];
  for (const mutate of mutations) { const f = setup(); await f.seed(); f.response = async r => { const result = receipt(r); mutate(result.data); return result; }; await f.drain(); assert.equal((await f.records())[0].state, 'needs-review'); }
});
test('valid server ACK followed by local write failure still displays saved, retains recovery, and never resends', async () => {
  for (const persisted of [false, true]) {
    const f = setup(); await f.seed(); let once = true;
    const fail = async (op, _key, raw) => { if (op === 'set' && JSON.parse(raw).state === 'saved' && once) { once = false; throw Error('storage ACK lost'); } };
    if (persisted) f.afterStorage = fail; else f.beforeStorage = fail;
    await f.drain(); const record = (await f.records())[0]; assert.equal(record.state, 'saved'); assert.match(record.reason, /Local receipt/);
    await f.engine.retry(record); assert.equal(f.sent.length, 1); assert.equal((await f.records())[0].state, 'saved');
  }
});
test('cleanup failures leave saved confirmation recoverable and do not claim send failed', async () => {
  const f = setup(); await f.seed(); await f.drain(); const saved = (await f.records())[0];
  f.beforeStorage = async op => { if (op === 'remove') throw Error('storage unavailable'); };
  await assert.rejects(f.engine.dismiss(saved, () => true)); assert.equal((await f.records())[0].state, 'saved'); assert.equal(f.sent.length, 1);
});
test('per-room order survives same-time sends/restart; blocked earlier room does not block other rooms', async () => {
  const f = setup(); const first = await f.seed('first'), second = await f.seed('second'), other = await f.seed('other', 'other-room');
  assert.ok(first.sequence < second.sequence); f.response = async r => r.requestKey === first.requestKey ? { status: 403, data: {} } : receipt(r);
  await f.drain(); assert.deepEqual(f.sent.map(r => r.record.text), ['first', 'other']);
  await assert.rejects(f.engine.retry((await f.records()).find(r => r.requestKey === second.requestKey)), /earlier/); await f.drain();
  f.response = async (r, method) => method === 'get' ? missing(r) : receipt(r); await f.engine.retry((await f.records()).find(r => r.requestKey === first.requestKey)); await f.drain();
  assert.equal(f.sent.at(-1).record.text, 'second'); assert.equal((await f.records()).every(r => r.state === 'saved'), true);
});
test('corrupt or unreadable record is preserved while other rooms process', async () => {
  for (const kind of ['corrupt', 'read-failure']) {
    const f = setup(); const bad = await f.seed('bad'), good = await f.seed('good', 'other-room'); const key = [...f.data.keys()][0];
    if (kind === 'corrupt') f.data.set(key, '{broken'); else f.beforeStorage = async (op, k) => { if (op === 'get' && k === key) throw Error('read failed'); };
    await f.drain(); assert.equal(f.sent.length, 1); assert.equal(f.sent[0].body.requestKey, good.requestKey); assert.equal(f.data.has(key), true);
    assert.equal((await f.engine.snapshot(owner, () => {})).problems.length, 1);
  }
});
test('serialized batches are bounded and no timer is required once all pending work is complete', async () => {
  const f = setup(); for (let i = 0; i < 12; i++) await f.seed(`message ${i}`, `room-${i}`);
  await f.engine.kick(); assert.equal(f.sent.length, 8); assert.ok(f.engine.nextWakeDelay() >= 1000);
  await f.engine.kick(); assert.equal(f.sent.length, 12); assert.equal(f.engine.nextWakeDelay(), null);
});
test('background/logout halt dispatch; sticky logout cannot be undone by old foreground callback', async () => {
  const f = setup(); await f.seed(); f.engine.setContext(owner, false); await f.drain(); assert.equal(f.sent.length, 0);
  f.engine.setContext(owner, true); f.engine.pause(); f.engine.setContext(owner, false); f.engine.setContext(owner, true); await f.drain(); assert.equal(f.sent.length, 0);
  f.engine.setContext(null, false); f.engine.setContext(owner, true); await f.drain(); assert.equal(f.sent.length, 1);
});
test('stale admission cannot write, while acknowledged admission survives room navigation and drains in foreground', async () => {
  for (const stage of ['before-write', 'after-write']) {
    const f = setup(), r = await f.intent(); let current = true;
    const change = async op => { if (op === (stage === 'before-write' ? 'get' : 'set')) current = false; };
    if (stage === 'before-write') f.afterStorage = change; else f.afterStorage = change;
    const work = f.engine.enqueue(r, () => current);
    if (stage === 'before-write') await assert.rejects(work); else await work;
    await f.drain(); assert.equal(f.sent.length, stage === 'before-write' ? 0 : 1);
  }
});
test('owner/company changes do not dispatch old records; login/token/role changes require explicit same-owner review', async () => {
  for (const change of ['owner', 'company', 'role', 'generation']) {
    const f = setup(); await f.seed(); let user = { ...owner };
    if (change === 'owner') user.id = second.id; if (change === 'company') user.companyId = second.id; if (change === 'role') user.role = 'boss';
    f.secure.set('userData', JSON.stringify(user)); f.engine.setContext(user, true);
    if (change === 'generation') await f.api.setToken('token'); // same-token ABA is still a new login
    await f.drain(); assert.equal(f.sent.length, 0);
    if (change === 'role' || change === 'generation') {
      const r = (await f.records())[0]; assert.equal(r.state, 'needs-review');
      f.response = async (r, method) => method === 'get' ? missing(r) : receipt(r); await f.engine.retry(r);
      assert.deepEqual(f.sent.map(r => r.method), ['get', 'post']); assert.equal(f.sent.at(-1).body.expectedActorId, owner.id);
    }
  }
});
test('stored owner/company/role and token/revision fences run at actual HTTP dispatch and after responses', async () => {
  for (const stage of ['dispatch', 'response']) for (const field of ['owner', 'company', 'role', 'token', 'revision', 'background']) {
    const f = setup(); await f.seed(); const mutate = async () => {
      if (field === 'token') f.api.token = 'replacement'; else if (field === 'revision') f.api.authRevision++;
      else if (field === 'background') f.engine.setContext(owner, false);
      else f.secure.set('userData', JSON.stringify({ ...owner, [field === 'owner' ? 'id' : field === 'company' ? 'companyId' : 'role']: 'changed' }));
    };
    if (stage === 'dispatch') f.beforeSend = mutate; else f.afterSend = mutate;
    await f.drain(); assert.equal(f.sent.length, stage === 'dispatch' ? 0 : 1);
    assert.notEqual((await f.records())[0].state, 'saved');
  }
});
test('dedicated requests suppress all subscription/unauthorized side effects including thrown adapter errors', async () => {
  for (const status of [401, 402, 403, 409, 410]) {
    const f = setup(); await f.seed(); let effects = 0; f.api.setSubscriptionRequiredHandler(() => effects++); f.api.setUnauthorizedHandler(() => effects++);
    f.response = async () => { throw { response: { status, data: {} } }; }; await f.drain();
    assert.equal(effects, 0); assert.equal(f.api.token, 'token'); assert.equal(f.sent[0].config.quietChatText, true); assert.equal((await f.records())[0].state, 'needs-review');
    if ([409, 410].includes(status)) assert.equal((await f.records())[0].stopPost, true);
    f.now += 100000; await f.drain(); assert.equal(f.sent.length, 1);
  }
});
test('legacy unkeyed chat queue stays review-only and never converts to a new receipt', async () => {
  const f = setup(); for (const url of ['/chat/message', '/chat/message-requests', '/chat/room/r/attachments']) await assert.rejects(f.api.replayQueued({ url, method: 'POST', data: { message: 'legacy' } }), /review/);
  assert.equal(f.sent.length, 0); assert.equal(f.data.size, 0);
});
test('known canonical receipt UUID cannot be rebound by a later full-valid same-tuple response', async () => {
  const f = setup(), r = await f.seed(), canonical = receipt(r).data;
  await f.store.updateChatTextRecord({ ...r, state: 'uncertain', attempts: 1, receipt: canonical }, () => {});
  f.response = async r => { const result = receipt(r, true); result.data.message.id = second.id; return result; };
  await f.drain(); const retained = (await f.records())[0];
  assert.equal(retained.state, 'needs-review'); assert.equal(retained.receipt.message.id, canonical.message.id);
  assert.equal(f.sent.length, 1); assert.equal(f.sent[0].method, 'get');
  await assert.rejects(f.store.updateChatTextRecord({ ...retained, state: 'saved', receipt: { ...canonical, message: { ...canonical.message, id: second.id } } }, () => {}), /identity conflicts/);
  assert.equal((await f.records())[0].receipt.message.id, canonical.message.id);
});
test('volatile acknowledgement after a rejected conflicting store update never replaces a persisted canonical UUID', async () => {
  const f = setup(), r = await f.seed(), canonical = receipt(r).data, replacement = receipt(r).data;
  replacement.message.id = second.id;
  f.response = async () => {
    // Simulate a canonical receipt becoming known at a storage boundary while
    // this older request carries a contradictory, structurally valid response.
    await f.store.updateChatTextRecord({ ...(await f.records())[0], state: 'saved', receipt: canonical }, () => {});
    return { status: 200, data: replacement };
  };
  await f.drain(); const state = await f.engine.snapshot(owner, () => {});
  assert.equal(state.records[0].state, 'saved'); assert.equal(state.records[0].receipt.message.id, canonical.message.id);
  assert.ok(state.problems.some(problem => /identity conflicts/.test(problem.reason)));
  await assert.rejects(f.engine.dismiss(state.records[0], () => true), /identity conflicts/);
  assert.equal(f.data.size, 1); assert.equal(f.sent.length, 1);
});
test('known saved receipt remains status-only even if its later scoped status is missing', async () => {
  const f = setup(), record = await f.seed();
  await f.store.updateChatTextRecord({ ...record, state: 'uncertain', attempts: 1, receipt: receipt(record).data }, () => {});
  f.response = async r => missing(r); await f.drain();
  const retained = (await f.records())[0]; assert.equal(retained.state, 'needs-review'); assert.equal(retained.stopPost, true);
  await f.engine.retry(retained); await f.drain(); assert.deepEqual(f.sent.map(r => r.method), ['get', 'get']);
  assert.equal((await f.records())[0].receipt.message.id, record.receipt?.message.id || receipt(record).data.message.id);
});
