const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const root = process.env.WEB_CREATION_SOURCE_ROOT || path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/pages/NewChat.tsx'), 'utf8');
const ownerId = '00000000-0000-0000-0000-000000000001';
const personId = '00000000-0000-0000-0000-000000000002';
const thirdId = '00000000-0000-0000-0000-000000000003';
const owner = { id: ownerId, companyId: 'company', role: 'employee' };
const person = (id = personId, extra = {}) => ({ id, first_name: 'Alice', last_name: 'Baker', role: 'employee', ...extra });
const directRoom = (id = personId) => [ownerId, id.toLowerCase()].sort().join('-');
const ack = (group = false) => ({ success: true, roomId: group ? 'group-123-abc' : directRoom() });
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function response(status = 200, body = { success: true }) {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => 'application/json' }, json: async () => body, text: async () => JSON.stringify(body) };
}

// Source-loaded component, real web transport and shared auth module, controlled
// hooks/JSX and synthetic fetch. This does not claim a browser React DOM mount.
function fixture({ sharedValues, initialUser = owner } = {}) {
  const instances = new Map(), listeners = new Map(), documentListeners = new Map(), modules = {};
  let active, dirty = false, removed = false;
  const values = sharedValues || { token: 'token', user: JSON.stringify(initialUser) };
  const storage = { getItem: key => values[key] ?? null, setItem: (key, value) => { values[key] = value; }, removeItem: key => { delete values[key]; } };
  const f = { values, storage, reads: [], posts: [], navigations: [], redirects: [], effects: [], stateWrites: [], timers: new Map(), intervals: new Map() };
  const eventTarget = callbacks => ({
    addEventListener(name, fn) { if (!callbacks.has(name)) callbacks.set(name, new Set()); callbacks.get(name).add(fn); },
    removeEventListener(name, fn) { callbacks.get(name)?.delete(fn); },
    dispatchEvent(event) { for (const fn of [...callbacks.get(event.type) || []]) fn(event); },
  });
  let timer = 0;
  const win = { ...eventTarget(listeners), location: { origin: 'https://example.test', pathname: '/new-chat', search: '', hash: '', assign: to => f.redirects.push(to) }, history: { state: { key: 'initial' } },
    setTimeout: fn => { f.timers.set(++timer, fn); return timer; }, clearTimeout: id => f.timers.delete(id),
    setInterval: fn => { f.intervals.set(++timer, fn); return timer; }, clearInterval: id => f.intervals.delete(id) };
  const doc = { ...eventTarget(documentListeners), visibilityState: 'visible' };
  const react = {
    useState(initial) { const instance = active, i = instance.cursor++; if (!instance.slots[i]) instance.slots[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [instance.slots[i].value, value => { assert.equal(instance.dead, false, 'state update after unmount'); instance.slots[i].value = typeof value === 'function' ? value(instance.slots[i].value) : value; f.stateWrites.push(instance.slots[i].value); dirty = true; }]; },
    useRef(initial) { const i = active.cursor++; return active.slots[i] || (active.slots[i] = { current: initial }); },
    useEffect(fn, deps) { const instance = active, i = instance.cursor++, previous = instance.slots[i];
      if (!previous || !deps || deps.some((v, n) => v !== previous.deps[n])) f.effects.push(() => { previous?.cleanup?.(); const entry = { deps, setup: fn }; instance.slots[i] = entry; entry.cleanup = fn(); }); },
  };
  react.useLayoutEffect = react.useEffect;
  const navigate = (...args) => { f.navigations.push(args); win.location.pathname = typeof args[0] === 'string' ? args[0] : '/chat'; win.history.state = { key: 'navigated' }; };
  const context = { AbortController, localStorage: storage, navigator: { onLine: true }, window: win, document: doc,
    Event: class { constructor(type) { this.type = type; } }, CustomEvent: class { constructor(type, extra) { this.type = type; Object.assign(this, extra); } }, console: { error() {} },
    fetch(url, init = {}) {
      const wait = deferred(), request = { ...wait, url, init, body: init.body ? JSON.parse(init.body) : undefined };
      (init.method === 'POST' ? f.posts : f.reads).push(request);
      init.signal?.addEventListener('abort', () => wait.reject(Object.assign(Error('Aborted'), { name: 'AbortError' })));
      return wait.promise;
    } };
  function load(name) {
    if (modules[name]) return modules[name];
    const exports = {};
    // Services always use the candidate shared web implementation. Baseline
    // proof selects only the old page, whose imports use the unchanged api.
    const service = fs.readFileSync(path.join(__dirname, '../src/services', name + '.ts'), 'utf8').replaceAll('import.meta.env', '({})');
    vm.runInNewContext(ts.transpileModule(service, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText,
      { ...context, exports, require: dep => load(dep.replace('./', '')) });
    return modules[name] = exports;
  }
  const page = { ...context, exports: {}, require(name) {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }) };
    if (name.startsWith('@mui/')) return new Proxy({}, { get: (_obj, key) => key });
    if (name === 'react-router-dom') return { useNavigate: () => navigate, useLocation: () => f.routerLocation || ({ ...win.location, key: win.history.state.key || 'default' }) };
    if (name.startsWith('../services/')) return load(name.replace('../services/', ''));
    throw Error(name);
  } };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, page);
  const stop = instance => { if (instance.dead) return; for (const slot of instance.slots) slot?.cleanup?.(); instance.dead = true; };
  function renderComponent(component, props, id, seen) {
    let instance = instances.get(id); if (!instance) { instance = { slots: [], cursor: 0, dead: false }; instances.set(id, instance); }
    seen.add(id); active = instance; instance.cursor = 0; const output = component(props);
    if (output && typeof output.type === 'function') return renderComponent(output.type, output.props, id + '/' + output.type.name + ':' + output.key, seen);
    return output;
  }
  f.unmount = () => { for (const instance of instances.values()) stop(instance); removed = true; f.tree = undefined; };
  f.render = () => {
    if (removed) return;
    if (win.location.pathname !== '/new-chat') return f.unmount();
    let passes = 0;
    do { dirty = false; const seen = new Set(); f.tree = renderComponent(page.exports.default, {}, 'root', seen);
      for (const [id, instance] of instances) if (!seen.has(id)) { stop(instance); instances.delete(id); }
      f.effects.splice(0).forEach(run => run()); assert.ok(++passes < 10, 'rerender loop');
    } while (dirty);
    return f.tree;
  };
  f.nodes = (type, tree = f.tree) => { const found = []; function visit(node) { if (!node || typeof node !== 'object') return; if (node.type === type) found.push(node); const children = node.props?.children; (Array.isArray(children) ? children.flat() : [children]).forEach(visit); } visit(tree); return found; };
  const text = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree) : (Array.isArray(tree) ? tree : [tree?.props?.children]).flat().map(child => child == null || typeof child === 'boolean' ? '' : text(child)).join('');
  f.text = () => text(f.tree);
  f.button = label => f.nodes('Button').find(node => text(node).trim().startsWith(label))?.props;
  f.input = () => f.nodes('TextField').find(node => node.props.label === 'Group Name')?.props;
  f.row = (name = 'Alice Baker') => f.nodes('ListItem').find(node => f.nodes('ListItemText', node).some(item => item.props.primary === name))?.props;
  f.select = (name = 'Alice Baker') => { assert.ok(f.row(name), name); f.row(name).onClick(); f.render(); };
  f.group = name => { f.button('Group').onClick(); f.render(); f.input().onChange({ target: { value: name } }); f.render(); };
  f.create = () => { const button = f.button('Start Chat') || f.button('Create Group') || f.button('Creating conversation'); assert.ok(button, f.text()); return button.onClick(); };
  f.emit = (type, extra = {}) => win.dispatchEvent({ type, ...extra });
  f.hide = () => { doc.visibilityState = 'hidden'; doc.dispatchEvent({ type: 'visibilitychange' }); };
  f.flush = async () => { await new Promise(setImmediate); f.render(); };
  f.ready = async (users = [person()]) => { await f.flush(); assert.ok(f.reads.length); f.reads.at(-1).resolve(response(200, { success: true, users })); await f.flush(); };
  f.route = (pathname = '/other', key = 'other') => { win.location.pathname = pathname; win.history.state.key = key; };
  f.replayEffects = () => { const slots = [...instances.values()].flatMap(instance => instance.slots).filter(slot => slot?.setup); slots.forEach(slot => slot.cleanup?.()); slots.forEach(slot => { slot.cleanup = slot.setup(); }); f.render(); };
  Object.assign(f, { auth: load('authSession'), creation: load('chatCreationSession'), chat: load('chatSession'), context, win, doc });
  f.render(); return f;
}

