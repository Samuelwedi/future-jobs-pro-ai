const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const { setup, owner, second, receipt, missing, deferred, settle, evaluate, root } = require('./helpers/chat-text-outbox.cjs');
function runtime(f) {
  const app = [], network = [], timers = new Map(); let id = 0;
  const module = evaluate('src/services/chatTextOutbox.ts', n => {
    if (n === 'react-native') return { AppState: { currentState: 'active', addEventListener: (_name, fn) => { app.push(fn); return { remove() {} }; } } };
    if (n === 'expo-network') return { addNetworkStateListener: fn => { network.push(fn); return { remove() {} }; } };
    if (n === './api') return { api: f.api };
    if (n === './offlineService') return { checkOnlineStatus: async () => true };
    if (n === './chatTextOutboxEngine') return { createChatTextOutbox: () => f.engine };
    throw Error(n);
  }, { setTimeout: (fn, delay) => { timers.set(++id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id) });
  return { ...module, app, network, timers };
}
function handler(file, name, context) {
  const source = fs.readFileSync(path.join(root, file), 'utf8'), ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression; function visit(n) { if (ts.isVariableDeclaration(n) && n.name.getText(ast) === name) expression = n.initializer; ts.forEachChild(n, visit); } visit(ast); assert.ok(expression, name);
  return vm.runInNewContext(ts.transpileModule('result = ' + expression.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
}
test('App runner has no polling when empty; backoff schedules only pending work and clears on background', async () => {
  const f = setup(), runtimeApi = runtime(f), cleanup = runtimeApi.startChatTextOutbox(owner); await f.drain(); assert.equal(runtimeApi.timers.size, 0);
  await f.seed(); f.response = async () => ({ status: 503, data: { code: 'CHAT_REQUEST_SCHEMA_UNAVAILABLE' } }); await f.drain(); assert.equal(runtimeApi.timers.size, 1);
  assert.ok([...runtimeApi.timers.values()][0].delay >= 1000); runtimeApi.app[0]('background'); assert.equal(runtimeApi.timers.size, 0);
  cleanup(); assert.equal(runtimeApi.timers.size, 0);
});
test('logout before any runner can be followed by a legitimate new login/start', async () => {
  const f = setup(); f.engine.pause(); await f.seed(); const rt = runtime(f), stop = rt.startChatTextOutbox(owner); await f.drain(); assert.equal(f.sent.length, 1); stop();
});
test('actual logout pauses before deferred cleanup and old AppState active cannot dispatch while logout awaits', async () => {
  const f = setup(); f.online = false; await f.seed(); const rt = runtime(f), stop = rt.startChatTextOutbox(owner); await f.drain();
  const wait = deferred(); let signedOut = false;
  const logout = handler('src/context/AuthContext.tsx', 'logout', { chatTextOutbox: f.engine, stopBackgroundLocation: () => wait.promise,
    api: f.api, logoutPending: { current: false }, authEpoch: { current: 0 }, setIsLoggingOut: () => {}, storageExclusive: work => work(),
    SecureStore: { deleteItemAsync: async key => f.secure.delete(key) }, setUser: value => { signedOut = value === null; } });
  f.online = true; const pending = logout(); rt.app[0]('background'); rt.app[0]('active'); await f.drain(); assert.equal(f.sent.length, 0); assert.equal(signedOut, false);
  wait.resolve(); await pending; assert.equal(signedOut, true); assert.equal(f.sent.length, 0); stop();
});
test('superseded runner callbacks and late cleanup cannot change or stop the new owner binding', async () => {
  const f = setup(); f.online = false; const rt = runtime(f), oldCleanup = rt.startChatTextOutbox(owner); await f.drain();
  f.secure.set('userData', JSON.stringify(second)); const newIntent = f.store.createChatTextIntent(second, 'second-room', 'Second owner');
  await f.store.persistChatTextIntent(newIntent, () => {}, { role: second.role, generation: 'login-one' });
  const newCleanup = rt.startChatTextOutbox(second); rt.app[0]('background'); oldCleanup(); f.online = true; rt.network[1]({ isConnected: true, isInternetReachable: true });
  await f.drain(); assert.equal(f.sent.length, 1); assert.equal(f.sent[0].body.expectedActorId, second.id); newCleanup();
});
test('resume or rebind during an old in-flight request retains a pending wake and recovers without another event', async () => {
  for (const mode of ['resume', 'rebind']) {
    const f = setup(); await f.seed(); const wait = deferred(); f.response = async (r, method) => method === 'post' ? wait.promise : receipt(r, true);
    const rt = runtime(f), oldCleanup = rt.startChatTextOutbox(owner); await settle(); assert.equal(f.sent.length, 1);
    let newCleanup;
    if (mode === 'resume') { rt.app[0]('background'); rt.app[0]('active'); } else newCleanup = rt.startChatTextOutbox(owner);
    wait.resolve(receipt(f.sent[0].record));
    for (let i = 0; i < 12; i++) await settle();
    assert.deepEqual(f.sent.map(r => r.method), ['post', 'get']); assert.equal((await f.records())[0].state, 'saved');
    oldCleanup(); newCleanup?.();
  }
});
test('ambiguous earlier admission blocks new admission in that room but not another room, retaining the original key', async () => {
  const f = setup(), first = await f.intent('original'); let fail = true;
  f.beforeStorage = async op => { if (op === 'set' && fail) { fail = false; throw Error('storage full'); } };
  await assert.rejects(f.engine.enqueue(first, () => true));
  await assert.rejects(f.engine.enqueue(await f.intent('newer'), () => true), /earlier/);
  await f.engine.enqueue(await f.intent('other', 'other-room'), () => true); await f.drain();
  assert.deepEqual(f.sent.map(r => r.record.text), ['other']);
  await f.engine.retry((await f.records()).find(r => r.requestKey === first.requestKey)); assert.equal(f.sent.at(-1).record.text, 'original');
});
function screenFixture() {
  const wait = deferred(), events = [], f = setup(), context = { user: owner, roomId: 'room', pendingAdmission: { current: null }, sendLock: { current: false },
    draft: { current: { text: 'Hello', revision: 1 } }, sessionRef: { current: { isCurrent: () => context.current } }, current: true, input: 'Hello', t: s => s,
    setSending: v => events.push(['sending', v]), setSendStatus: v => events.push(['status', v]), setError: v => events.push(['error', v]),
    createChatTextIntent: f.store.createChatTextIntent, chatTextOutbox: { enqueue: (r, current) => { events.push(['enqueue', r]); return wait.promise; } } };
  context.isCurrent = () => context.current; context.changeInput = value => { context.input = value; context.draft.current = { text: value, revision: context.draft.current.revision + 1 }; events.push(['input', value]); };
  const send = handler('src/screens/ChatScreen.tsx', 'queueOrdinaryText', context); return { context, events, wait, send };
}
test('ordinary Send locks same-turn taps, persists one intent, and clears only unchanged drafts', async () => {
  for (const edit of [null, 'newer', 'Hello']) {
    const f = screenFixture(), first = f.send(), second = f.send(); assert.equal(f.events.filter(e => e[0] === 'enqueue').length, 1);
    if (edit !== null) f.context.changeInput(edit); f.wait.resolve(); await Promise.all([first, second]);
    assert.equal(f.context.input, edit === null ? '' : edit);
  }
});
test('ambiguous admission preserves key/draft and Send cannot silently act on a newer composer; labeled original retry reuses key', async () => {
  const f = screenFixture(), first = f.send(); f.wait.reject(Error('local write not confirmed')); await first;
  const original = f.context.pendingAdmission.current.intent; f.context.changeInput('New draft'); await f.send();
  assert.equal(f.events.filter(e => e[0] === 'enqueue').length, 1); assert.match(f.events.at(-1)[1], /earlier text/);
  f.context.chatTextOutbox.enqueue = async r => { f.events.push(['enqueue', r]); }; await f.send(true);
  assert.equal(f.events.filter(e => e[0] === 'enqueue').at(-1)[1].requestKey, original.requestKey); assert.equal(f.context.input, 'New draft');
});
test('late ordinary admission success/failure never updates unmounted or changed screen UI', async () => {
  for (const failed of [false, true]) { const f = screenFixture(), first = f.send(); f.context.current = false; const count = f.events.length;
    failed ? f.wait.reject(Error('late')) : f.wait.resolve(); await first; assert.equal(f.events.length, count); assert.equal(f.context.input, 'Hello'); }
});
test('ordinary/support routing is explicit and no queued ordinary rejection can invoke support fallback', async () => {
  for (const support of [false, true]) {
    const calls = [], c = { roomId: support ? 'support-ticket-id' : 'ordinary-room', queueOrdinaryText: async () => { calls.push('durable'); throw Error('keyed rejected'); }, sendSupportMessage: async () => calls.push('support') };
    const send = handler('src/screens/ChatScreen.tsx', 'sendMessage', c); if (support) await send(); else await assert.rejects(send());
    assert.deepEqual(calls, [support ? 'support' : 'durable']);
  }
});
test('actual room UI labels local/persistence states and preserves paging/null-gap/scroll controls', () => {
  const source = fs.readFileSync(path.join(root, 'src/screens/ChatScreen.tsx'), 'utf8');
  for (const text of ['Queued on this device', 'Sending or awaiting saved-status recovery', 'Save not confirmed', 'Needs review', 'Delivery and reading are not confirmed', 'Check saved status', 'Retry same request', 'Retry saving original text', 'Recover local saved receipt']) assert.ok(source.includes(text), text);
  assert.match(source, /maintainVisibleContentPosition/); assert.match(source, /continueRecovery/); assert.match(source, /scrollAfterLayout\.current && nearBottom\.current/); assert.match(source, /item\.created_at === null/);
  assert.match(source, /useEffect[\s\S]*chatTextOutbox\.subscribe/);
});
test('manual check during another room attempt reports busy instead of pretending the requested recovery happened', async () => {
  const f = setup(), blocked = await f.seed('blocked', 'blocked-room');
  await f.store.updateChatTextRecord({ ...blocked, state: 'needs-review' }, () => {});
  await f.seed('other', 'other-room'); const wait = deferred(); f.response = async () => wait.promise;
  const running = f.engine.kick(); await settle(); assert.equal(f.sent.length, 1);
  await assert.rejects(f.engine.retry((await f.records()).find(r => r.roomId === 'blocked-room'), true), /busy/);
  wait.resolve(receipt(f.sent[0].record)); await running; assert.equal(f.sent.length, 1);
  assert.equal((await f.records()).find(r => r.roomId === 'blocked-room').state, 'needs-review');
});
test('overlapping admissions from replaced views recheck the volatile room lock after authorization', async () => {
  const f = setup(), first = await f.intent('first'), second = await f.intent('second');
  const wait = deferred(); let fail = true; f.beforeSecure = async () => wait.promise;
  f.beforeStorage = async op => { if (op === 'set' && fail) { fail = false; throw Error('storage full'); } };
  const a = f.engine.enqueue(first, () => true), b = f.engine.enqueue(second, () => true);
  wait.resolve(); const results = await Promise.allSettled([a, b]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 0);
  assert.ok(results.some(r => r.reason?.message.includes('earlier')));
  assert.equal((await f.records()).length, 1); assert.equal(f.sent.length, 0);
  await f.engine.retry((await f.records())[0]); assert.equal(f.sent.length, 1); assert.equal(f.sent[0].body.requestKey, first.requestKey);
});
test('successful manual recovery wakes the later same-room queue without another external event', async () => {
  const f = setup(), first = await f.seed('first'), second = await f.seed('second');
  await f.store.updateChatTextRecord({ ...first, state: 'needs-review' }, () => {}); await f.drain(); assert.equal(f.sent.length, 0);
  f.response = async (r, method) => method === 'get' ? missing(r) : receipt(r);
  await f.engine.retry((await f.records()).find(r => r.requestKey === first.requestKey));
  for (let i = 0; i < 12; i++) await settle();
  assert.deepEqual(f.sent.map(r => [r.method, r.record.text]), [['get', 'first'], ['post', 'first'], ['post', 'second']]);
  assert.equal((await f.records()).every(r => r.state === 'saved'), true);
});
test('dynamic outbox reasons and recovery errors have Spanish/French copy and catch paths translate them', () => {
  const { screenCopy } = evaluate('src/services/screenTranslations.ts', () => { throw Error('Unexpected import'); });
  for (const file of ['chatTextOutboxStore.ts', 'chatTextOutboxEngine.ts']) {
    const source = fs.readFileSync(path.join(root, 'src/services', file), 'utf8'), ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    function visit(node) {
      if (ts.isStringLiteral(node) && node.text.includes(' ') && node.text.length > 20 && !node.text.startsWith('./')) {
        assert.ok(screenCopy[node.text], `${file}: ${node.text}`);
        assert.equal(screenCopy[node.text].length, 2);
        for (const translated of screenCopy[node.text]) assert.ok(translated.length && translated !== node.text);
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  const screen = fs.readFileSync(path.join(root, 'src/screens/ChatScreen.tsx'), 'utf8');
  assert.match(screen, /setOutboxProblem\(t\(cause\?\.message/);
  assert.match(screen, /setSendStatus\(t\(cause\?\.message/);
});
test('role or login approval changes enter review immediately even while a prior transient backoff is not due', async () => {
  for (const kind of ['role', 'generation']) {
    const f = setup(), record = await f.seed();
    await f.store.updateChatTextRecord({ ...record, state: 'uncertain', attempts: 1, nextAttemptAt: f.now + 60000 }, () => {});
    if (kind === 'role') { const user = { ...owner, role: 'boss' }; f.secure.set('userData', JSON.stringify(user)); f.engine.setContext(user, true); }
    else await f.api.setToken('replacement');
    await f.drain(); assert.equal((await f.records())[0].state, 'needs-review'); assert.equal(f.sent.length, 0); assert.equal(f.engine.nextWakeDelay(), null);
  }
});
test('approval review remains bounded and schedules another pass when more than eight rooms need review', async () => {
  const f = setup();
  for (let i = 0; i < 11; i++) { const r = await f.seed(`text ${i}`, `room-${i}`); await f.store.updateChatTextRecord({ ...r, state: 'uncertain', attempts: 1, nextAttemptAt: f.now + 60000 }, () => {}); }
  const current = { ...owner, role: 'boss' }; f.secure.set('userData', JSON.stringify(current)); f.engine.setContext(current, true);
  await f.engine.kick(); assert.equal((await f.records()).filter(r => r.state === 'needs-review').length, 8); assert.equal(f.sent.length, 0); assert.equal(f.engine.nextWakeDelay(), 1000);
  await f.engine.kick(); assert.equal((await f.records()).filter(r => r.state === 'needs-review').length, 11); assert.equal(f.sent.length, 0); assert.equal(f.engine.nextWakeDelay(), null);
});
