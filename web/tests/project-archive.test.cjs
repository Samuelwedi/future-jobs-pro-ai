const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const root = process.env.WEB_PROJECTS_SOURCE_ROOT || path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/pages/Projects.tsx'), 'utf8');
const ownerId = '00000000-0000-0000-0000-000000000001';
const thirdId = '00000000-0000-0000-0000-000000000003';
const owner = { id: ownerId, companyId: 'company', role: 'manager' };
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
  const f = { values, storage, reads: [], posts: [], confirmations: [], confirm: true, navigations: [], redirects: [], effects: [], stateWrites: [], timers: new Map(), intervals: new Map() };
  const eventTarget = callbacks => ({
    addEventListener(name, fn) { if (!callbacks.has(name)) callbacks.set(name, new Set()); callbacks.get(name).add(fn); },
    removeEventListener(name, fn) { callbacks.get(name)?.delete(fn); },
    dispatchEvent(event) { for (const fn of [...callbacks.get(event.type) || []]) fn(event); },
  });
  let timer = 0;
  const win = { ...eventTarget(listeners), confirm: text => { f.confirmations.push(text); return typeof f.confirm === 'function' ? f.confirm() : f.confirm; }, location: { origin: 'https://example.test', pathname: '/projects', search: '', hash: '', assign: to => f.redirects.push(to) }, history: { state: { key: 'initial' } },
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
  react.useMemo = (fn, deps) => { const i = active.cursor++, old = active.slots[i]; if (!old || deps.some((v,n) => v !== old.deps[n])) active.slots[i] = { deps, value: fn() }; return active.slots[i].value; };
  react.useCallback = (fn, deps) => react.useMemo(() => fn, deps);
  const navigate = (...args) => { f.navigations.push(args); win.location.pathname = typeof args[0] === 'string' ? args[0] : '/chat'; win.history.state = { key: 'navigated' }; };
  const context = { AbortController, localStorage: storage, navigator: { onLine: true }, window: win, document: doc,
    Event: class { constructor(type) { this.type = type; } }, CustomEvent: class { constructor(type, extra) { this.type = type; Object.assign(this, extra); } }, console: { error() {} },
    fetch(url, init = {}) {
      const wait = deferred(), request = { ...wait, url, init, body: init.body ? JSON.parse(init.body) : undefined };
      (['POST', 'PUT', 'DELETE'].includes(init.method) ? f.posts : f.reads).push(request);
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
    if (win.location.pathname !== '/projects') return f.unmount();
    let passes = 0;
    do { dirty = false; const seen = new Set(); f.tree = renderComponent(page.exports.default, {}, 'root', seen);
      for (const [id, instance] of instances) if (!seen.has(id)) { stop(instance); instances.delete(id); }
      f.effects.splice(0).forEach(run => run()); assert.ok(++passes < 10, 'rerender loop');
    } while (dirty);
    return f.tree;
  };
  f.nodes = (type, tree = f.tree) => { const found = []; function visit(node) { if (!node || typeof node !== 'object') return; if (node.type === type) found.push(node); const children = [node.props?.children, node.props?.action]; (Array.isArray(children) ? children.flat(Infinity) : [children]).forEach(visit); } visit(tree); return found; };
  const text = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree) : (Array.isArray(tree) ? tree : [tree?.type === 'Chip' ? tree.props.label : tree?.type === 'Snackbar' ? tree.props.message : tree?.props?.children]).flat().map(child => child == null || typeof child === 'boolean' ? '' : text(child)).join('');
  f.text = () => text(f.tree);
  f.button = label => f.nodes('Button').find(node => text(node).trim().startsWith(label))?.props;
  f.input = label => f.nodes('TextField').find(node => node.props.label === label)?.props;
  f.icon = label => f.nodes('IconButton').find(node => node.props['aria-label'] === label)?.props;
  f.action = (label, id) => f.nodes('Grid').find(node => node.key === id && f.nodes('IconButton', node).length)?.props;
  f.change = (label, value) => { f.input(label).onChange({ target: { value } }); f.render(); };
  f.archive = () => { assert.ok(f.icon('Archive project'), f.text()); return f.icon('Archive project').onClick(); };
  f.restore = () => { assert.ok(f.icon('Restore project'), f.text()); return f.icon('Restore project').onClick(); };
  f.view = archived => { const control = f.button(archived ? 'Archived projects' : 'Unarchived projects'); assert.ok(control, 'Archive view control must exist'); control.onClick(); f.render(); };
  f.refresh = () => { f.icon('Refresh projects').onClick(); f.render(); };
  f.emit = (type, extra = {}) => win.dispatchEvent({ type, ...extra });
  f.hide = () => { doc.visibilityState = 'hidden'; doc.dispatchEvent({ type: 'visibilitychange' }); };
  f.flush = async () => { await new Promise(setImmediate); f.render(); };
  f.ready = async (projects = [project()]) => { await f.flush(); assert.ok(f.reads.length); f.reads.at(-1).resolve(response(200, { success: true, projects })); await f.flush(); };
  f.route = (pathname = '/other', key = 'other') => { win.location.pathname = pathname; win.history.state.key = key; };
  f.replayEffects = () => { const slots = [...instances.values()].flatMap(instance => instance.slots).filter(slot => slot?.setup); slots.forEach(slot => slot.cleanup?.()); slots.forEach(slot => { slot.cleanup = slot.setup(); }); f.render(); };
  Object.assign(f, { auth: load('authSession'), projects: load('projectSession'), context, win, doc });
  f.render(); return f;
}


