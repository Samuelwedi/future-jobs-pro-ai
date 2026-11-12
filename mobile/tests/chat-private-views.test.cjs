const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const root = process.env.CHAT_SOURCE_ROOT || path.join(__dirname, '..');
function compile(file, requireFn, extra = {}) {
  const context = { exports: {}, require: requireFn, ...extra };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'src', file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, context);
  return context.exports;
}
const utils = compile('utils/chatViews.ts');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const owner = { id: id(1), companyId: id(2), role: 'employee' }, roomId = id(3);
const scope = { actorId: owner.id, companyId: owner.companyId, roomId, membershipInstanceId: id(4) };
const row = (n = 5, changes = {}) => ({ id: id(n), view_version: id(n + 1000), sender_id: id(9), company_id: owner.companyId, room_id: roomId, created_at: null, ...changes });
const ack = (request, changes = {}) => ({ success: true, viewContext: request.scope, acknowledged: request.messages, ...changes });
const counts = (count = 5, changes = {}) => ({ success: true, viewState: { actorId: owner.id, companyId: owner.companyId, historyPolicy: 'unmarked_until_viewed', rooms: [{ roomId, membershipInstanceId: scope.membershipInstanceId, unviewedCount: count, unviewedCountCapped: false, ...changes }] } });
const flush = () => new Promise(setImmediate);
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function controllerFixture() {
  const f = { active: true, requests: [], changed: 0, unknown: 0, denied: 0, stale: 0 };
  f.controller = utils.createPrivateViews({ owner, roomId, current: () => f.active,
    acknowledge: (scope, messages, current) => { const request = { scope, messages, current, ...deferred() }; f.requests.push(request); return request.promise; },
    changed: () => f.changed++, unavailable: () => f.unknown++, denied: () => f.denied++, stale: () => f.stale++,
  });
  f.controller.context(scope); return f;
}
test('count contract rejects old servers, missing, foreign, duplicate, malformed and ambiguous cap data instead of zero', () => {
  assert.equal(utils.readViewCounts(counts(0), owner)[0].unviewedCount, 0);
  assert.equal(utils.readViewCounts(counts(99, { unviewedCountCapped: true }), owner)[0].unviewedCountCapped, true);
  for (const data of [{ success: true }, {}, null, counts(-1), counts(100), counts(1.1), counts(98, { unviewedCountCapped: true }), counts(3, { unviewedCountCapped: 'true' }), counts(3, { membershipInstanceId: 'missing' }), { ...counts(), viewState: { ...counts().viewState, actorId: id(99) } }, { ...counts(), viewState: { ...counts().viewState, rooms: [...counts().viewState.rooms, ...counts().viewState.rooms] } }]) assert.throws(() => utils.readViewCounts(data, owner));
});
test('only exact visible incoming versions qualify after a full second; own, malformed and foreign rows never do', async () => {
  const f = controllerFixture();
  const rows = [row(), row(6, { sender_id: owner.id }), row(7, { room_id: id(99) }), row(8, { view_version: null })];
  f.controller.observe(rows, 0); f.controller.observe(rows, 999); assert.equal(f.requests.length, 0);
  f.controller.observe(rows, 1000); assert.equal(f.requests.length, 1); assert.equal(f.requests[0].messages.length, 1);
  f.requests[0].resolve(ack(f.requests[0])); await flush(); assert.equal(f.changed, 1);
  f.controller.observe(rows, 9000); assert.equal(f.requests.length, 1);
});
test('scroll-away, pause, changed version and membership incarnation cancel pending dwell and stale response application', async () => {
  for (const change of ['away', 'pause', 'version', 'membership', 'dispose']) {
    const f = controllerFixture(); f.controller.observe([row()], 0); f.controller.observe([row()], 1000);
    if (change === 'away') f.controller.observe([], 1100);
    if (change === 'pause') { f.active = false; f.controller.reset(); }
    if (change === 'version') f.controller.observe([row(5, { view_version: id(999) })], 1100);
    if (change === 'membership') f.controller.context({ ...scope, membershipInstanceId: id(99) });
    if (change === 'dispose') f.controller.dispose();
    assert.equal(f.requests[0].current(), false); f.requests[0].resolve(ack(f.requests[0])); await flush(); assert.equal(f.changed, 0);
  }
});
test('at most one batch of100 is in flight; further rows require live observation rather than a replay queue', async () => {
  const f = controllerFixture(), rows = Array.from({ length: 230 }, (_, n) => row(n + 20));
  f.controller.observe(rows, 0); f.controller.observe(rows, 1000); f.controller.observe(rows, 2000);
  assert.equal(f.requests.length, 1); assert.equal(f.requests[0].messages.length, 100);
  f.requests[0].resolve(ack(f.requests[0])); await flush(); assert.equal(f.requests.length, 1);
  f.controller.observe([], 2200); f.controller.observe(rows, 2300); f.controller.observe(rows, 3300);
  assert.equal(f.requests.length, 2); assert.equal(f.requests[1].messages.length, 100);
});
test('all acknowledgement scope, IDs and versions must match, including unique full batches', async () => {
  for (const mutate of [r => ({}), r => ({ ...ack(r), success: false }), r => ack(r, { viewContext: { ...scope, actorId: id(88) } }), r => ack(r, { viewContext: { ...scope, membershipInstanceId: id(88) } }), r => ack(r, { acknowledged: [] }), r => ack(r, { acknowledged: [{ ...r.messages[0], viewVersion: id(88) }] }), r => ack(r, { acknowledged: [r.messages[0], r.messages[0]] })]) {
    const f = controllerFixture(); f.controller.observe([row()], 0); f.controller.observe([row()], 1000); f.requests[0].resolve(mutate(f.requests[0])); await flush();
    assert.equal(f.changed, 0); assert.equal(f.unknown, 1);
  }
});
test('denials stop views, stale/deleted versions request fresh history, transient or old endpoint failure remains unknown', async () => {
  for (const status of [401, 402, 403, 404, 409, 503, undefined]) {
    const f = controllerFixture(); f.controller.observe([row()], 0); f.controller.observe([row()], 1000);
    f.requests[0].reject({ response: { status, data: { code: 'CHAT_VIEW_STALE' } } }); await flush();
    assert.equal(f.changed, 0); assert.equal(f.denied, [401, 402, 403].includes(status) ? 1 : 0);
    assert.equal(f.stale, status === 409 ? 1 : 0);
    if ([401, 402, 403, 409].includes(status)) { f.controller.observe([row()], 2000); f.controller.observe([row()], 4000); assert.equal(f.requests.length, 1); }
  }
});
test('geometry requires actual fully-contained dimensions; oversized, partial, offscreen and zero-size bubbles remain unmarked', () => {
  const viewport = { x: 0, y: 100, width: 320, height: 400 };
  assert.equal(utils.fullyVisible({ x: 10, y: 110, width: 200, height: 100 }, viewport), true);
  for (const rect of [{ x: 0, y: 99, width: 100, height: 100 }, { x: 0, y: 100, width: 100, height: 401 }, { x: 0, y: 500, width: 100, height: 100 }, { x: 0, y: 100, width: 0, height: 100 }, { x: NaN, y: 100, width: 100, height: 100 }]) assert.equal(utils.fullyVisible(rect, viewport), false);
});
// Execute the production hook with real private-view controller and native
// callback/measurement stubs. These source tests do not claim device acceptance.
function hookFixture() {
  let cursor = 0, now = 0, timer; const slots = [], effects = [], events = {};
  const f = { current: true, wallClock: 0, performance: { now: () => now }, rows: [row()], posts: [], reads: [], denials: 0, refreshes: 0 };
  const network = { getNetworkStateAsync: async () => ({ isConnected: true, isInternetReachable: true }), addNetworkStateListener(fn) { f.network = fn; return { remove() {} }; } };
  const native = { AppState: { currentState: 'active', addEventListener(name, fn) { events[name] = fn; return { remove() {} }; } } };
  const api = { getChatViewCounts(owner, current) { const request = { ...deferred(), current }; f.reads.push(request); return request.promise.then(data => ({ data, isSessionCurrent: current })); } };
  const hook = compile('hooks/useChatViews.ts', name => {
    if (name === 'react') return { useRef(initial) { const i = cursor++; return slots[i] || (slots[i] = { current: initial }); }, useState(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: initial }; return [slots[i].value, value => slots[i].value = value]; }, useEffect(fn) { const i = cursor++; if (!slots[i]) { slots[i] = {}; effects.push(() => slots[i].cleanup = fn()); } } };
    if (name === 'react-native') return native;
    if (name === 'expo-network') return network;
    if (name === '../services/api') return { api };
    if (name === '../utils/chatViews') return utils;
    throw Error(name);
  }, { Date: { now: () => f.wallClock }, performance: f.performance, setInterval: fn => { timer = fn; return 1; }, clearInterval() {} }).useChatViews;
  const session = { isCurrent: () => f.current, acknowledgeViews(scope, messages, current) { const request = { scope, messages, current, ...deferred() }; f.posts.push(request); return request.promise; } };
  f.render = () => { cursor = 0; f.hook = hook({ owner, roomId, rows: f.rows, current: () => f.current, session: () => session, denied: () => f.denials++, refreshHistory: () => f.refreshes++ }); effects.splice(0).forEach(fn => fn()); };
  f.render();
  f.rect = { x: 10, y: 110, width: 200, height: 100 };
  f.hook.viewport.current = { measureInWindow: cb => cb(0, 100, 320, 400) };
  f.hook.rowRef(row().id, { measureInWindow: cb => cb(...Object.values(f.rect)) });
  f.visible = (rows = f.rows) => f.hook.onViewableItemsChanged({ viewableItems: rows.map(item => ({ item, isViewable: true })) });
  f.event = (name, value) => { if (name === 'change') native.AppState.currentState = value; events[name](value); };
  f.tick = async value => { now = value; await timer(); await flush(); f.render(); };
  f.ready = async () => { await flush(); f.hook.layout(); f.hook.history({ viewContext: scope }); f.visible(); };
  f.unmount = () => slots.forEach(slot => slot?.cleanup?.());
  return f;
}
test('hook requires layout, native viewability and measured1s dwell; render/history/socket/list metadata alone do not acknowledge', async () => {
  const f = hookFixture(); await flush(); f.hook.history({ viewContext: scope }); f.visible(); await f.tick(0); await f.tick(2000); assert.equal(f.posts.length, 0);
  f.hook.layout(); await f.tick(4000); assert.equal(f.posts.length, 0);
  f.visible(); await f.tick(5000); await f.tick(5999); assert.equal(f.posts.length, 0); await f.tick(6000); assert.equal(f.posts.length, 1); f.unmount();
});
test('hook drops visibility on background, Android blur, modal, network loss and unmount; waking never replays cached rows', async () => {
  for (const change of ['background', 'blur', 'modal', 'offline', 'route', 'logout', 'unmount']) {
    const f = hookFixture(); await f.ready(); await f.tick(0); await f.tick(800);
    if (change === 'background') f.event('change', 'background');
    if (change === 'blur') f.event('blur');
    if (change === 'modal') f.hook.covered(true);
    if (change === 'offline') f.network({ isConnected: false });
    if (change === 'route' || change === 'logout') f.current = false;
    if (change === 'unmount') f.unmount();
    await f.tick(2000); assert.equal(f.posts.length, 0, change);
    if (change === 'background') f.event('change', 'active');
    if (change === 'blur') f.event('focus');
    if (change === 'modal') f.hook.covered(false);
    if (change === 'offline') f.network({ isConnected: true, isInternetReachable: true });
    await f.tick(4000); assert.equal(f.posts.length, 0, change); f.unmount();
  }
});
test('scroll-away and oversized measurements defeat even a stale native viewability callback', async () => {
  for (const height of [401, 100]) {
    const f = hookFixture(); await f.ready(); await f.tick(0); f.rect = { ...f.rect, y: height === 100 ? 800 : 110, height };
    f.hook.scroll(); await f.tick(2000); await f.tick(4000); assert.equal(f.posts.length, 0); f.unmount();
  }
});
test('socket insertion while old history is visible never marks new offscreen rows', async () => {
  const f = hookFixture(); await f.ready(); await f.tick(0); f.rows = [row(), row(99)]; f.render(); await f.tick(1000);
  assert.equal(f.posts.length, 1); assert.deepEqual(Array.from(f.posts[0].messages, m => m.id), [row().id]); f.unmount();
});
test('late pre-ack count cannot overwrite post-ack values; failed count refresh stays unknown', async () => {
  const f = hookFixture(); await f.ready(); assert.equal(f.reads.length, 1); await f.tick(0); await f.tick(1000);
  f.posts[0].resolve(ack(f.posts[0])); await flush(); assert.equal(f.reads.length, 2); assert.equal(f.reads[0].current(), false);
  f.reads[1].resolve(counts(1)); await flush(); f.render(); assert.equal(f.hook.count.unviewedCount, 1);
  f.reads[0].resolve(counts(9)); await flush(); f.render(); assert.equal(f.hook.count.unviewedCount, 1); f.unmount();
});
test('membership change clears visibility, explicit denial clears access, transient history failures preserve it', async () => {
  const f = hookFixture(); await f.ready(); await f.tick(0);
  assert.equal(f.hook.history({ viewContext: { ...scope, membershipInstanceId: id(90) } }), true);
  await f.tick(2000); assert.equal(f.posts.length, 0); f.hook.failed({ response: { status: 503 } }); assert.equal(f.denials, 0);
  f.hook.failed({ response: { status: 403 } }); assert.equal(f.denials, 1); f.visible(); await f.tick(4000); assert.equal(f.posts.length, 0); f.unmount();
});