test('two same-turn direct and group clicks dispatch exactly once before React renders', async () => {
  for (const group of [false, true]) { const f = fixture(); await f.ready(); if (group) f.group('Crew'); f.select(); const submit = (f.button('Start Chat') || f.button('Create Group')).onClick;
    const a = submit(), b = submit(); assert.equal(f.posts.length, 1); f.posts[0].resolve(response(200, ack(group))); await Promise.all([a, b]); submit(); assert.equal(f.posts.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(f.navigations)), [[`/chat/${ack(group).roomId}`, { replace: true, state: { roomName: group ? 'Crew' : 'Alice Baker' } }]]);
  }
});
test('lost creation reply keeps draft and synchronously blocks all automatic or manual repeat attempts', async () => {
  const f = fixture(); await f.ready(); f.group('Crew'); f.select(); const submit = f.button('Create Group').onClick;
  submit(); f.posts[0].reject(Error('lost reply')); await f.flush(); assert.equal(f.input().value, 'Crew');
  submit(); f.emit('focus'); f.emit('online'); f.render(); f.create(); assert.equal(f.posts.length, 1); assert.equal(f.reads.length, 1); assert.match(f.text(), /may already exist/);
});
test('late create success and failure cannot navigate or update a changed account or unmounted view', async () => {
  for (const change of ['id', 'companyId', 'role', 'token', 'logout', 'aba', 'unmount']) for (const fail of [false, true]) {
    const f = fixture(); await f.ready(); f.select(); f.create();
    if (change === 'unmount') f.unmount();
    else if (change === 'logout') f.auth.clearAuthSession();
    else if (change === 'aba') { f.auth.setAuthSession('other', { ...owner, id: thirdId }); f.auth.setAuthSession('token', owner); }
    else if (change === 'token') f.storage.setItem('token', 'changed');
    else f.storage.setItem('user', JSON.stringify({ ...owner, [change]: change === 'id' ? thirdId : 'changed' }));
    const before = f.stateWrites.length;
    fail ? f.posts[0].reject(Error('late')) : f.posts[0].resolve(response(200, ack()));
    await new Promise(setImmediate); assert.equal(f.navigations.length, 0, change); assert.equal(f.stateWrites.length, before, change);
  }
});
test('back, popstate, pagehide and address/history-key changes fence results before React rerenders', async () => {
  for (const leave of ['back', 'popstate', 'pagehide', 'route', 'same-path-key']) {
    const f = fixture(); await f.ready(); f.select(); f.create();
    if (leave === 'back') f.nodes('IconButton')[0].props.onClick();
    else if (leave === 'route') f.route(); else if (leave === 'same-path-key') f.route('/new-chat', 'replacement');
    else { if (leave === 'popstate') f.route('/new-chat', 'pop-target'); f.emit(leave); }
    const before = f.stateWrites.length; f.posts[0].resolve(response(200, ack())); await new Promise(setImmediate);
    assert.equal(f.navigations.filter(args => typeof args[0] === 'string').length, 0, leave); assert.equal(f.stateWrites.length, before, leave);
  }
});
test('malformed and wrong-kind acknowledgements never navigate and remain uncertain', async () => {
  for (const group of [false, true]) for (const data of [{}, { success: 1, roomId: ack(group).roomId }, { success: false, roomId: ack(group).roomId }, { success: true, roomId: 42 },
    { success: true, roomId: 'someone-else' }, { success: true, roomId: 'group-x' }, { success: true, roomId: 'group-123-abcdefg' }, { success: true, roomId: group ? directRoom() : 'group-123-abc' }]) {
    const f = fixture(); await f.ready(); if (group) f.group('Crew'); f.select(); f.create(); f.posts[0].resolve(response(200, data)); await f.flush();
    assert.equal(f.navigations.length, 0); assert.match(f.text(), /may already exist/); f.create(); assert.equal(f.posts.length, 1);
  }
});
test('retained callbacks read current draft and edits during submission cannot change its snapshot', async () => {
  for (const change of ['recipient', 'name', 'mode']) {
    const f = fixture(); await f.ready([person(), person(thirdId, { first_name: 'Third' })]); if (change === 'name') f.group('Earlier'); f.select();
    const submit = (f.button('Start Chat') || f.button('Create Group')).onClick;
    if (change === 'recipient') f.select('Third Baker'); else if (change === 'name') { f.input().onChange({ target: { value: 'Current' } }); f.render(); }
    else { f.group('Current'); f.select('Third Baker'); }
    const row = f.row().onClick, mode = f.button('Direct').onClick, input = f.input(); submit(); row(); mode(); input?.onChange({ target: { value: 'Later' } });
    assert.equal(f.posts.length, 1);
    assert.deepEqual(f.posts[0].body, change === 'recipient' ? { userId2: thirdId } : { name: 'Current', memberIds: [change === 'name' ? personId : thirdId] });
    f.posts[0].resolve(response(200, { success: true, roomId: change === 'recipient' ? directRoom(thirdId) : 'group-123-abc' })); await f.flush();
    assert.equal(f.navigations[0][1].state.roomName, change === 'recipient' ? 'Third Baker' : 'Current');
  }
});
test('same-turn mode name and multiple selection edits are captured without waiting for React', async () => {
  const f = fixture(); await f.ready([person(), person(thirdId, { first_name: 'Third' })]); const oldRow = f.row().onClick, direct = f.button('Direct').onClick;
  f.group('Earlier'); const submit = f.button('Create Group').onClick, input = f.input(); f.row('Third Baker').onClick(); oldRow(); input.onChange({ target: { value: 'Interim' } }); input.onChange({ target: { value: 'Current' } }); submit();
  assert.deepEqual(f.posts[0].body, { name: 'Current', memberIds: [thirdId, personId] });
  f.posts[0].resolve(response(400)); await f.flush(); direct(); submit(); assert.equal(f.posts.length, 1); oldRow(); submit(); assert.equal(f.posts.length, 2); assert.deepEqual(f.posts[1].body, { userId2: personId });
});
test('group limit permits 100 submitted coworkers and rejects a 101st before dispatch', async () => {
  const f = fixture(), people = Array.from({ length: 101 }, (_, i) => person(`10000000-0000-0000-0000-${String(i).padStart(12, '0')}`, { first_name: `Person${i}` }));
  await f.ready(people); f.group('All'); for (let i = 0; i < 101; i++) f.row(`Person${i} Baker`).onClick(); f.render(); assert.match(f.text(), /no more than 100/); f.create();
  assert.equal(f.posts[0].body.memberIds.length, 100); assert.equal(f.posts[0].body.memberIds.includes(people[100].id), false);
});
test('empty selection invalid names and invalid owner never dispatch a create', async () => {
  const f = fixture(); await f.ready(); f.create(); assert.equal(f.posts.length, 0); f.group('Crew'); f.select();
  for (const name of ['', '  ', 'x'.repeat(101), 'bad\0name']) { f.input().onChange({ target: { value: name } }); f.create(); assert.equal(f.posts.length, 0); }
  for (const initialUser of [null, { ...owner, id: 'not-uuid' }]) { const invalid = fixture({ initialUser }); assert.equal(invalid.reads.length, 0); assert.match(invalid.text(), /Sign in/); }
});
test('picker handles malformed data, duplicate IDs, missing names, self and canonical UUIDs', async () => {
  for (const users of [[person('')], [person('invalid')], [null], [person(), person()], [person('ABCDEF00-0000-0000-0000-000000000002'), person('abcdef00-0000-0000-0000-000000000002')]]) {
    const f = fixture(); await f.ready(users); assert.match(f.text(), /Could not load people/); assert.equal(f.posts.length, 0);
  }
  const f = fixture(); await f.ready([person(ownerId), person('ABCDEF00-0000-0000-0000-000000000002', { first_name: null, last_name: null })]); assert.equal(f.nodes('ListItem').length, 1); f.select('Unnamed person'); f.create();
  assert.equal(f.posts[0].body.userId2, 'abcdef00-0000-0000-0000-000000000002'); f.posts[0].resolve(response(200, { success: true, roomId: directRoom(f.posts[0].body.userId2) })); await f.flush(); assert.equal(f.navigations.length, 1);
});
test('picker errors are retryable and a stale earlier read cannot replace the latest people', async () => {
  const f = fixture(); f.reads[0].reject(Error('offline')); await f.flush(); assert.match(f.text(), /Could not load people/); const retry = f.button('Try again').onClick;
  retry(); retry(); assert.equal(f.reads.length, 3); f.reads[2].resolve(response(200, { success: true, users: [person(thirdId, { first_name: 'Third' })] })); await f.flush();
  f.reads[1].resolve(response(200, { success: true, users: [person()] })); await f.flush(); assert.ok(f.row('Third Baker')); assert.equal(f.row(), undefined);
});
test('account transitions clear old picker immediately and profile-only refresh preserves its draft', async () => {
  const f = fixture(); await f.ready(); f.group('Crew'); f.select(); f.auth.updateAuthUser({ ...owner, first_name: 'New name' }); await f.flush();
  assert.equal(f.input().value, 'Crew'); assert.equal(f.reads.length, 1); f.auth.setAuthSession('other', { ...owner, id: thirdId }); await f.flush(); assert.equal(f.reads.length, 2); assert.equal(f.nodes('ListItem').length, 0);
  const g = fixture(); const old = g.reads[0]; g.auth.setAuthSession('other', { ...owner, id: thirdId }); await g.flush(); old.resolve(response(200, { success: true, users: [person()] })); await g.flush(); assert.equal(g.nodes('ListItem').length, 0);
  g.reads[1].resolve(response(200, { success: true, users: [] })); await g.flush(); assert.ok(g.nodes('ListItemText').some(node => node.props.primary === 'No other people available'));
});
test('shared auth cross-tab ABA before events fences old page handlers and replies', async () => {
  const f = fixture(); await f.ready(); f.select(); const old = f.button('Start Chat').onClick;
  const second = fixture({ sharedValues: f.values }); second.auth.setAuthSession('other', { ...owner, id: thirdId }); second.auth.setAuthSession('token', owner);
  old(); assert.equal(f.posts.length, 0); assert.equal(f.redirects.length, 0);
  const g = fixture(); await g.ready(); g.select(); g.create(); const other = fixture({ sharedValues: g.values }); other.auth.clearAuthSession(); other.auth.setAuthSession('token', owner);
  g.posts[0].resolve(response(401)); await new Promise(setImmediate); assert.equal(g.navigations.length, 0); assert.equal(g.redirects.length, 0); assert.equal(g.values.token, 'token');
});
test('backgrounding pending creation holds uncertainty across focus without navigation or retry', async () => {
  for (const suspend of ['blur', 'hidden']) { const f = fixture(); await f.ready(); f.group('Crew'); f.select(); const submit = f.button('Create Group').onClick; submit(); suspend === 'blur' ? f.emit('blur') : f.hide();
    f.posts[0].resolve(response(200, ack(true))); await f.flush(); assert.match(f.text(), /may already exist/); assert.equal(f.input().value, 'Crew'); f.emit('focus'); submit(); assert.equal(f.posts.length, 1); assert.equal(f.navigations.length, 0);
  }
});
test('StrictMode layout effect replay replaces the first read and rejects its late result', async () => {
  const f = fixture(), old = f.reads[0]; f.replayEffects(); assert.equal(f.reads.length, 2); old.resolve(response(200, { success: true, users: [person()] })); await f.flush(); assert.equal(f.nodes('ListItem').length, 0);
  f.reads[1].resolve(response(200, { success: true, users: [person(thirdId, { first_name: 'Third' })] })); await f.flush(); assert.ok(f.row('Third Baker')); f.select('Third Baker'); f.create(); assert.equal(f.posts.length, 1);
});

