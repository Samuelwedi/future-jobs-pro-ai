const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const root = process.env.WEB_INBOX_SOURCE_ROOT || path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/pages/ChatList.tsx'), 'utf8');
const ownerId = '00000000-0000-0000-0000-000000000001';
const personId = '00000000-0000-0000-0000-000000000002';
const thirdId = '00000000-0000-0000-0000-000000000003';
const owner = { id: ownerId, companyId: 'company', role: 'employee' };
const room = (id = 'direct/one', extra = {}) => ({ id, name: null, is_group: false, other_user_name: 'Alice Baker', ...extra });
const inbox = (rooms = [room()]) => ({ success: true, rooms });
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function response(status = 200, body = { success: true }) {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => 'application/json' }, json: async () => body, text: async () => JSON.stringify(body) };
}

// Source-loaded component, real web transport and shared auth module, controlled
// hooks/JSX and synthetic fetch. This does not claim a browser React DOM mount.
function fixture({ sharedValues, initialUser = owner, visible = true, focused = true } = {}) {
  const instances = new Map(), listeners = new Map(), documentListeners = new Map(), modules = {};
  let active, dirty = false, removed = false;
  const values = sharedValues || { token: 'token', user: JSON.stringify(initialUser) };
  const storage = { getItem: key => values[key] ?? null, setItem: (key, value) => { values[key] = value; }, removeItem: key => { delete values[key]; } };
  const f = { layout: { listHeight: 300, viewport: 600 }, values, storage, reads: [], posts: [], navigations: [], redirects: [], effects: [], stateWrites: [], scrollCalls: [], timers: new Map(), intervals: new Map() };
  const eventTarget = callbacks => ({
    addEventListener(name, fn) { if (!callbacks.has(name)) callbacks.set(name, new Set()); callbacks.get(name).add(fn); },
    removeEventListener(name, fn) { callbacks.get(name)?.delete(fn); },
    dispatchEvent(event) { for (const fn of [...callbacks.get(event.type) || []]) fn(event); },
  });
  let timer = 0;
  const win = { ...eventTarget(listeners), location: { origin: 'https://example.test', pathname: '/chat', search: '', hash: '', assign: to => f.redirects.push(to) }, history: { state: { key: 'initial' } },
    scrollY: 0, scrollX: 0, scrollTo: (...args) => f.scrollCalls.push(args),
    setTimeout: fn => { f.timers.set(++timer, fn); return timer; }, clearTimeout: id => f.timers.delete(id),
    setInterval: fn => { f.intervals.set(++timer, fn); return timer; }, clearInterval: id => f.intervals.delete(id) };
  const doc = { ...eventTarget(documentListeners), visibilityState: visible ? 'visible' : 'hidden', focused, hasFocus: () => doc.focused };
  const react = {
    useState(initial) { const instance = active, i = instance.cursor++; if (!instance.slots[i]) instance.slots[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [instance.slots[i].value, value => { assert.equal(instance.dead, false, 'state update after unmount'); instance.slots[i].value = typeof value === 'function' ? value(instance.slots[i].value) : value; f.stateWrites.push(instance.slots[i].value); dirty = true; }]; },
    useRef(initial) { const i = active.cursor++; return active.slots[i] || (active.slots[i] = { current: initial }); },
    useEffect(fn, deps) { const instance = active, i = instance.cursor++, previous = instance.slots[i];
      if (!previous || !deps || deps.some((v, n) => v !== previous.deps[n])) f.effects.push(() => { previous?.cleanup?.(); const entry = { deps, setup: fn }; instance.slots[i] = entry; entry.cleanup = fn(); }); },
  };
  react.useMemo = (fn, deps) => { const i = active.cursor++, previous = active.slots[i];
    if (!previous || deps.some((v, n) => v !== previous.deps[n])) active.slots[i] = { deps, value: fn() };
    return active.slots[i].value;
  };
  react.useCallback = (fn, deps) => react.useMemo(() => fn, deps);
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
  function commitListGeometry(tree) {
    if (!tree || typeof tree !== 'object') return;
    if (tree.type === 'Paper') {
      const nodes = [];
      function visit(node) { if (!node || typeof node !== 'object') return; nodes.push(node);
        const children = node.props?.children; (Array.isArray(children) ? children.flat() : [children]).forEach(visit);
      }
      visit(tree);
      const naturalHeight = nodes.some(node => node.type === 'List') ? f.layout.listHeight : 300;
      const reserved = nodes.map(node => node.props?.sx?.minHeight).filter(value => typeof value === 'number');
      const height = Math.max(naturalHeight, ...reserved);
      f.geometryHeight = height;
      for (const node of nodes) if (node.props?.ref) node.props.ref.current = { getBoundingClientRect: () => ({ height }) };
      // A deliberately small layout model: document scroll is clamped when
      // replacing long content with a shorter loading/empty list. This asserts
      // the production placeholder mechanism, not real browser scroll behavior.
      win.scrollY = Math.min(win.scrollY, Math.max(0, height - f.layout.viewport));
      return;
    }
    const children = tree.props?.children;
    (Array.isArray(children) ? children.flat() : [children]).forEach(commitListGeometry);
  }
  f.unmount = () => { for (const instance of instances.values()) stop(instance); removed = true; f.tree = undefined; };
  f.render = () => {
    if (removed) return;
    if (win.location.pathname !== '/chat') return f.unmount();
    let passes = 0;
    do { dirty = false; const seen = new Set(); f.tree = renderComponent(page.exports.default, {}, 'root', seen);
      for (const [id, instance] of instances) if (!seen.has(id)) { stop(instance); instances.delete(id); }
      commitListGeometry(f.tree);
      f.effects.splice(0).forEach(run => run()); assert.ok(++passes < 10, 'rerender loop');
    } while (dirty);
    return f.tree;
  };
  f.nodes = (type, tree = f.tree) => { const found = []; function visit(node) { if (!node || typeof node !== 'object') return; if (node.type === type) found.push(node); const children = node.props?.children; (Array.isArray(children) ? children.flat() : [children]).forEach(visit); } visit(tree); return found; };
  const text = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree) : (Array.isArray(tree) ? tree : [tree?.props?.children]).flat().map(child => child == null || typeof child === 'boolean' ? '' : text(child)).join('');
  f.text = () => text(f.tree);
  f.button = label => f.nodes('Button').find(node => text(node).trim().startsWith(label))?.props;
  f.input = () => f.nodes('TextField')[0]?.props;
  f.row = (name = 'Alice Baker') => f.nodes('ListItemButton').find(node => f.nodes('ListItemText', node).some(item => item.props.primary === name))?.props;
  f.refresh = () => f.nodes('Button').find(node => node.props['aria-label'] === 'Refresh conversations')?.props;
  f.query = value => { f.input().onChange({ target: { value } }); f.render(); };
  f.emit = (type, extra = {}) => win.dispatchEvent({ type, ...extra });
  f.hide = () => { doc.visibilityState = 'hidden'; doc.dispatchEvent({ type: 'visibilitychange' }); };
  f.show = () => { doc.visibilityState = 'visible'; doc.dispatchEvent({ type: 'visibilitychange' }); };
  f.blur = () => { doc.focused = false; f.emit('blur'); };
  f.focus = () => { doc.focused = true; f.emit('focus'); };
  f.flush = async () => { await new Promise(setImmediate); f.render(); };
  f.ready = async (rooms = [room()]) => { await f.flush(); assert.ok(f.reads.length); f.reads.at(-1).resolve(response(200, inbox(rooms))); await f.flush(); };
  f.remount = () => { f.unmount(); instances.clear(); removed = false; win.location.pathname = '/chat'; f.render(); };
  f.route = (pathname = '/other', key = 'other') => { win.location.pathname = pathname; win.history.state.key = key; };
  f.replayEffects = () => { const slots = [...instances.values()].flatMap(instance => instance.slots).filter(slot => slot?.setup); slots.forEach(slot => slot.cleanup?.()); slots.forEach(slot => { slot.cleanup = slot.setup(); }); f.render(); };
  Object.assign(f, { auth: load('authSession'), chat: load('chatSession'), context, win, doc });
  f.render(); return f;
}