test('native exact POST/query payloads agree with production backend parsers, without SQL or network', () => {
  const backendRoot = process.env.CHAT_VIEWS_BACKEND_ROOT || path.join(root, '../backend');
  const source = fs.readFileSync(path.join(backendRoot, 'src/services/chatViews.ts'), 'utf8');
  const context = { exports: {}, Buffer, process: { env: {} }, require: name => {
    if (name === '../config/database') return { pool: {} };
    if (name === './complimentaryAccess') return { hasComplimentaryAccess: () => false };
    throw Error(name);
  } };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context);
  const body = { expectedActorId: owner.id, expectedCompanyId: owner.companyId, membershipInstanceId: scope.membershipInstanceId, messages: [{ id: row().id, viewVersion: row().view_version }] };
  const parsed = context.exports.parseViewRequest(roomId, body);
  assert.equal(parsed.messages[0].viewVersion, row().view_version);
  assert.equal(context.exports.parseViewStateQuery({ expectedActorId: owner.id, expectedCompanyId: owner.companyId }).expectedActorId, owner.id);
  for (const bodyChange of [{ messages: [] }, { messages: [body.messages[0], body.messages[0]] }, { membershipInstanceId: 'old' }, { expectedActorId: 'wrong' }]) assert.throws(() => context.exports.parseViewRequest(roomId, { ...body, ...bodyChange }));
  assert.throws(() => context.exports.parseViewRequest('support-ticket-test', body));
  assert.equal(utils.readViewCounts(counts(1, { roomId: 'ordinary-room-with-text-id' }), owner)[0].roomId, 'ordinary-room-with-text-id');
});

