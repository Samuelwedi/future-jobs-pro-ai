const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const root = process.env.CHAT_CREATION_SOURCE_ROOT || path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/screens/NewChatScreen.tsx'), 'utf8');
const owner = { id: 'owner', companyId: 'company', role: 'employee' };
const person = (id = 'other', extra = {}) => ({ id, first_name: 'Alice', last_name: 'Baker', role: 'employee', ...extra });
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
// Execute the complete TSX screen with controlled hooks and a JSX tree, including
// keyed owner children. This is not React reconciliation or native-device QA.
function fixture() {
  const instances = new Map(), listeners = new Map(); let active, dirty = false, removed = false;
  const f = { user: { ...owner }, focused: true, revision: 0, reads: [], posts: [], navigations: [], alerts: [], effects: [], frames: [] };
  const react = {
    useState(initial) { const instance = active, i = instance.cursor++; if (!instance.slots[i]) instance.slots[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [instance.slots[i].value, value => { assert.equal(instance.dead, false, 'state update after unmount'); instance.slots[i].value = typeof value === 'function' ? value(instance.slots[i].value) : value; dirty = true; }]; },
    useRef(initial) { const i = active.cursor++; return active.slots[i] || (active.slots[i] = { current: initial }); },
    useEffect(fn, deps) { const instance = active, i = instance.cursor++, previous = instance.slots[i];
      if (!previous || !deps || deps.some((v, n) => v !== previous.deps[n])) f.effects.push(() => { previous?.cleanup?.(); const entry = { deps }; instance.slots[i] = entry; entry.cleanup = fn(); }); },
  };
  const navigation = { replace: (...args) => f.navigations.push(['replace', ...args]), goBack: () => f.navigations.push(['back']),
    addListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); return () => listeners.get(name).delete(fn); } };
  function read() { const wait = deferred(); f.reads.push(wait); return wait.promise; }
  function post(url, body) { const wait = deferred(); f.posts.push({ ...wait, url, body }); return wait.promise; }
  const api = { get: read, post, captureSessionGuard() { const revision = f.revision; return () => revision === f.revision; },
    async openChatCreationSession(who, current) { const guard = api.captureSessionGuard(); return { isCurrent: () => current() && guard(), readUsers: read,
      createDirect: userId2 => post('/chat/create-direct', { userId2 }), createGroup: (name, memberIds) => post('/chat/create-group', { name, memberIds }) }; } };
  const context = { exports: {}, console: { error() {} }, require: name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }) };
    if (name === 'react-native') return new Proxy({ StyleSheet: { create: x => x }, Alert: { alert: (...args) => f.alerts.push(args) } }, { get: (obj, key) => obj[key] || key });
    if (name === '@react-navigation/native') return { useNavigation: () => navigation, useIsFocused: () => f.focused };
    if (name === '../context/AuthContext') return { useAuth: () => ({ user: f.user }) };
    if (name === '../context/LanguageContext') return { useLang: () => ({ t: key => key }) };
    if (name === '../services/api') return { api };
    if (name === '@expo/vector-icons') return { MaterialIcons: 'MaterialIcons' };
    throw Error(name);
  } };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  const stop = instance => { if (instance.dead) return; for (const slot of instance.slots) slot?.cleanup?.(); instance.dead = true; };
  function renderComponent(component, props, id, seen) { let instance = instances.get(id); if (!instance) { instance = { slots: [], cursor: 0, dead: false }; instances.set(id, instance); }
    seen.add(id); active = instance; instance.cursor = 0; const output = component(props);
    if (output && typeof output.type === 'function') return renderComponent(output.type, output.props, id + '/' + output.type.name + ':' + output.key, seen);
    return output;
  }
  f.render = () => { if (removed) return; let passes = 0; do { dirty = false; const seen = new Set(); f.tree = renderComponent(context.exports.default, {}, 'root', seen); f.frames.push(f.tree);
    for (const [id, instance] of instances) if (!seen.has(id)) { stop(instance); instances.delete(id); }
    f.effects.splice(0).forEach(run => run()); assert.ok(++passes < 10); } while (dirty); return f.tree; };
  f.nodes = (type, tree = f.tree) => { const found = []; function visit(node) { if (!node || typeof node !== 'object') return; if (node.type === type) found.push(node); const children = node.props?.children; (Array.isArray(children) ? children.flat() : [children]).forEach(visit); } visit(tree); return found; };
  f.text = () => f.nodes('Text').map(n => n.props.children).join(' ');
  f.list = () => f.nodes('FlatList')[0]?.props;
  f.button = label => f.nodes('TouchableOpacity').find(node => node.props.accessibilityLabel === label || node.props.children?.props?.children === label)?.props;
  f.select = (id = 'other') => { const list = f.list(); list.renderItem({ item: list.data.find(row => row.id === id) }).props.onPress(); f.render(); };
  f.group = name => { f.button('Group').onPress(); f.render(); f.nodes('TextInput')[0].props.onChangeText(name); f.render(); };
  f.create = () => (f.button('Start Chat') || f.button('Create Group')).onPress();
  f.emit = event => { for (const fn of listeners.get(event) || []) fn(); };
  f.unmount = () => { for (const instance of instances.values()) stop(instance); removed = true; };
  f.flush = async () => { await new Promise(setImmediate); f.render(); };
  f.ready = async (users = [person()]) => { await f.flush(); f.reads.at(-1).resolve({ success: true, users }); await f.flush(); };
  f.render(); return f;
}