test('inbox reads original owner credentials with no-store and preserves direct/group/search navigation', async () => {
  for (const group of [false, true]) {
    const f = fixture();
    assert.equal(f.reads[0].url, `https://example.test/api/chat/rooms/${ownerId}`);
    assert.equal(f.reads[0].init.headers.Authorization, 'Bearer token');
    assert.equal(f.reads[0].init.cache, 'no-store');
    await f.ready([room(), room('group-1', { name: 'Field Crew', is_group: true, avatar_url: 'group.png' })]);
    f.query(group ? 'CREW' : 'alice'); assert.equal(f.nodes('ListItemButton').length, 1);
    const row = f.row(group ? 'Field Crew' : 'Alice Baker'); row.onClick(); row.onClick();
    assert.deepEqual(JSON.parse(JSON.stringify(f.navigations)), [[group ? '/chat/group-1' : '/chat/direct%2Fone', { state: { roomName: group ? 'Field Crew' : 'Alice Baker' } }]]);
    assert.equal(f.posts.length, 0);
  }
});

test('switching account replaces loaded rows and search, then reads the new owner without stale callbacks', async () => {
  const f = fixture(); await f.ready(); f.query('alice');
  const oldRow = f.row(), oldRefresh = f.refresh(), oldNew = f.button('New conversation');
  f.auth.setAuthSession('other-token', { ...owner, id: thirdId, companyId: 'other' });
  oldRow.onClick(); oldRefresh.onClick(); oldNew.onClick(); assert.equal(f.navigations.length, 0); assert.equal(f.reads.length, 1);
  f.render(); assert.equal(f.nodes('ListItemButton').length, 0); assert.equal(f.input().value, ''); assert.equal(f.reads.length, 2);
  assert.equal(f.reads[1].url, `https://example.test/api/chat/rooms/${thirdId}`);
  assert.equal(f.reads[1].init.headers.Authorization, 'Bearer other-token');
  await f.ready([room('new-room', { other_user_name: 'New owner coworker' })]); assert.ok(f.row('New owner coworker')); assert.equal(f.row(), undefined);
});