test('one dismissed viewer cannot unpause another modal or an active native chooser', async () => {
  const f = hookFixture(); await f.ready(); f.hook.covered(true, 'viewer-a'); f.hook.covered(true, 'chooser');
  f.hook.covered(false, 'viewer-a'); f.visible(); await f.tick(0); await f.tick(2000); assert.equal(f.posts.length, 0);
  f.hook.covered(false, 'chooser'); f.visible(); await f.tick(3000); await f.tick(4000); assert.equal(f.posts.length, 1); f.unmount();
});

test('a completed uncertain or blurred POST invalidates inbox reads even though no old-scope result is applied', async () => {
  const f = controllerFixture(); const previous = utils.privateViewRevision(); let invalidations = 0;
  const unsubscribe = utils.subscribePrivateViewCounts(() => invalidations++);
  f.controller.observe([row()], 0); f.controller.observe([row()], 1000); f.controller.dispose();
  f.requests[0].resolve(ack(f.requests[0])); await flush(); assert.equal(f.changed, 0);
  assert.ok(utils.privateViewRevision() > previous); assert.equal(invalidations, 1); unsubscribe();
});


test('wall-clock jumps never satisfy native dwell; only a full monotonic second does', async () => {
  const f = hookFixture(); await f.ready(); await f.tick(100);
  f.wallClock = 9999999999999; await f.tick(300); assert.equal(f.posts.length, 0);
  f.wallClock = -9999999999999; await f.tick(1099); assert.equal(f.posts.length, 0);
  await f.tick(1100); assert.equal(f.posts.length, 1); f.unmount();
});
test('missing, throwing, nonfinite and backward monotonic clocks clear dwell and require renewed native visibility', async () => {
  for (const badClock of [undefined, () => { throw Error('unavailable'); }, () => NaN, () => Infinity, () => -1, () => 100]) {
    const f = hookFixture(); await f.ready(); await f.tick(1000); await f.tick(1800);
    const goodClock = f.performance.now; f.performance.now = badClock;
    await f.tick(2000); assert.equal(f.posts.length, 0);
    f.performance.now = goodClock; await f.tick(5000); assert.equal(f.posts.length, 0);
    f.visible(); await f.tick(6000); await f.tick(6999); assert.equal(f.posts.length, 0);
    await f.tick(7000); assert.equal(f.posts.length, 1); f.unmount();
  }
});
test('controller rejects invalid elapsed values and preserves a monotonic high-water sample across reset', () => {
  const f = controllerFixture(); f.controller.observe([row()], 5000); f.controller.reset();
  assert.equal(f.controller.observe([row()], 4000), false);
  for (const value of [NaN, Infinity, -1]) assert.equal(f.controller.observe([row()], value), false);
  f.controller.observe([row()], 6000); f.controller.observe([row()], 6999); assert.equal(f.requests.length, 0);
  f.controller.observe([row()], 7000); assert.equal(f.requests.length, 1);
});

