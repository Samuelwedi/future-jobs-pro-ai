const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/utils/lucyChatRequest.ts'), 'utf8');
const context = {exports: {}};
vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS}}).outputText, context);
const {LucyChatRequestController: Controller, lucyRequestNotice: notice} = context.exports;
const payload = {message: 'Create task once', language: 'en', channel: 'text', conversationMode: false};
function setup() {let id = 0; const c = new Controller(() => `request-${++id}`); c.setScope('user:company:role'); return c;}
function complete(c, attempt, extra = {}) {return c.receive(attempt, {text: 'Done', ...extra, request: {id: attempt.payload.requestId, state: 'completed'}});}

test('web and native share the exact dependency-free receipt contract', () => {
  const sibling = path.join(__dirname, '../../', __dirname.includes('/mobile/') ? 'web' : 'mobile', 'src/utils/lucyChatRequest.ts');
  assert.equal(fs.readFileSync(sibling, 'utf8'), source);
  assert.doesNotMatch(source, /localStorage|AsyncStorage|SecureStore|setTimeout|setInterval/);
});
test('duplicate taps lock synchronously and unknown outcome retains immutable exact payload', () => {
  const c = setup(), mutable = {...payload}, first = c.begin(mutable);
  assert.equal(c.snapshot().busy, true); assert.equal(c.begin(payload), null); assert.equal(c.check(), null);
  mutable.message = 'edited'; mutable.language = 'fr';
  c.fail(first); assert.equal(c.snapshot().busy, false); assert.equal(c.snapshot().state, 'uncertain');
  assert.equal(c.begin({...payload, message: 'different message'}), null);
  const retry = c.check(); assert.strictEqual(retry.payload, first.payload);
  assert.equal(retry.payload.message, payload.message); assert.equal(retry.payload.language, 'en'); assert.ok(Object.isFrozen(retry.payload));
  assert.equal(retry.checking, true); assert.notEqual(first.sequence, retry.sequence);
});
test('only a matching completed receipt allows a deliberate identical new request', () => {
  const c = setup(), first = c.begin(payload);
  assert.equal(complete(c, first).kind, 'completed'); assert.equal(c.snapshot().pending, false);
  const next = c.begin(payload); assert.notEqual(next.payload.requestId, first.payload.requestId);
  assert.equal(c.receive(first, {request: {id: first.payload.requestId, state: 'completed'}}).kind, 'stale');
  assert.equal(c.snapshot().requestId, next.payload.requestId);
});
test('processing and uncertain receipts never report action failure or permit a new send', () => {
  for (const [state, status] of [['processing', 202], ['uncertain', 409], ['uncertain', 200]]) {
    const c = setup(), first = c.begin(payload), actions = [{status: 'completed', title: 'Task created'}];
    const result = c.receive(first, {text: 'Task created', actions, request: {id: first.payload.requestId, state}}, status);
    assert.equal(result.kind, 'unresolved'); assert.strictEqual(result.data.actions, actions); assert.equal(c.begin(payload), null);
    assert.ok(notice(c.snapshot()).includes(state === 'processing' ? 'processing' : 'may already have completed'));
    const retry = c.check(); assert.strictEqual(retry.payload, first.payload); assert.equal(complete(c, retry).kind, 'completed');
  }
});
test('missing, mismatched, malformed and expired receipts do not permit unsafe POST retries', () => {
  for (const request of [undefined, {id: 'someone-else', state: 'completed'}, {id: 'request-1', state: 'unexpected'}, {id: 'request-1', state: 'expired'}]) {
    const c = setup(), first = c.begin(payload), result = c.receive(first, {text: 'Reported result', request});
    assert.equal(result.kind, 'unresolved'); assert.equal(c.snapshot().canCheck, false); assert.equal(c.check(), null); assert.equal(c.begin(payload), null);
    if (request?.id === 'someone-else') assert.equal(result.data, undefined);
    assert.ok(notice(c.snapshot()).includes('may already have completed'));
  }
});
test('background, blur and resume suppress stale results while preserving the original check', () => {
  const c = setup(), first = c.begin(payload); c.suspend();
  assert.equal(c.begin(payload), null); assert.equal(c.check(), null); c.resume();
  assert.equal(complete(c, first).kind, 'stale'); assert.equal(c.snapshot().pending, true);
  const retry = c.check(); assert.strictEqual(retry.payload, first.payload);
  assert.equal(c.fail(first).kind, 'stale'); assert.equal(c.snapshot().busy, true);
  complete(c, retry); assert.equal(c.snapshot().pending, false);
});
test('account, company and role changes clear private pending context and reject late responses', () => {
  for (const scope of ['other:company:role', 'user:other:role', 'user:company:other', '']) {
    const c = setup(), first = c.begin(payload); assert.equal(c.setScope(scope), true);
    assert.equal(c.snapshot().pending, false); assert.equal(c.snapshot().requestId, null); assert.equal(complete(c, first).kind, 'stale');
    assert.equal(c.check(), null); if (!scope) assert.equal(c.begin(payload), null);
  }
});
test('new request requires explicit warning confirmation for the exact outstanding request', () => {
  const c = setup(), first = c.begin(payload);
  assert.equal(c.startNewAfterWarning(first.payload.requestId), false); c.fail(first);
  assert.equal(c.startNewAfterWarning('wrong'), false); assert.equal(c.snapshot().pending, true);
  assert.equal(c.startNewAfterWarning(first.payload.requestId), true);
  const next = c.begin(payload); assert.notEqual(next.payload.requestId, first.payload.requestId);
  assert.equal(complete(c, first).kind, 'stale'); assert.equal(c.snapshot().busy, true);
});