test('late success or rejection never writes state after owner/company/role/token/logout/ABA/unmount changes', async () => {
  for (const change of ['id', 'companyId', 'role', 'token', 'logout', 'aba', 'unmount']) for (const fail of [false, true]) {
    const f = fixture();
    if (change === 'unmount') f.unmount();
    else if (change === 'logout') f.auth.clearAuthSession();
    else if (change === 'aba') { f.auth.setAuthSession('other', { ...owner, id: thirdId }); f.auth.setAuthSession('token', owner); }
    else if (change === 'token') f.storage.setItem('token', 'changed');
    else f.storage.setItem('user', JSON.stringify({ ...owner, [change]: change === 'id' ? thirdId : 'changed' }));
    const before = f.stateWrites.length;
    fail ? f.reads[0].reject(Error('late private failure')) : f.reads[0].resolve(response(200, inbox()));
    await new Promise(setImmediate); assert.equal(f.stateWrites.length, before, change); assert.equal(f.redirects.length, 0, change);
  }
});

test('latest refresh wins over old success, error, auth and payment statuses', async () => {
  for (const status of [200, 401, 402, 500, 'network']) {
    const f = fixture(); const old = f.reads[0]; f.refresh().onClick(); assert.equal(f.reads.length, 2);
    f.reads[1].resolve(response(200, inbox([room('new', { other_user_name: 'Newest' })]))); await f.flush(); assert.ok(f.row('Newest'));
    const before = f.stateWrites.length;
    if (status === 'network') old.reject(Error('late error')); else old.resolve(response(status, status === 200 ? inbox() : { message: 'late error' }));
    await f.flush(); assert.ok(f.row('Newest')); assert.equal(f.row(), undefined); assert.equal(f.stateWrites.length, before);
    assert.equal(f.storage.getItem('token'), 'token'); assert.equal(f.redirects.length, 0);
  }
});

test('superseded requests cannot stop loading or show an old error while latest is pending', async () => {
  const f = fixture(); f.refresh().onClick(); f.reads[0].reject(Error('old')); await f.flush();
  assert.equal(f.nodes('CircularProgress').length, 1); assert.equal(f.nodes('Alert').length, 0);
  f.reads[1].resolve(response(200, inbox([]))); await f.flush(); assert.equal(f.nodes('CircularProgress').length, 0); assert.match(f.text(), /Start your first conversation/);
});