test('actual creation transport uses captured credentials no-store current-company route and copied body', async () => {
  const f = fixture(); assert.equal(f.reads[0].url, 'https://example.test/api/users/company'); assert.equal(f.reads[0].init.cache, 'no-store'); assert.equal(f.reads[0].init.headers.Authorization, 'Bearer token');
  await f.ready(); f.group('  Crew  '); f.select(); f.create(); assert.equal(f.posts[0].init.headers.Authorization, 'Bearer token'); assert.equal(f.posts[0].init.cache, 'no-store'); assert.deepEqual(f.posts[0].body, { name: 'Crew', memberIds: [personId] });
});
test('known precommit rejection permits deliberate retry but 500 503 network and timeout stay uncertain', async () => {
  for (const status of [400, 402, 409, 413, 415, 422, 500, 503, 'network', 'timeout', 'invalid-json']) {
    const f = fixture(); await f.ready(); f.group('Crew'); f.select(); f.create();
    if (status === 'network') f.posts[0].reject(Error('reset'));
    else if (status === 'timeout') [...f.timers.values()].forEach(run => run());
    else if (status === 'invalid-json') f.posts[0].resolve({ ...response(), json: async () => { throw Error('invalid'); } });
    else f.posts[0].resolve(response(status, { success: false }));
    await f.flush(); const uncertain = typeof status === 'string' || status >= 500;
    assert.match(f.text(), uncertain ? /may already exist/ : /Nothing was queued/); f.create(); assert.equal(f.posts.length, uncertain ? 1 : 2, String(status)); assert.equal(f.redirects.length, 0);
  }
});
test('access-denied picker and create clear private selection and disable retained callbacks without global redirects', async () => {
  for (const status of [401, 403, 404]) for (const stage of ['read', 'create']) {
    const f = fixture(); let submit;
    if (stage === 'create') { await f.ready(); f.select(); submit = f.button('Start Chat').onClick; submit(); f.posts[0].resolve(response(status)); }
    else f.reads[0].resolve(response(status));
    await f.flush(); assert.match(f.text(), /access changed/); assert.equal(f.nodes('ListItem').length, 0); submit?.(); assert.equal(f.posts.length, stage === 'create' ? 1 : 0); assert.equal(f.redirects.length, 0); assert.equal(f.values.token, 'token');
  }
});
test('offline rejection makes no request preserves selection and requires an explicit retry', async () => {
  const f = fixture(); await f.ready(); f.select(); f.context.navigator.onLine = false; f.create(); await f.flush(); assert.equal(f.posts.length, 0); assert.match(f.text(), /Nothing was queued/);
  f.context.navigator.onLine = true; f.emit('online'); f.emit('focus'); assert.equal(f.posts.length, 0); f.create(); assert.equal(f.posts.length, 1);
});
test('actual transport fences before dispatch after headers and after body for replaced auth or view', async () => {
  for (const phase of ['dispatch', 'headers', 'body']) for (const change of ['auth', 'view']) {
    const f = fixture(), body = deferred(); let current = true; const session = f.creation.openChatCreationSession(f.chat.readChatOwner(), () => current);
    const mutate = () => { if (change === 'auth') f.auth.setAuthSession('other', { ...owner, id: thirdId }); else current = false; };
    if (phase === 'dispatch') { mutate(); assert.throws(() => session.createDirect(personId), error => error.code === 'CHAT_STALE'); assert.equal(f.posts.length, 0); continue; }
    const request = session.createDirect(personId);
    if (phase === 'body') { f.posts[0].resolve({ ...response(), json: () => body.promise }); await Promise.resolve(); }
    mutate(); if (phase === 'headers') f.posts[0].resolve(response(401)); else body.resolve(ack());
    await assert.rejects(request, error => error.code === 'CHAT_STALE'); assert.equal(f.redirects.length, 0);
  }
});
test('transport validates exact recipient and name bounds before any write independent of UI', async () => {
  const f = fixture(), session = f.creation.openChatCreationSession(f.chat.readChatOwner(), () => true);
  for (const id of ['', ownerId, 'invalid']) assert.throws(() => session.createDirect(id), error => error.code === 'CHAT_NOT_SENT');
  for (const ids of [[], [personId, personId], [ownerId], Array.from({ length: 101 }, (_, i) => `10000000-0000-0000-0000-${String(i).padStart(12, '0')}`)]) assert.throws(() => session.createGroup('Crew', ids), error => error.code === 'CHAT_NOT_SENT');
  for (const name of ['', 'x'.repeat(101), 'bad\0name']) assert.throws(() => session.createGroup(name, [personId]), error => error.code === 'CHAT_NOT_SENT');
  assert.equal(f.posts.length, 0); const ids = [personId]; session.createGroup('Crew', ids); ids.push(thirdId); assert.deepEqual(f.posts[0].body.memberIds, [personId]);
});