const native = __dirname.includes('/mobile/');
const screen = fs.readFileSync(path.join(__dirname, native ? '../src/screens/AIAssistantScreen.tsx' : '../src/pages/AskLucy.tsx'), 'utf8');
function handlers() {
  const c = setup(), calls = [], queue = [], spoken = [];
  const state = {messages: [], loading: false, input: '', request: c.snapshot(), error: '', voice: ''};
  const epoch = {current: 0};
  const transport = async (method, url, payload) => {
    calls.push({method, url, payload});
    assert.ok(queue.length, 'unexpected network request');
    const result = await queue.shift()({method, url, payload});
    if (native && result.status >= 400) throw {response: result};
    return result;
  };
  const ctx = {exports: {}, controller: c, lifecycle: epoch, generation: epoch, voiceEpoch: {current: 0}, mounted: {current: true},
    current: value => value === epoch.current, viewCurrent: value => value === epoch.current,
    interacted: {current: false}, conversationActiveRef: {current: false}, consecutiveMisses: {current: 0}, followUpTimer: {current: null},
    deniedScope: {current: null}, scope: 'user:company:role', readChatScope: () => 'user:company:role',
    syncScope: () => {}, syncRequest: () => {state.request = c.snapshot();}, input: 'Create task once', lang: 'fr',
    setMessages: update => {state.messages = typeof update === 'function' ? update(state.messages) : update;},
    setInput: value => {state.input = value;}, setLoading: value => {state.loading = value;}, setError: value => {state.error = value;},
    setVoiceState: value => {state.voice = value;}, setVoiceStatus: value => {state.voice = value;},
    setConversation: () => {}, queueFollowUp: () => {throw Error('unexpected automatic follow-up');}, clearTimeout: () => {},
    finishVoice: () => {}, stopVoice: () => {state.voice = 'idle';}, t: value => value,
    speakText: async text => {spoken.push(text);}, speakAsLucy: async text => {spoken.push(text);},
    API_BASE: 'https://local.invalid', localStorage: {getItem: () => 'test-token'},
    window: {confirm: () => false}, Alert: {alert: (...args) => {state.alert = args;}},
    fetch: async (url, init) => {const response = await transport(init.method, url, init.body ? JSON.parse(init.body) : undefined); return {status: response.status, json: async () => response.data};},
    api: {
      postLucyChat: payload => transport('POST', '/lucy-v2', payload),
      get: async url => (await transport('GET', url)).data,
    },
  };
  const code = screen.slice(screen.indexOf('  const runRequest ='), screen.indexOf(native ? '  const downloadAction=' : '  const beginRecognition ='));
  vm.runInNewContext(ts.transpileModule(code + '\nexports.handlers = {sendMessage, checkPrevious, startNew};', {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS}}).outputText, ctx);
  return {c, calls, queue, spoken, state, epoch, ...ctx.exports.handlers};
}
const flush = async () => {for (let i = 0; i < 20; i++) await Promise.resolve();};
const receipt = (id, state, extra = {}) => ({request: {id, state}, ...extra});