test('two same-turn direct and group taps create one request before React renders', async () => {
  for (const group of [false, true]) { const f = fixture(); await f.ready(); if (group) f.group('Crew'); f.select();
    f.create(); f.create(); assert.equal(f.posts.length, 1); f.posts[0].resolve({ success: true, roomId: group ? 'group-123-abc' : 'other-owner' }); await f.flush(); assert.equal(f.navigations.length, 1);
  }
});
test('late create success and failure never navigate or alert after account, tenant, role, blur or unmount changes', async () => {
  for (const change of ['id', 'companyId', 'role', 'blur', 'unmount', 'token']) for (const fail of [false, true]) { const f = fixture(); await f.ready(); f.select(); f.create();
    if (change === 'unmount') f.unmount(); else { if (change === 'blur') f.focused = false; else if (change === 'token') f.revision++; else f.user = { ...owner, [change]: 'replacement' }; f.render(); }
    fail ? f.posts[0].reject(Error('timeout')) : f.posts[0].resolve({ success: true, roomId: 'other-owner' }); await f.flush(); assert.equal(f.navigations.length, 0, change); assert.equal(f.alerts.length, 0, change);
  }
});
test('back and native leave events synchronously fence a result before focus rerenders', async () => {
  for (const leave of ['back', 'blur', 'beforeRemove']) { const f = fixture(); await f.ready(); f.select(); f.create();
    if (leave === 'back') f.button('Go back').onPress(); else f.emit(leave);
    f.posts[0].resolve({ success: true, roomId: 'other-owner' }); await f.flush(); assert.equal(f.navigations.filter(x => x[0] === 'replace').length, 0);
  }
});
test('uncertain creation warns, keeps inputs and blocks repeated submissions synchronously', async () => {
  const f = fixture(); await f.ready(); f.group('Crew'); f.select(); const submit = f.button('Create Group').onPress; submit(); f.posts[0].reject(Error('timeout')); await f.flush();
  assert.match(f.text(), /may already exist/i); assert.equal(f.nodes('TextInput')[0].props.value, 'Crew'); submit(); f.create(); assert.equal(f.posts.length, 1);
});
test('invalid and wrong-kind acknowledgements never navigate and remain uncertain', async () => {
  for (const group of [false, true]) for (const response of [{ success: false, roomId: 'other-owner' }, { success: true, roomId: '' }, { success: true, roomId: 42 }, { success: true, roomId: 'someone-else' }, { success: true, roomId: 'group-x' }, { success: true, roomId: 'group---' }, { success: true, roomId: group ? 'other-owner' : 'group-123-abc' }]) {
    const f = fixture(); await f.ready(); if (group) f.group('Crew'); f.select(); f.create(); f.posts[0].resolve(response); await f.flush(); assert.equal(f.navigations.length, 0); assert.match(f.text(), /may already exist/i); f.create(); assert.equal(f.posts.length, 1);
  }
});
test('known non-send permits a deliberate retry without losing selection', async () => {
  const f = fixture(); await f.ready(); f.select(); f.create(); f.posts[0].reject(Object.assign(Error('offline'), { code: 'CHAT_NOT_SENT' })); await f.flush(); assert.match(f.text(), /Nothing was queued/i); f.create(); assert.equal(f.posts.length, 2);
});
test('picker replies are owner scoped, blur invalidated, and refreshed after focus', async () => {
  for (const change of ['id', 'companyId', 'role', 'blur', 'token']) { const f = fixture(); await f.flush(); const old = f.reads[0];
    if (change === 'blur') f.focused = false; else if (change === 'token') f.revision++; else f.user = { ...owner, [change]: 'replacement' }; f.render();
    old.resolve({ success: true, users: [person('old')] }); await f.flush(); assert.equal(f.list()?.data.some(row => row.id === 'old') || false, false, change);
    if (change === 'blur') { f.focused = true; f.render(); await f.flush(); }
    if (change !== 'token') { assert.equal(f.reads.length, 2); f.reads[1].resolve({ success: true, users: [person('new')] }); await f.flush(); assert.equal(f.list().data[0].id, 'new'); }
  }
});
test('failed picker is not empty and provides a guarded retry', async () => {
  const f = fixture(); await f.flush(); f.reads[0].reject(Error('offline')); await f.flush(); assert.match(f.text(), /Could not load people/i); assert.equal(f.list(), undefined);
  f.button('Try again').onPress(); f.render(); await f.flush(); f.reads[1].resolve({ success: true, users: [] }); await f.flush(); assert.equal(f.list().data.length, 0); assert.equal(f.list().ListEmptyComponent.props.children, 'No other people available');
});
test('picker validates data, excludes self and normalizes missing names without throwing', async () => {
  for (const users of [[person('x'), person('x')], [person('', {})], [null]]) { const f = fixture(); await f.ready(users); assert.match(f.text(), /Could not load people/i); }
  const f = fixture(); await f.ready([person('owner'), person('other', { first_name: null, last_name: null })]); assert.equal(f.list().data.length, 1); assert.doesNotThrow(() => f.list().renderItem({ item: f.list().data[0] }));
});
test('submission freezes selection, mode and group name until a proven rejection', async () => {
  const f = fixture(); await f.ready([person(), person('third')]); f.group('  Crew  '); f.select();
  const groupInput = f.nodes('TextInput')[0].props, mode = f.button('Direct').onPress, otherRow = f.list().renderItem({ item: f.list().data[1] }).props.onPress;
  f.create(); groupInput.onChangeText('Changed'); mode(); otherRow(); f.render(); assert.equal(f.nodes('TextInput')[0].props.value, '  Crew  ');
  assert.equal(f.posts[0].body.name, 'Crew'); assert.deepEqual(Array.from(f.posts[0].body.memberIds), ['other']);
  f.posts[0].resolve({ success: true, roomId: 'group-123-abc' }); await f.flush(); assert.deepEqual(JSON.parse(JSON.stringify(f.navigations[0])), ['replace', 'Chat', { roomId: 'group-123-abc', roomName: 'Crew' }]);
});
test('empty selection, too-long group name and retained stale handlers cannot dispatch', async () => {
  const f = fixture(); await f.ready(); f.create(); assert.equal(f.posts.length, 0); f.group('x'.repeat(101)); f.select(); f.create(); assert.equal(f.posts.length, 0);
  f.nodes('TextInput')[0].props.onChangeText('Crew'); f.render(); const submit = f.button('Create Group').onPress; f.revision++; submit(); assert.equal(f.posts.length, 0);
});

