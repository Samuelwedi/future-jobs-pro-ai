const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const { setup, owner, second, deferred, settle, evaluate, root } = require('./helpers/chat-text-outbox.cjs');
const authSource = fs.readFileSync(path.join(root, 'src/context/AuthContext.tsx'), 'utf8');
const authAst = ts.createSourceFile('AuthContext.tsx', authSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function expression(ast, match) { let found; function visit(n) { if (match(n)) found = n; ts.forEachChild(n, visit); } visit(ast); assert.ok(found); return found; }
function compile(node, context) { return vm.runInNewContext(ts.transpileModule('result = ' + node.getText(), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context); }
function authFixture() {
  const f = setup(), events = []; let stop = async () => {}, write = async () => {}, read = async key => f.secure.get(key) ?? null;
  const c = { api: f.api, chatTextOutbox: f.engine, authEpoch: { current: 0 }, logoutPending: { current: false }, userDataWrites: { current: Promise.resolve() },
    user: owner, loggingOut: false, isLoading: false, console: { error() {} },
    stopBackgroundLocation: () => stop(), setIsLoggingOut: v => { c.loggingOut = v; events.push(['logout-phase', v]); },
    setIsLoading: v => { c.isLoading = v; }, setUser: v => { c.user = v; events.push(['user', v]); },
    SecureStore: { getItemAsync: key => read(key), async setItemAsync(key, value) { await write(key, value); f.secure.set(key, value); events.push(['write', key]); }, async deleteItemAsync(key) { f.secure.delete(key); events.push(['delete', key]); } },
  };
  for (const name of ['storageExclusive', 'writeCurrentUser', 'refreshUser', 'login', 'logout', 'register']) {
    c[name] = compile(expression(authAst, n => ts.isVariableDeclaration(n) && n.name.getText() === name).initializer, c);
  }
  const load = expression(authAst, n => ts.isCallExpression(n) && n.expression.getText() === 'useEffect' && n.arguments[0]?.getText().includes('const loadSession')).arguments[0];
  c.load = compile(load, c);
  const providerValue = expression(authAst, n => ts.isJsxAttribute(n) && n.name.getText() === 'value').initializer.expression;
  const effective = () => { c.isLoggingOut = c.loggingOut; return compile(providerValue, c); };
  f.api.setUnauthorizedHandler(() => { void c.logout(); });
  return { f, c, events, effective, set stop(fn) { stop = fn; }, set write(fn) { write = fn; }, set read(fn) { read = fn; } };
}
function appOutboxEffect(context) {
  const source = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8'), ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return compile(expression(ast, n => ts.isCallExpression(n) && n.expression.getText() === 'useEffect' && n.arguments[0]?.getText().includes('startChatTextOutbox')).arguments[0], context);
}
test('actual AuthProvider logout phase gates a stale replacement App effect and survives refresh changes until cleanup finishes', async () => {
  const a = authFixture(), wait = deferred(); a.stop = () => wait.promise; let starts = 0;
  const initial = a.effective(); assert.equal(initial.isAuthenticated, true);
  const logout = a.c.logout(); assert.equal(a.c.logoutPending.current, true); assert.equal(a.f.api.token, null);
  a.c.user = { ...owner, role: 'boss' }; // a replacement render may still carry a refreshed owner
  assert.equal(a.effective().isAuthenticated, false); assert.equal(a.effective().isLoading, true);
  const stale = { isLoading: false, isAuthenticated: true, user: a.c.user,
    isLogoutPending: initial.isLogoutPending, startChatTextOutbox: () => { starts++; } };
  appOutboxEffect(stale)(); assert.equal(starts, 0);
  a.c.user = owner; appOutboxEffect({ ...stale, user: owner })(); assert.equal(starts, 0);
  wait.resolve(); await logout; assert.equal(a.c.logoutPending.current, false); assert.equal(a.c.user, null);
});
test('runtime refuses a stale startup and callbacks when the synchronous provider logout gate is closed', async () => {
  const f = setup(); await f.seed(); let allowed = false, listeners = 0;
  const rt = evaluate('src/services/chatTextOutbox.ts', n => {
    if (n === 'react-native') return { AppState: { currentState: 'active', addEventListener: () => { listeners++; return { remove() {} }; } } };
    if (n === 'expo-network') return { addNetworkStateListener: () => { listeners++; return { remove() {} }; } };
    if (n === './api') return { api: f.api }; if (n === './offlineService') return { checkOnlineStatus: async () => true };
    if (n === './chatTextOutboxEngine') return { createChatTextOutbox: () => f.engine }; throw Error(n);
  }, { setTimeout, clearTimeout });
  f.engine.pause(); const stop = rt.startChatTextOutbox(owner, () => allowed); await f.drain(); assert.equal(f.sent.length, 0); assert.equal(listeners, 0); stop();
  allowed = true; const nextStop = rt.startChatTextOutbox(owner, () => allowed); await f.drain(); assert.equal(f.sent.length, 1); nextStop();
});
test('old refresh success cannot publish or restore userData during or after logout', async () => {
  for (const after of [false, true]) {
    const a = authFixture(), wait = deferred(), cleanup = deferred(); a.stop = () => cleanup.promise;
    a.f.response = async () => wait.promise; const refresh = a.c.refreshUser(); await settle();
    const logout = a.c.logout(); if (after) { cleanup.resolve(); await logout; }
    wait.resolve({ status: 200, data: { success: true, user: { ...owner, role: 'boss' } } }); await refresh;
    if (!after) { assert.equal(a.c.loggingOut, true); cleanup.resolve(); await logout; }
    assert.equal(a.c.user, null); assert.equal(a.f.secure.has('userData'), false);
    assert.equal(a.events.filter(e => e[0] === 'user' && e[1]).length, 0);
  }
});
test('already-started refresh storage write settles before logout deletion and cannot reauthenticate', async () => {
  const a = authFixture(), wait = deferred(); a.write = async key => { if (key === 'userData') await wait.promise; };
  a.f.response = async () => ({ status: 200, data: { success: true, user: { ...owner, role: 'boss' } } });
  const refresh = a.c.refreshUser(); await settle(); const logout = a.c.logout(); await settle(); assert.equal(a.c.loggingOut, true);
  wait.resolve(); await Promise.all([refresh, logout]); assert.equal(a.c.user, null); assert.equal(a.f.secure.has('userData'), false);
  assert.ok(a.events.findIndex(e => e[0] === 'write') < a.events.findIndex(e => e[0] === 'delete'));
});
test('late old refresh401 is fenced in actual API interceptor and cannot clear intentional new login', async () => {
  const a = authFixture(), wait = deferred(); a.f.response = async () => wait.promise;
  const refresh = a.c.refreshUser(); await settle(); const request = a.f.sent[0];
  assert.equal(request.url, '/auth/session'); assert.equal(request.config.expectedAuthToken, 'token'); assert.equal(request.config.fenceUnauthorizedToCurrent, true);
  await a.c.logout();
  a.f.response = async () => ({ status: 200, data: { success: true, token: 'replacement', user: second } });
  await a.c.login('synthetic@example.test', 'synthetic-password');
  wait.reject({ response: { status: 401 } }); await refresh; await settle();
  assert.equal(a.f.api.token, 'replacement'); assert.equal(a.c.user.id, second.id); assert.equal(JSON.parse(a.f.secure.get('userData')).id, second.id); assert.equal(a.c.loggingOut, false);
});
test('stale initial loadSession completion after logout/new login cannot restore cached old identity', async () => {
  const a = authFixture(), wait = deferred(); a.read = async () => wait.promise; a.c.load(); await settle(); await a.c.logout();
  a.f.response = async () => ({ status: 200, data: { success: true, token: 'replacement', user: second } }); await a.c.login('synthetic@example.test', 'synthetic-password');
  wait.resolve(JSON.stringify(owner)); await settle();
  assert.equal(a.c.user.id, second.id); assert.equal(JSON.parse(a.f.secure.get('userData')).id, second.id); assert.equal(a.f.sent.filter(r => r.url === '/auth/session').length, 0);
});
test('intentional login/register wait until logout completes, then restore normal authenticated runner admission', async () => {
  const a = authFixture(), wait = deferred(); a.stop = () => wait.promise; const logout = a.c.logout();
  await assert.rejects(a.c.login('synthetic@example.test', 'synthetic-password'), /progress/); await assert.rejects(a.c.register({}), /progress/); assert.equal(a.f.sent.length, 0);
  wait.resolve(); await logout; a.f.response = async () => ({ status: 200, data: { success: true, token: 'replacement', user: second } });
  await a.c.login('synthetic@example.test', 'synthetic-password'); const effective = a.effective(); assert.equal(effective.isAuthenticated, true); assert.equal(effective.isLoading, false);
  let started = false; appOutboxEffect({ ...effective, startChatTextOutbox: (_owner, allowed) => { started = allowed(); } })(); assert.equal(started, true);
});
test('provider catch cannot logout a directly replaced API session after the interceptor rejects a stale401', async () => {
  const a = authFixture(), wait = deferred(); a.f.response = async () => wait.promise;
  const refresh = a.c.refreshUser(); await settle(); const epoch = a.c.authEpoch.current;
  await a.f.api.setToken('direct-replacement');
  wait.reject({ response: { status: 401 } }); await refresh;
  assert.equal(a.f.api.token, 'direct-replacement'); assert.equal(a.c.authEpoch.current, epoch); assert.equal(a.c.logoutPending.current, false);
});
test('logout during login/register credential persistence drains old writes before deletion and permits later intentional login', async () => {
  for (const action of ['login', 'register']) for (const delayedKey of ['chatTextAuthGeneration', 'authToken']) {
    const a = authFixture(), wait = deferred(); let delayed = false;
    a.f.response = async () => ({ status: 200, data: { success: true, token: 'old-pending-login', user: second } });
    a.f.beforeSecureWrite = async (op, key) => { if (op === 'set' && key === delayedKey && !delayed) { delayed = true; await wait.promise; } };
    const login = action === 'login' ? a.c.login('synthetic@example.test', 'synthetic-password') : a.c.register({});
    await settle(); assert.equal(delayed, true); const logout = a.c.logout(); await settle();
    assert.equal(a.c.logoutPending.current, true); assert.equal(a.f.api.token, null); assert.equal(await a.f.api.getToken(), null);
    wait.resolve(); await Promise.all([login, logout]);
    assert.equal(a.f.secure.has('authToken'), false); assert.equal(a.f.secure.has('userData'), false); assert.equal(a.c.user, null); assert.equal(a.c.logoutPending.current, false);
    a.f.response = async () => ({ status: 200, data: { success: true, token: 'new-intentional-login', user: second } });
    await a.c.login('synthetic@example.test', 'synthetic-password');
    assert.equal(a.f.secure.get('authToken'), 'new-intentional-login'); assert.equal(a.c.user.id, second.id);
  }
});