function project(extra = {}) { return { id: 'project-1', name: 'Tower', status: 'completed', archived_at: null, ...extra }; }
const archived = extra => project({ archived_at: '2026-11-11T12:00:00Z', ...extra });
const result = row => response(200, { success: true, project: row });
const list = rows => response(200, { success: true, projects: rows });
async function reconcile(f, open, archivedRows) {
  const latest = f.reads.slice(-2);
  assert.equal(latest.length, 2);
  for (const request of latest) request.resolve(list(request.url.endsWith('archived=true') ? archivedRows : open));
  await f.flush();
}

test('archived view and confirmed restore preserve completion, workspace access and status/search filters', async () => {
  const f = fixture(); await f.ready([project()]);
  assert.match(f.text(), /Completed/); f.view(true);
  assert.match(f.reads.at(-1).url, /archived=true$/); f.reads.at(-1).resolve(list([archived()])); await f.flush();
  assert.ok(f.icon('Restore project')); assert.equal(f.icon('Archive project'), undefined);
  assert.match(f.text(), /ArchivedCompleted/);
  f.restore(); assert.equal(f.posts.length, 1); assert.match(f.posts[0].url, /project-1\/restore$/); assert.equal(f.posts[0].init.method, 'POST');
  assert.match(f.confirmations[0], /Restore.*completion status/);
  f.posts[0].resolve(result(project())); await f.flush();
  assert.match(f.text(), /Project restored/); f.reads.at(-1).resolve(list([])); await f.flush(); assert.match(f.text(), /No archived projects/);
  f.view(false); f.reads.at(-1).resolve(list([project()])); await f.flush();
  f.button('Open workspace').onClick(); assert.deepEqual(JSON.parse(JSON.stringify(f.navigations)), [['/media/project/project-1']]);
});
test('roles retain exact backend allowlist and read-only employees/owners can browse archives without creation guidance', async () => {
  for (const role of ['boss','manager','admin','owner','employee','worker','unknown']) {
    const f = fixture({ initialUser: { ...owner, role } }); await f.ready([]);
    assert.equal(!!f.button('New project'), ['boss','manager','admin'].includes(role), role);
    if (['owner','employee','worker','unknown'].includes(role)) { assert.match(f.text(), /Ask a boss, manager or admin/); assert.doesNotMatch(f.text(), /Create your first/); }
    f.view(true); f.reads.at(-1).resolve(list([archived()])); await f.flush();
    assert.equal(!!f.icon('Restore project'), ['boss','manager','admin'].includes(role), role);
    assert.ok(f.button('Open workspace'));
  }
});
test('archive is reversible DELETE, duplicate same-turn clicks confirm and dispatch only once', async () => {
  const f = fixture(); await f.ready(); const run = f.icon('Archive project').onClick;
  run(); run(); assert.equal(f.posts.length, 1); assert.equal(f.confirmations.length, 1);
  assert.equal(f.posts[0].init.method, 'DELETE'); assert.equal(f.posts[0].body, undefined); assert.match(f.confirmations[0], /restore it later.*completion status/);
  f.posts[0].resolve(result(archived())); await f.flush(); assert.match(f.text(), /Project archived/);
  run(); assert.equal(f.posts.length, 1); f.reads.at(-1).resolve(list([])); await f.flush();
});
test('cancel and offline never dispatch a mutation', async () => {
  const f = fixture(); await f.ready(); f.confirm = false; f.archive(); assert.equal(f.posts.length, 0);
  f.confirm = true; f.context.navigator.onLine = false; f.archive(); await f.flush(); assert.equal(f.posts.length, 0); assert.match(f.text(), /offline/);
});
test('older refreshes and archive-view responses cannot overwrite newer lists', async () => {
  const f = fixture(); await f.ready(); f.refresh(); const old = f.reads.at(-1); f.refresh(); const fresh = f.reads.at(-1);
  fresh.resolve(list([project({ name: 'Newest' })])); await f.flush(); old.resolve(list([project({ name: 'Old' })])); await f.flush();
  assert.match(f.text(), /Newest/); assert.doesNotMatch(f.text(), /Old/);
  f.refresh(); const beforeView = f.reads.at(-1); f.view(true); f.reads.at(-1).resolve(list([archived({ name: 'Archive only' })])); await f.flush();
  beforeView.resolve(list([project({ name: 'Unarchived stale' })])); await f.flush(); assert.match(f.text(), /Archive only/); assert.doesNotMatch(f.text(), /Unarchived stale/);
});
test('search and status empty states differ from an actually empty archive, and list failures do not claim emptiness', async () => {
  const f = fixture(); await f.ready();
  f.nodes('TextField').find(n => n.props.placeholder)?.props.onChange({ target: { value: 'missing' } }); f.render(); assert.match(f.text(), /No matching projects.*Try another search/);
  f.nodes('TextField').find(n => n.props.placeholder)?.props.onChange({ target: { value: '' } }); f.render();
  f.nodes('Select').find(n => n.props.label === 'Status').props.onChange({ target: { value: 'active' } }); f.render(); assert.match(f.text(), /No matching projects/);
  f.refresh(); f.reads.at(-1).reject(Error('network lost')); await f.flush(); assert.match(f.text(), /project list is unavailable/); assert.doesNotMatch(f.text(), /No projects yet/);
});
test('timeout after commit reconciles current state honestly without replaying or changing completion', async () => {
  for (const restore of [false,true]) {
    const f = fixture(); await f.ready(restore ? [] : [project()]);
    if (restore) { f.view(true); f.reads.at(-1).resolve(list([archived()])); await f.flush(); f.restore(); } else f.archive();
    f.posts[0].reject(Error('reply lost after COMMIT')); await f.flush(); assert.equal(f.posts.length, 1);
    assert.match(f.text(), /unconfirmed/); await reconcile(f, restore ? [project()] : [], restore ? [] : [archived()]);
    assert.match(f.text(), /Current state confirmed/); assert.doesNotMatch(f.text(), /earlier request is still unconfirmed/); assert.equal(f.posts.length, 1);
  }
});
test('unconfirmed mutation with unchanged state remains blocked; explicit checks never replace its intent', async () => {
  const f = fixture(); await f.ready(); const stale = f.icon('Archive project').onClick; f.archive(); f.posts[0].reject(Error('timeout')); await f.flush();
  await reconcile(f, [project()], []); assert.match(f.text(), /currently not archived.*earlier request is still unconfirmed/);
  stale(); f.button('New project').onClick(); assert.equal(f.posts.length, 1); assert.equal(f.nodes('Dialog')[0].props.open, false);
  f.button('Check current state').onClick(); await reconcile(f, [], [archived()]); assert.match(f.text(), /Current state confirmed/); assert.equal(f.posts.length, 1);
});
test('malformed/wrong-project/wrong-state successful responses reconcile rather than claiming success', async () => {
  for (const data of [{}, { success: false }, { success: true, project: archived({ id: 'other' }) }, { success: true, project: project() }]) {
    const f = fixture(); await f.ready(); f.archive(); f.posts[0].resolve(response(200,data)); await f.flush(); assert.match(f.text(), /unconfirmed/);
    await reconcile(f, [project()], []); assert.doesNotMatch(f.text(), /Project archived/); assert.equal(f.posts.length,1);
  }
});
test('reconciliation failures and missing/contradictory projects never infer success from disappearance', async () => {
  for (const state of ['missing','duplicate','error']) {
    const f = fixture(); await f.ready(); f.archive(); f.posts[0].reject(Error('lost')); await f.flush();
    if (state === 'error') { f.reads.at(-2).reject(Error('network lost')); f.reads.at(-1).resolve(list([])); await f.flush(); }
    else await reconcile(f, state === 'duplicate' ? [project()] : [], state === 'duplicate' ? [archived()] : []);
    assert.match(f.text(), /unconfirmed/); assert.doesNotMatch(f.text(), /Current state confirmed/); assert.equal(f.posts.length,1);
  }
});
test('current 403 removes scoped content and draft; current 402 explains billing without redirect', async () => {
  for (const status of [403,402]) {
    const f = fixture(); await f.ready(); f.archive(); f.posts[0].resolve(response(status,{ message: 'denied' })); await f.flush();
    assert.equal(f.redirects.length,0); assert.equal(f.posts.length,1);
    if (status === 403) { assert.doesNotMatch(f.text(), /Tower/); assert.equal(f.button('New project'), undefined); assert.match(f.text(), /access changed/); }
    else assert.match(f.text(), /active subscription/);
  }
});
test('retained handlers and pending reads/writes are fenced on account, company, role, token, logout, ABA and unmount', async () => {
  for (const change of ['id','companyId','role','token','logout','aba','unmount']) for (const status of [200,401,402]) {
    const f = fixture(); await f.ready(); const archive = f.icon('Archive project').onClick, workspace = f.button('Open workspace').onClick;
    f.archive();
    if (change === 'unmount') f.unmount();
    else if (change === 'logout') f.auth.clearAuthSession();
    else if (change === 'aba') { f.auth.setAuthSession('other',{ ...owner, id: thirdId }); f.auth.setAuthSession('token',owner); }
    else if (change === 'token') f.storage.setItem('token','changed');
    else f.storage.setItem('user',JSON.stringify({ ...owner, [change]: 'changed' }));
    const before = f.stateWrites.length; archive(); workspace(); f.posts[0].resolve(response(status,{ success:true, project:archived() })); await new Promise(setImmediate);
    assert.equal(f.posts.length,1,change); assert.equal(f.navigations.length,0,change); assert.equal(f.redirects.length,0,change); assert.equal(f.stateWrites.length,before,change);
  }
});
test('new owner remount clears search, old records and drafts and uses new immutable credentials', async () => {
  const f = fixture(); await f.ready(); f.button('New project').onClick(); f.render(); f.change('Project name','Private old draft');
  f.auth.setAuthSession('new-token', { ...owner, companyId:'new-company' }); f.render();
  assert.doesNotMatch(f.text(), /Tower/); assert.equal(f.nodes('Dialog')[0].props.open,false); assert.equal(f.input('Project name').value,'');
  assert.equal(f.reads.at(-1).init.headers.Authorization,'Bearer new-token'); f.reads.at(-1).resolve(list([project({name:'New company'})])); await f.flush(); assert.match(f.text(),/New company/);
});
test('navigation and same-path history changes block response effects, redirects and old workspace links', async () => {
  for (const leave of ['route','same-path-key','popstate','workspace']) {
    const f = fixture(); await f.ready(); const open = f.button('Open workspace').onClick; f.archive();
    if (leave === 'route') f.route(); else if (leave === 'same-path-key') f.route('/projects','replacement'); else if (leave === 'popstate') { f.route('/projects','back'); f.emit('popstate'); } else open();
    const before = f.stateWrites.length, moves = f.navigations.length; open(); f.posts[0].resolve(response(402,{})); await new Promise(setImmediate);
    assert.equal(f.stateWrites.length,before,leave); assert.equal(f.navigations.length,moves,leave); assert.equal(f.redirects.length,0,leave);
  }
});
test('BFCache restore reconciles an interrupted archive once and ignores its old response', async () => {
  const f = fixture(); await f.ready(); f.archive(); f.emit('pagehide'); const writes = f.stateWrites.length;
  f.posts[0].resolve(result(archived())); await new Promise(setImmediate); assert.equal(f.stateWrites.length,writes);
  f.emit('pageshow',{persisted:true}); f.render(); assert.equal(f.posts.length,1); await reconcile(f,[],[archived()]); assert.match(f.text(), /Current state confirmed/);
  f.emit('popstate'); assert.equal(f.posts.length,1);
});
test('create/edit locks synchronous saves and preserves fields typed after submission', async () => {
  for (const edit of [false,true]) {
    const f = fixture(); await f.ready(); (edit ? f.icon('Edit project') : f.button('New project')).onClick(); f.render();
    f.change('Project name','Submitted'); const save = f.button('Save project').onClick; save(); save(); assert.equal(f.posts.length,1);
    assert.equal(f.posts[0].init.method,edit ? 'PUT' : 'POST'); assert.equal(f.posts[0].body.name,'Submitted');
    f.change('Project name','Newer draft'); f.posts[0].resolve(result(project({name:'Submitted'}))); await f.flush();
    assert.equal(f.nodes('Dialog')[0].props.open,true); assert.equal(f.input('Project name').value,'Newer draft');
  }
});
test('uncertain create keeps draft and forbids duplicate automatic/manual saves', async () => {
  const f = fixture(); await f.ready(); f.button('New project').onClick(); f.render(); f.change('Project name','Keep me'); const save = f.button('Save project').onClick;
  save(); f.posts[0].reject(Error('lost')); await f.flush(); save(); assert.equal(f.posts.length,1); assert.equal(f.input('Project name').value,'Keep me'); assert.match(f.text(),/Save not confirmed/);
});