test('real send handler blocks duplicate taps, checks by GET after transport loss, and new confirmed send uses new ID', async () => {
  const f = handlers(); let reject;
  f.queue.push(() => new Promise((_, no) => {reject = no;}));
  const first = f.sendMessage('Create task once'); await f.sendMessage('Create task once');
  assert.equal(f.calls.length, 1); assert.equal(f.state.messages.length, 1);
  const id = f.calls[0].payload.requestId; reject(Error('response lost')); await first;
  assert.equal(f.c.snapshot().state, 'uncertain'); assert.ok(!JSON.stringify(f.state.messages).includes('failed'));
  await f.sendMessage('Edited draft'); assert.equal(f.calls.length, 1);
  f.queue.push(async () => ({status: 200, data: {request: {id, state: 'completed'}, response: {statusCode: 200, body: receipt(id, 'completed', {text: 'Created once'})}}}));
  f.checkPrevious(); f.checkPrevious(); await flush();
  assert.equal(f.calls.length, 2); assert.equal(f.calls[1].method, 'GET'); assert.ok(f.calls[1].url.endsWith('/requests/' + id)); assert.equal(f.calls[1].payload, undefined);
  assert.equal(f.state.messages.filter(m => m.isUser).length, 1); assert.equal(f.state.messages.at(-1).text, 'Created once'); assert.equal(f.spoken.length, 0);
  f.queue.push(async ({payload}) => ({status: 200, data: receipt(payload.requestId, 'completed', {text: 'Created deliberately again'})}));
  await f.sendMessage('Create task once'); assert.notEqual(f.calls[2].payload.requestId, id);
  assert.equal(f.calls[2].payload.language, native ? 'fr' : 'en');
});
test('real handlers preserve completed actions and evidence after uncertain success then a status-only uncertain check', async () => {
  const f = handlers(); const actions = [{type: 'task', title: 'Task created', status: 'completed', details: []}];
  const evidence = {sources: [{id: 'record-1'}], incomplete: false};
  f.queue.push(async ({payload}) => ({status: 200, data: receipt(payload.requestId, 'uncertain', {text: 'Task created; receipt could not be saved', actions, evidence})}));
  await f.sendMessage('Create task once', true);
  const original = JSON.stringify(f.state.messages); assert.ok(original.includes('Task created')); assert.ok(original.includes('record-1'));
  const id = f.c.snapshot().requestId;
  f.queue.push(async () => ({status: 409, data: receipt(id, 'uncertain', {text: 'Outcome remains uncertain', actions: []})}));
  f.checkPrevious(); await flush();
  assert.equal(JSON.stringify(f.state.messages), original); assert.equal(f.c.snapshot().state, 'uncertain'); assert.equal(f.spoken.length, 0);
  assert.equal(f.state.loading, false);
});
test('real handlers keep a processing receipt unresolved and never continue voice automatically', async () => {
  const f = handlers();
  f.queue.push(async ({payload}) => ({status: 202, data: receipt(payload.requestId, 'processing', {text: 'Still processing', actions: []})}));
  await f.sendMessage('Create task once', true);
  assert.equal(f.c.snapshot().pending, true); assert.equal(f.c.snapshot().state, 'processing'); assert.equal(f.state.messages.length, 1); assert.equal(f.spoken.length, 0);
  await f.sendMessage('new task'); assert.equal(f.calls.length, 1);
  f.startNew(); assert.equal(f.c.snapshot().pending, true);
  if (native) {assert.ok(f.state.alert[1].includes('duplicate')); f.state.alert[2][1].onPress(); assert.equal(f.c.snapshot().pending, false);}
});
test('real handlers drop late private responses after identity/lifecycle changes', async () => {
  const f = handlers(); let resolve;
  f.queue.push(() => new Promise(yes => {resolve = yes;})); const pending = f.sendMessage('Private request'); const id = f.calls[0].payload.requestId;
  f.epoch.current++; f.c.setScope('different:company:role'); f.state.messages = []; f.state.loading = false;
  resolve({status: 200, data: receipt(id, 'completed', {text: 'PRIVATE OLD RESULT'})}); await pending;
  assert.equal(f.state.messages.length, 0); assert.equal(f.spoken.length, 0); assert.equal(f.state.loading, false);
});
test('real handlers clear private context after denied access without claiming an action failed', async () => {
  const f = handlers(); f.queue.push(async () => ({status: 403, data: {message: 'Forbidden'}}));
  await f.sendMessage('Private request'); assert.equal(f.state.messages.length, 0); assert.equal(f.c.snapshot().pending, false); assert.equal(f.spoken.length, 0);
  assert.ok((f.state.error + f.state.voice).includes('access changed'));
});