test('JSON completion is fenced when refresh, identity, ABA or navigation changes after headers', async () => {
  for (const change of ['refresh', 'identity', 'aba', 'route']) {
    const f = fixture(), body = deferred();
    f.reads[0].resolve({ ...response(), json: () => body.promise }); await f.flush();
    if (change === 'refresh') f.refresh().onClick();
    else if (change === 'identity') f.auth.updateAuthUser({ ...owner, role: 'manager' });
    else if (change === 'aba') { f.auth.setAuthSession('other', { ...owner, id: thirdId }); f.auth.setAuthSession('token', owner); }
    else f.route();
    const before = f.stateWrites.length; body.resolve(inbox()); await new Promise(setImmediate); assert.equal(f.stateWrites.length, before, change);
  }
});

test('same-account harmless profile updates preserve rows/search and allow pending responses', async () => {
  const f = fixture(); await f.ready(); f.query('ali'); const reads = f.reads.length;
  f.auth.updateAuthUser({ ...owner, first_name: 'Updated', profile_pic: 'avatar.png' }); f.render();
  assert.equal(f.reads.length, reads); assert.equal(f.input().value, 'ali'); assert.ok(f.row());
  f.refresh().onClick(); f.auth.updateAuthUser({ ...owner, first_name: 'Again' });
  await f.ready(); assert.ok(f.row()); assert.equal(f.input().value, 'ali');
});

test('malformed or missing auth fails closed without crashing or fetching', () => {
  for (const values of [{}, { token: 'token', user: '{bad' }, { token: 'token', user: '{}' }, { user: JSON.stringify(owner) }]) {
    const f = fixture({ sharedValues: values }); assert.equal(f.reads.length, 0); assert.match(f.text(), /Sign in/);
  }
});

test('new conversation navigation fences repeated and retained inbox callbacks immediately', async () => {
  const f = fixture(); await f.ready(); const row = f.row(), refresh = f.refresh(), create = f.button('New conversation');
  create.onClick(); create.onClick(); row.onClick(); refresh.onClick();
  assert.deepEqual(JSON.parse(JSON.stringify(f.navigations)), [['/new-chat']]); assert.equal(f.reads.length, 1); assert.equal(f.posts.length, 0);
});

test('address, history visit, popstate and pagehide fence success and 401/402 before React unmounts', async () => {
  for (const leave of ['route', 'key', 'popstate', 'pagehide']) for (const status of [200, 401, 402]) {
    const f = fixture();
    if (leave === 'route') f.route();
    else if (leave === 'key') f.route('/chat', 'new-entry');
    else if (leave === 'popstate') { f.route('/chat', 'new-entry'); f.emit('popstate'); }
    else f.emit('pagehide');
    const before = f.stateWrites.length; f.reads[0].resolve(response(status, inbox())); await new Promise(setImmediate);
    assert.equal(f.stateWrites.length, before, `${leave} ${status}`); assert.equal(f.redirects.length, 0); assert.equal(f.storage.getItem('token'), 'token');
  }
});

test('stale router context cannot adopt a new browser visit before location context updates', async () => {
  const f = fixture(); await f.ready(); const row = f.row(), refresh = f.refresh();
  f.routerLocation = { ...f.win.location, key: f.win.history.state.key }; f.route('/chat', 'new-entry'); f.render();
  row.onClick(); refresh.onClick(); assert.equal(f.navigations.length, 0); assert.equal(f.reads.length, 1);
  f.routerLocation = undefined; f.render(); assert.equal(f.reads.length, 2); assert.equal(f.nodes('ListItemButton').length, 0);
  await f.ready(); assert.ok(f.row());
});

test('background/blur fences pending reads and callbacks; foreground refreshes once and retains same-owner search', async () => {
  for (const kind of ['visibility', 'blur']) {
    const f = fixture(); await f.ready(); f.query('alice'); const row = f.row(), refresh = f.refresh(), create = f.button('New conversation');
    f.refresh().onClick(); const stale = f.reads[1]; kind === 'visibility' ? f.hide() : f.blur(); f.render();
    row.onClick(); refresh.onClick(); create.onClick(); assert.equal(f.navigations.length, 0); assert.equal(f.reads.length, 2); assert.equal(f.nodes('ListItemButton').length, 0);
    kind === 'visibility' ? f.show() : f.focus(); f.emit('focus'); f.render(); assert.equal(f.reads.length, 3); assert.equal(f.input().value, 'alice');
    stale.resolve(response(200, inbox([room('old', { other_user_name: 'Alice stale' })]))); await f.flush(); assert.equal(f.row('Alice stale'), undefined);
    await f.ready(); assert.ok(f.row());
  }
});