test('pending list bodies cannot repopulate a changed owner and malformed archived listings fail closed', async () => {
  const f = fixture(), body = deferred(); f.reads[0].resolve({ ...response(), json: () => body.promise }); await new Promise(setImmediate);
  f.auth.setAuthSession('new', { ...owner, companyId:'new' }); f.render(); const before = f.stateWrites.length;
  body.resolve({ success:true, projects:[project({name:'Old secret'})] }); await new Promise(setImmediate); assert.equal(f.stateWrites.length,before); assert.doesNotMatch(f.text(), /Old secret/);
  for (const data of [{success:true,projects:[project({archived_at:undefined})]}, {success:true,projects:[archived()]}, {success:true,projects:[project(),project()]}, {success:false,projects:[]}]) {
    const g = fixture(); g.reads[0].resolve(response(200,data)); await g.flush(); assert.match(g.text(), /could not be verified/); assert.equal(g.icon('Archive project'),undefined);
  }
});
test('real transport abort callback reconciles after timeout and delayed bodies remain fenced', async () => {
  const f = fixture(); await f.ready(); f.archive(); assert.equal(f.timers.size,1);
  [...f.timers.values()][0](); await f.flush(); assert.equal(f.posts.length,1); await reconcile(f,[],[archived()]); assert.match(f.text(),/Current state confirmed/);
  const g = fixture(); await g.ready(); g.archive(); const body=deferred(); g.posts[0].resolve({...response(),json:()=>body.promise}); await new Promise(setImmediate);
  g.auth.clearAuthSession(); const before=g.stateWrites.length; body.resolve({success:true,project:archived()}); await new Promise(setImmediate); assert.equal(g.stateWrites.length,before); assert.equal(g.redirects.length,0);
});
test('Strict Mode effect replay ignores pre-cleanup loads and preserves a usable scoped page', async () => {
  const f=fixture(); const first=f.reads[0]; f.replayEffects(); assert.equal(f.reads.length,2);
  f.reads[1].resolve(list([project({name:'New load'})])); await f.flush(); first.resolve(list([project({name:'Old load'})])); await f.flush(); assert.match(f.text(),/New load/); assert.doesNotMatch(f.text(),/Old load/);
  f.archive(); assert.equal(f.posts.length,1);
});
test('cross-tab transient ABA storage events fence retained workspace and mutation callbacks', async () => {
  const f=fixture(); await f.ready(); const open=f.button('Open workspace').onClick, archive=f.icon('Archive project').onClick;
  f.emit('storage',{storageArea:f.storage,key:'auth-generation',oldValue:'old',newValue:'temporary'});
  f.emit('storage',{storageArea:f.storage,key:'auth-generation',oldValue:'temporary',newValue:'old'});
  open(); archive(); assert.equal(f.navigations.length,0); assert.equal(f.posts.length,0);
});