test('retained idle submit cannot dispatch while hidden or blurred and focus alone never sends', async () => {
  for (const suspend of ['blur', 'hidden']) {
    const f = fixture(); await f.ready(); f.select(); const submit = f.button('Start Chat').onClick;
    suspend === 'blur' ? f.emit('blur') : f.hide(); submit(); assert.equal(f.posts.length, 0);
    f.doc.visibilityState = 'visible'; f.emit('focus'); assert.equal(f.posts.length, 0); submit(); assert.equal(f.posts.length, 1);
  }
});

test('at-cap group selection supports deselection and replacement without exceeding submitted limit', async () => {
  const f = fixture(), people = Array.from({ length: 101 }, (_, i) => person(`10000000-0000-0000-0000-${String(i).padStart(12, '0')}`, { first_name: `Person${i}` }));
  await f.ready(people); f.group('All'); for (let i = 0; i < 100; i++) f.row(`Person${i} Baker`).onClick();
  f.row('Person0 Baker').onClick(); f.row('Person100 Baker').onClick(); f.create();
  assert.equal(f.posts[0].body.memberIds.length, 100); assert.equal(f.posts[0].body.memberIds.includes(people[0].id), false); assert.equal(f.posts[0].body.memberIds.includes(people[100].id), true);
});
test('uncertain creation blocks retained row mode name and submit callbacks without losing draft', async () => {
  const f = fixture(); await f.ready([person(), person(thirdId, { first_name: 'Third' })]); f.group('Crew'); f.select();
  const input = f.input(), row = f.row('Third Baker').onClick, mode = f.button('Direct').onClick, submit = f.button('Create Group').onClick;
  submit(); f.posts[0].resolve(response(500)); await f.flush(); input.onChange({ target: { value: 'Other' } }); row(); mode(); submit(); f.render();
  assert.equal(f.posts.length, 1); assert.equal(f.input().value, 'Crew'); assert.ok(f.button('Create Group (1 people)')); assert.match(f.text(), /may already exist/);
});
test('BFCache return reloads an idle picker without reviving the old read or trapping Back', async () => {
  const f = fixture(), old = f.reads[0]; f.emit('pagehide'); f.emit('pageshow', { persisted: true }); assert.equal(f.reads.length, 2);
  old.resolve(response(200, { success: true, users: [person()] })); await f.flush(); assert.equal(f.nodes('ListItem').length, 0);
  f.reads[1].resolve(response(200, { success: true, users: [person(thirdId, { first_name: 'Third' })] })); await f.flush(); assert.ok(f.row('Third Baker')); assert.equal(f.posts.length, 0);
  f.nodes('IconButton')[0].props.onClick(); assert.deepEqual(JSON.parse(JSON.stringify(f.navigations)), [[-1]]);
});
test('BFCache return retains pending creation uncertainty and never accepts its delayed reply or retries', async () => {
  const f = fixture(); await f.ready(); f.group('Crew'); f.select(); const submit = f.button('Create Group').onClick; submit(); f.emit('pagehide');
  f.emit('pageshow', { persisted: true }); f.posts[0].resolve(response(200, ack(true))); await f.flush(); assert.match(f.text(), /may already exist/); assert.equal(f.input().value, 'Crew');
  submit(); assert.equal(f.posts.length, 1); assert.equal(f.reads.length, 1); assert.equal(f.navigations.length, 0); f.nodes('IconButton')[0].props.onClick(); assert.deepEqual(JSON.parse(JSON.stringify(f.navigations)), [[-1]]);
});
test('BFCache pageshow cannot revive a replaced account', async () => {
  const f = fixture(); await f.ready(); f.select(); const submit = f.button('Start Chat').onClick; f.emit('pagehide');
  f.auth.setAuthSession('other', { ...owner, id: thirdId }); f.emit('pageshow', { persisted: true }); submit(); assert.equal(f.posts.length, 0); assert.equal(f.reads.length, 1); await f.flush(); assert.equal(f.reads.length, 2);
});