test('initial hidden or unfocused page performs no read until usable foreground', async () => {
  for (const options of [{ visible: false }, { focused: false }]) {
    const f = fixture(options); assert.equal(f.reads.length, 0); f.refresh().onClick(); f.button('New conversation').onClick(); assert.equal(f.reads.length, 0); assert.equal(f.navigations.length, 0);
    f.show(); f.focus(); assert.equal(f.reads.length, 1); await f.ready(); assert.ok(f.row());
  }
});

test('BFCache pageshow and same-entry popstate replace pre-pagehide reads without reviving them', async () => {
  const f = fixture(); const old = f.reads[0]; f.emit('pagehide'); f.emit('focus'); assert.equal(f.reads.length, 1);
  f.emit('pageshow', { persisted: true }); f.emit('popstate'); f.emit('focus'); assert.equal(f.reads.length, 2);
  await f.ready([room('fresh', { other_user_name: 'Fresh' })]); old.resolve(response(200, inbox())); await f.flush(); assert.ok(f.row('Fresh')); assert.equal(f.row(), undefined);
  f.row('Fresh').onClick(); assert.equal(f.navigations.length, 1);
});

test('BFCache restore after account replacement or logout cannot expose the prior rows', async () => {
  for (const logout of [false, true]) {
    const f = fixture(); await f.ready(); f.emit('pagehide');
    if (logout) f.auth.clearAuthSession(); else f.auth.setAuthSession('other', { ...owner, id: thirdId });
    f.emit('pageshow', { persisted: true }); f.emit('popstate'); f.render(); assert.equal(f.nodes('ListItemButton').length, 0);
    assert.equal(f.reads.length, logout ? 1 : 2); if (logout) assert.match(f.text(), /Sign in/); else assert.equal(f.reads[1].init.headers.Authorization, 'Bearer other');
  }
});

test('StrictMode effect replay and true remount never adopt reads from the old lifecycle', async () => {
  for (const replay of [false, true]) {
    const f = fixture(); const old = f.reads[0]; replay ? f.replayEffects() : f.remount(); assert.equal(f.reads.length, 2);
    await f.ready([room('fresh', { other_user_name: 'Fresh' })]); const before = f.stateWrites.length;
    old.resolve(response(200, inbox())); await f.flush(); assert.equal(f.stateWrites.length, before); assert.ok(f.row('Fresh')); assert.equal(f.row(), undefined);
  }
});

test('current access denials clear old rooms and disable stale actions without generic redirects', async () => {
  for (const status of [401, 403, 404]) {
    const f = fixture(); await f.ready(); const oldRow = f.row(); f.refresh().onClick(); f.reads[1].resolve(response(status, { message: 'private error' })); await f.flush();
    assert.equal(f.nodes('ListItemButton').length, 0); assert.match(f.text(), /access to messages changed/); assert.match(f.text(), /Conversations unavailable/);
    assert.equal(f.refresh().disabled, true); assert.equal(f.button('New conversation').disabled, true); oldRow.onClick(); f.refresh().onClick();
    assert.equal(f.navigations.length, 0); assert.equal(f.reads.length, 2); assert.equal(f.redirects.length, 0); assert.equal(f.storage.getItem('token'), 'token');
  }
});

test('failed, malformed and partial room replies remain distinct from an empty inbox and permit explicit retry', async () => {
  for (const body of [{ success: false, rooms: [] }, { success: true, rooms: {} }, inbox([room(), room()]), inbox([room(), null]), inbox([room('bad', { is_group: 'false' })])]) {
    const f = fixture(); f.reads[0].resolve(response(200, body)); await f.flush(); assert.equal(f.nodes('ListItemButton').length, 0); assert.match(f.text(), /Conversations could not be loaded/); assert.match(f.text(), /Conversations unavailable/);
    f.refresh().onClick(); await f.ready([]); assert.match(f.text(), /Start your first conversation/);
  }
});