test('retained submit handlers use the latest recipient, mode and group name in the same view', async () => {
  for (const change of ['recipient', 'name', 'mode']) {
    const f = fixture(); await f.ready([person(), person('third')]); if (change === 'name') f.group('Earlier crew'); f.select();
    const submit = (f.button('Start Chat') || f.button('Create Group')).onPress;
    if (change === 'recipient') f.select('third');
    else if (change === 'name') { f.nodes('TextInput')[0].props.onChangeText('New crew'); f.render(); }
    else { f.group('New crew'); f.select('third'); }
    submit(); assert.equal(f.posts.length, 1);
    if (change === 'recipient') assert.equal(f.posts[0].body.userId2, 'third');
    else { assert.equal(f.posts[0].body.name, 'New crew'); assert.deepEqual(Array.from(f.posts[0].body.memberIds), [change === 'mode' ? 'third' : 'other']); }
  }
});
test('two selection and name changes before React renders are reflected in the submitted snapshot', async () => {
  const f = fixture(); await f.ready([person(), person('third')]); f.group('Earlier');
  const list = f.list(); list.renderItem({ item: list.data[0] }).props.onPress(); list.renderItem({ item: list.data[1] }).props.onPress();
  const input = f.nodes('TextInput')[0].props; input.onChangeText('Interim'); input.onChangeText('Current'); f.create();
  assert.equal(f.posts.length, 1); assert.equal(f.posts[0].body.name, 'Current'); assert.deepEqual(Array.from(f.posts[0].body.memberIds), ['other', 'third']);
});
test('retained row and mode callbacks operate on the current draft rather than earlier mode state', async () => {
  const f = fixture(); await f.ready([person(), person('third')]);
  const oldRow = f.list().renderItem({ item: f.list().data[0] }).props.onPress, oldDirect = f.button('Direct').onPress;
  f.group('Crew'); f.select('third'); oldRow(); f.create();
  assert.deepEqual(Array.from(f.posts[0].body.memberIds), ['third', 'other']);
  f.posts[0].reject(Object.assign(Error('offline'), { code: 'CHAT_NOT_SENT' })); await f.flush();
  oldDirect(); f.create(); assert.equal(f.posts.length, 1); // mode change synchronously cleared the group selection
  oldRow(); f.create(); assert.equal(f.posts.length, 2); assert.equal(f.posts[1].body.userId2, 'other');
});