test('BFCache pageshow followed by same-entry popstate preserves a usable refreshed idle picker', async () => {
  const f = fixture(); await f.ready(); f.emit('pagehide'); f.emit('pageshow', { persisted: true }); f.emit('popstate');
  assert.equal(f.reads.length, 2); f.reads[1].resolve(response(200, { success: true, users: [person(thirdId, { first_name: 'Third' })] })); await f.flush();
  assert.ok(f.row('Third Baker')); f.select('Third Baker'); f.create(); assert.equal(f.posts.length, 1); assert.equal(f.posts[0].body.userId2, thirdId);
});
test('BFCache pageshow then same-entry popstate preserves pending uncertainty and usable Back', async () => {
  const f = fixture(); await f.ready(); f.group('Crew'); f.select(); const submit = f.button('Create Group').onClick; submit();
  f.emit('pagehide'); f.emit('pageshow', { persisted: true }); f.emit('popstate'); f.posts[0].resolve(response(200, ack(true))); await f.flush();
  assert.match(f.text(), /may already exist/); assert.equal(f.input().value, 'Crew'); submit(); assert.equal(f.posts.length, 1); assert.equal(f.navigations.length, 0);
  f.nodes('IconButton')[0].props.onClick(); assert.deepEqual(JSON.parse(JSON.stringify(f.navigations)), [[-1]]);
});

test('a stale router render cannot adopt a new browser visit before its location context updates', async () => {
  const f = fixture(); await f.ready(); f.select(); const submit = f.button('Start Chat').onClick;
  f.routerLocation = { ...f.win.location, key: f.win.history.state.key }; f.route('/new-chat', 'new-entry'); f.render(); submit();
  assert.equal(f.posts.length, 0); assert.equal(f.reads.length, 1, 'old router context must not open a new picker session');
  f.routerLocation = undefined; f.render(); assert.equal(f.reads.length, 2); f.reads[1].resolve(response(200, { success: true, users: [person()] })); await f.flush();
  assert.ok(f.row()); assert.equal(f.button('Start Chat').disabled, true); f.select(); f.create(); assert.equal(f.posts.length, 1);
});