test('network, timeout, and payment failures are local and cannot redirect or leak server error text', async () => {
  for (const kind of ['network', 'timeout', 'payment']) {
    const f = fixture();
    if (kind === 'network') f.reads[0].reject(Error('private server detail'));
    else if (kind === 'timeout') [...f.timers.values()].forEach(fn => fn());
    else f.reads[0].resolve(response(402, { message: 'private server detail' }));
    await f.flush(); assert.match(f.text(), /Conversations could not be loaded/); assert.doesNotMatch(f.text(), /private server/); assert.equal(f.redirects.length, 0);
    f.refresh().onClick(); await f.ready(); assert.ok(f.row()); assert.equal(f.timers.size, 0);
  }
});

test('cross-tab ABA persisted generation fences before storage events and refreshes after them', async () => {
  const sharedValues = { token: 'token', user: JSON.stringify(owner) }; const a = fixture({ sharedValues }), b = fixture({ sharedValues });
  const oldMarker = a.storage.getItem('auth-generation'); b.auth.setAuthSession('other', { ...owner, id: thirdId }); b.auth.setAuthSession('token', owner);
  const before = a.stateWrites.length; a.reads[0].resolve(response(200, inbox())); await new Promise(setImmediate); assert.equal(a.stateWrites.length, before);
  a.emit('storage', { storageArea: a.storage, key: 'auth-generation', oldValue: oldMarker, newValue: a.storage.getItem('auth-generation') }); a.render(); assert.equal(a.reads.length, 2);
  await a.ready([room('new', { other_user_name: 'New generation' })]); assert.ok(a.row('New generation'));
});

test('cross-tab same-identity profile storage events do not reset rows or current requests', async () => {
  const f = fixture(); await f.ready(); f.query('ali'); const oldValue = f.storage.getItem('user'), newValue = JSON.stringify({ ...owner, first_name: 'Changed' });
  f.storage.setItem('user', newValue); f.emit('storage', { storageArea: f.storage, key: 'user', oldValue, newValue }); f.render();
  assert.equal(f.reads.length, 1); assert.ok(f.row()); assert.equal(f.input().value, 'ali');
});

test('old rendered room cannot navigate after refreshed membership removes it', async () => {
  const f = fixture(); await f.ready(); const old = f.row(); f.refresh().onClick(); await f.ready([]); old.onClick(); assert.equal(f.navigations.length, 0);
});

test('inbox transport captures an immutable owner path and token and preserves legacy support transport', async () => {
  const f = fixture(); const captured = { ...owner, token: 'token' }; const session = f.chat.openChatInboxSession(captured, () => true);
  captured.id = thirdId; captured.token = 'wrong'; const read = session.readRooms(); assert.equal(f.reads[1].url, `https://example.test/api/chat/rooms/${ownerId}`); assert.equal(f.reads[1].init.headers.Authorization, 'Bearer token');
  f.reads[1].resolve(response(200, inbox())); await read;
  const support = f.chat.openChatSession('support-ticket-one', f.chat.readChatOwner(), () => true); const send = support.sendSupportMessage('Help');
  assert.equal(f.posts[0].url, 'https://example.test/api/chat/message'); assert.equal(f.posts[0].body.roomId, 'support-ticket-one'); f.posts[0].resolve(response()); await send;
});

test('rapid Back/Forward to the original visit before a React commit refreshes instead of remaining stuck', async () => {
  const f = fixture(), old = f.reads[0]; f.route('/other', 'elsewhere'); f.emit('popstate');
  f.route('/chat', 'initial'); f.emit('popstate'); f.render(); assert.equal(f.reads.length, 2);
  old.resolve(response(200, inbox([room('old', { other_user_name: 'Old' })]))); await f.flush(); assert.equal(f.row('Old'), undefined);
  await f.ready([room('fresh', { other_user_name: 'Fresh' })]); assert.ok(f.row('Fresh')); f.row('Fresh').onClick(); assert.equal(f.navigations.length, 1);
});

test('dismissing a local load error does not misrepresent it as an empty inbox', async () => {
  const f = fixture(); f.reads[0].reject(Error('offline')); await f.flush(); f.nodes('Alert')[0].props.onClose(); f.render();
  assert.match(f.text(), /Conversations unavailable/); assert.doesNotMatch(f.text(), /Start your first conversation/);
});