test('ignored completed views refresh room counts and stale409 retains prior membership for rejoin cleanup', async () => {
  for (const stale of [false, true]) {
    const f = hookFixture(); await f.ready(); f.reads[0].resolve(counts(5)); await flush(); f.render();
    await f.tick(0); await f.tick(1000);
    if (stale) f.posts[0].reject({ response: { status: 409, data: { code: 'CHAT_VIEW_STALE' } } });
    else { f.hook.scroll(); f.posts[0].resolve(ack(f.posts[0])); }
    await flush(); f.render(); assert.equal(f.hook.count, null);
    if (stale) { assert.equal(f.refreshes, 1); assert.equal(f.hook.history({ viewContext: { ...scope, membershipInstanceId: id(999) } }), true); }
    else assert.equal(f.reads.length, 2);
    f.unmount();
  }
});

test('rendered version replacement fences dispatch immediately, before the next native measurement', async () => {
  const f = hookFixture(); await f.ready(); await f.tick(0); await f.tick(1000);
  assert.equal(f.posts[0].current(), true); f.rows = [row(5, { view_version: id(999) })]; f.render();
  assert.equal(f.posts[0].current(), false); f.unmount();
});
test('stale-version cleanup removes only the rejected version and preserves newer socket replacements', () => {
  const source = fs.readFileSync(path.join(root, 'src/screens/ChatScreen.tsx'), 'utf8');
  const ast = ts.createSourceFile('ChatScreen.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX); let callback;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useChatViews') callback = node.arguments[0].properties.find(property => property.name.getText(ast) === 'refreshHistory').initializer;
    ts.forEachChild(node, visit);
  }
  visit(ast); let messages = [row(), row(6, { view_version: id(999) }), row(7)], refreshed = 0;
  const context = { historyRef: { current: { refresh() { refreshed++; } } }, setMessages: update => { messages = update(messages); } };
  const remove = vm.runInNewContext(ts.transpileModule('result = ' + callback.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  remove([{ id: row().id, viewVersion: row().view_version }, { id: row(6).id, viewVersion: row(6).view_version }]);
  assert.deepEqual(messages.map(message => message.id), [row(6).id, row(7).id]); assert.equal(refreshed, 1);
});