test('native online-only Lucy transport never queues and retains the normal axios access interceptors', async () => {
  const apiSource = fs.readFileSync(path.join(__dirname, '../src/services/api.ts'), 'utf8');
  const method = apiSource.slice(apiSource.indexOf('  async postLucyChat<'), apiSource.indexOf('  async put<'));
  const calls = []; let online = true;
  const ctx = {exports: {}, getOnlineStatus: () => online};
  const code = `class Transport {constructor(public client: any) {}\n${method}\n}\nexports.Transport = Transport;`;
  vm.runInNewContext(ts.transpileModule(code, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS}}).outputText, ctx);
  const client = {post: async (...args) => {calls.push(args); return {data: {request: {state: 'processing'}}, status: 202};}};
  const transport = new ctx.exports.Transport(client);
  const request = {...payload, requestId: 'request-online'};
  const response = await transport.postLucyChat(request);
  assert.equal(response.status, 202); assert.strictEqual(calls[0][1], request); assert.equal(calls[0][0], '/lucy-v2');
  online = false; await assert.rejects(transport.postLucyChat(request), /Nothing was queued/); assert.equal(calls.length, 1);
  online = true; const denied = {response: {status: 401}}; client.post = async () => {throw denied;};
  await assert.rejects(transport.postLucyChat(request), error => error === denied);
  assert.doesNotMatch(method, /queueAction|SecureStore|AsyncStorage|validateStatus/);
});
test('all dynamic request-state safety notices have Spanish and French translations', () => {
  const translations = {exports: {}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/screenTranslations.ts'), 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText, translations);
  for (const state of [
    {pending: true, busy: true}, {pending: true, state: 'processing'}, {pending: true, state: 'expired'},
    {pending: true, state: 'uncertain', canCheck: true}, {pending: true, state: 'uncertain', canCheck: false},
  ]) {
    const key = notice(state), copy = translations.exports.screenCopy[key];
    assert.ok(copy, key); assert.equal(copy.length, 2); assert.ok(copy.every(text => text && text !== key));
  }
});
test('identity reset runs before a Home wake timer captures its lifecycle generation', () => {
  assert.ok(screen.indexOf('// Authentication scope changes') < screen.indexOf('// Auto-record from Home screen'));
  const wake = screen.slice(screen.indexOf('// Auto-record from Home screen'), screen.indexOf('// History must not overwrite'));
  assert.match(wake, /current\(epoch\) \|\| controller\.snapshot\(\)\.pending/);
});