test('long inbox retains measured geometry across refresh, blur and BFCache without forced scroll restoration', async () => {
  for (const event of ['refresh', 'blur', 'pagehide']) {
    const f = fixture(); await f.ready(); f.layout.listHeight = 2400; f.render(); f.win.scrollY = 1500;
    if (event === 'refresh') f.refresh().onClick(); else if (event === 'blur') f.blur(); else f.emit('pagehide');
    f.layout.listHeight = 300; f.render(); assert.equal(f.geometryHeight, 2400, event); assert.equal(f.win.scrollY, 1500, event); assert.equal(f.nodes('ListItemButton').length, 0);
    if (event === 'blur') f.focus(); else if (event === 'pagehide') { f.emit('pageshow', { persisted: true }); f.emit('popstate'); }
    f.render(); assert.equal(f.geometryHeight, 2400); assert.equal(f.win.scrollY, 1500);
    // Deliberate user movement during loading must not be undone by completion.
    f.win.scrollY = 900; f.layout.listHeight = 2400; await f.ready(); assert.equal(f.win.scrollY, 900); assert.equal(f.scrollCalls.length, 0); assert.ok(f.row());
  }
});

test('measured list geometry cannot carry across account/company/role/token/generation or router visit replacement', async () => {
  for (const change of ['id', 'companyId', 'role', 'token', 'generation', 'visit']) {
    const f = fixture(); await f.ready(); f.layout.listHeight = 2600; f.render(); f.win.scrollY = 1700;
    f.blur(); f.layout.listHeight = 300; f.render(); assert.equal(f.geometryHeight, 2600);
    if (change === 'visit') f.route('/chat', 'fresh-visit');
    else if (change === 'token') f.auth.setAuthSession('new-token', owner);
    else if (change === 'generation') f.auth.setAuthSession('token', owner);
    else f.auth.updateAuthUser({ ...owner, [change]: change === 'id' ? thirdId : 'changed' });
    f.focus(); f.render(); assert.equal(f.geometryHeight, 300, change); assert.equal(f.win.scrollY, 0, change); assert.equal(f.nodes('ListItemButton').length, 0); assert.equal(f.scrollCalls.length, 0);
  }
});

test('private count badges remain own-only, accessible and unknown on old servers, with explicit exact99 versus99+',async()=>{
 const scoped={...owner,companyId:'00000000-0000-4000-a000-000000000123'};
 const state=(n,capped=false)=>({success:true,viewState:{actorId:scoped.id,companyId:scoped.companyId,historyPolicy:'unmarked_until_viewed',rooms:[{roomId:'direct/one',membershipInstanceId:'00000000-0000-4000-a000-000000000456',unviewedCount:n,unviewedCountCapped:capped}]}});
 for(const mode of ['exact','capped','missing','unsupported','malformed']){
  const f=fixture({initialUser:scoped});await f.ready();assert.equal(f.reads.length,2);assert.match(f.reads[1].url,/\/api\/chat\/views\?/);assert(f.nodes('Chip').some(n=>n.props['aria-label']==='Messages not marked read: unavailable'));
  const data=mode==='missing'?{...state(0),viewState:{...state(0).viewState,rooms:[]}}:mode==='malformed'?state(1,true):state(99,mode==='capped');f.reads[1].resolve(response(mode==='unsupported'?404:200,data));await f.flush();
  assert(f.nodes('Chip').some(n=>n.props['aria-label']==='Messages not marked read: '+(mode==='exact'?'99':mode==='capped'?'99+':'unavailable')));assert.equal(f.posts.length,0);assert.equal(f.navigations.length,0);f.unmount();
 }
});
test('private count refresh cannot cross auth/foreground or an ignored commit invalidation',async()=>{
 const scoped={...owner,companyId:'00000000-0000-4000-a000-000000000123'};
 for(const change of ['blur','auth','commit']){const f=fixture({initialUser:scoped});await f.ready();const pending=f.reads[1];if(change==='blur')f.blur();if(change==='auth')f.auth.setAuthSession('other',{...scoped,id:thirdId});if(change==='commit')f.emit('chat-views-invalidated');pending.resolve(response(200,{success:true,viewState:{actorId:scoped.id,companyId:scoped.companyId,historyPolicy:'unmarked_until_viewed',rooms:[{roomId:'direct/one',membershipInstanceId:'00000000-0000-4000-a000-000000000456',unviewedCount:0,unviewedCountCapped:false}]}}));await f.flush();assert(!f.nodes('Chip').some(n=>n.props['aria-label']==='Messages not marked read: 0'));f.unmount();}
});