test('confirmed creation binds newer draft edits to the created ID before a second save', async () => {
  const f=fixture(); await f.ready(); f.button('New project').onClick(); f.render(); f.change('Project name','First');
  f.button('Save project').onClick(); f.change('Project name','Newer'); f.posts[0].resolve(result(project({id:'created-id',name:'First'}))); await f.flush();
  assert.equal(f.nodes('Dialog')[0].props.open,true); assert.equal(f.input('Project name').value,'Newer');
  f.button('Save project').onClick(); assert.equal(f.posts.length,2); assert.equal(f.posts[1].init.method,'PUT'); assert.match(f.posts[1].url,/\/created-id$/); assert.equal(f.posts[1].body.name,'Newer');
});
test('callbacks from a dismissed draft cannot save, close or change a replacement draft', async () => {
  const f=fixture(); await f.ready(); f.icon('Edit project').onClick(); f.render();
  const save=f.button('Save project').onClick, cancel=f.button('Cancel').onClick, close=f.nodes('Dialog')[0].props.onClose, field=f.input('Project name').onChange;
  cancel(); f.render(); f.button('New project').onClick(); f.render(); f.change('Project name','New draft');
  save(); cancel(); close(); field({target:{value:'Old event'}}); f.render();
  assert.equal(f.posts.length,0); assert.equal(f.nodes('Dialog')[0].props.open,true); assert.equal(f.input('Project name').value,'New draft');
});
test('a refresh keeps existing long-list cards mounted instead of collapsing scroll geometry', async () => {
  const f=fixture(); await f.ready(Array.from({length:60},(_,i)=>project({id:`project-${i}`})));
  const count=f.nodes('Card').length; assert.equal(count,64); f.refresh(); assert.equal(f.nodes('Card').length,count); assert.equal(f.nodes('LinearProgress').length,1);
  f.reads.at(-1).resolve(list(Array.from({length:60},(_,i)=>project({id:`project-${i}`})))); await f.flush(); assert.equal(f.nodes('Card').length,count); assert.equal(f.nodes('LinearProgress').length,0);
});

test('uncertain-save guidance and draft survive dismissal, refresh and BFCache interruption', async () => {
  for (const edit of [false,true]) for (const interrupted of [false,true]) {
    const f=fixture(); await f.ready(); (edit?f.icon('Edit project'):f.button('New project')).onClick(); f.render(); f.change('Project name','Keep newer draft'); f.button('Save project').onClick();
    if (interrupted) { f.emit('pagehide'); f.posts[0].resolve(result(project())); await new Promise(setImmediate); f.emit('pageshow',{persisted:true}); f.render(); }
    else { f.posts[0].reject(Error('lost')); await f.flush(); }
    assert.match(f.text(),/Save not confirmed/); f.button('Cancel').onClick(); f.render();
    f.refresh(); f.reads.at(-1).resolve(list([project()])); await f.flush(); assert.match(f.text(),/Save not confirmed/); assert.equal(f.button('New project').disabled,true);
    for (const alert of f.nodes('Alert')) alert.props.onClose?.(); f.render(); assert.match(f.text(),/Save not confirmed/);
    f.button('View draft').onClick(); f.render(); assert.equal(f.input('Project name').value,'Keep newer draft'); assert.equal(f.button('Save project').disabled,true); assert.equal(f.posts.length,1);
  }
});

test('access revocation after an uncertain save removes both draft and recovery guidance', async () => {
  for (const status of [401,403]) {
    const f=fixture(); await f.ready(); f.button('New project').onClick(); f.render(); f.change('Project name','Private draft'); f.button('Save project').onClick();
    f.posts[0].reject(Error('lost')); await f.flush();
    const dialogText=f.nodes('Alert',f.nodes('Dialog')[0]).map(n=>n.props.children).join(''); assert.match(dialogText,/Save not confirmed/);
    f.button('Cancel').onClick(); f.render(); f.refresh(); f.reads.at(-1).resolve(response(status,{})); await f.flush();
    assert.match(f.text(),/access changed/); assert.equal(f.icon('Refresh projects').disabled,true); assert.doesNotMatch(f.text(),/Refresh to check again/); assert.doesNotMatch(f.text(),/Save not confirmed/); assert.equal(f.button('View draft'),undefined); assert.equal(f.input('Project name').value,'');
  }
});
