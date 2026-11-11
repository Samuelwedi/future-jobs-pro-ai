const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const root = process.env.CHAT_INBOX_MOBILE_SOURCE_ROOT || path.join(__dirname, '..');
function compile(file, requireFn) {
  const context = { exports: {}, require: requireFn };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'src', file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, context);
  return context.exports;
}
const utils = compile('utils/chatInbox.ts');
const { readInboxRooms, inboxTitle, inboxPreview, inboxTime, searchInbox } = utils;
const owner = { id: 'owner', companyId: 'company', role: 'employee' };
const room = (id = 'room', extra = {}) => ({ id, name: null, is_group: false, other_user_name: 'Alice Baker',
  avatar_url: null, other_user_avatar: null, last_message: 'See you tomorrow', last_message_type: 'text', last_message_at: '2026-11-11T12:00:00Z', ...extra });
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const t = (key, vars) => vars ? key.replace('{name}', vars.name) : key;
// Evaluate the complete screen with controlled hooks and a JSX tree. This is a
// deterministic source harness, not React reconciliation or native-device QA.
function fixture() {
  let slots = [], cursor = 0, dirty = false, unmounted = false;
  const f = { user: { ...owner }, focused: true, authRevision: 0, requests: [], navigations: [], effects: [], frames: [] };
  const hook = () => cursor++;
  const react = {
    useState(initial) { const i = hook(); if (!slots[i]) slots[i] = { value: initial }; return [slots[i].value, value => {
      if (unmounted) throw Error('State update after unmount');
      slots[i].value = typeof value === 'function' ? value(slots[i].value) : value; dirty = true;
    }]; },
    useRef(initial) { const i = hook(); return slots[i] || (slots[i] = { current: initial }); },
    useCallback(fn, deps) { const i = hook(); if (!slots[i] || deps.some((v, n) => v !== slots[i].deps[n])) slots[i] = { fn, deps }; return slots[i].fn; },
  };
  const navigation = { navigate: (...args) => f.navigations.push(args), goBack: () => f.navigations.push(['back']) };
  const api = {
    captureSessionGuard() { const revision = f.authRevision; return () => revision === f.authRevision; },
    getChatRooms(who, current) { const wait = deferred(), guard = api.captureSessionGuard(); f.requests.push({ who, current,
      resolve: data => wait.resolve({ data, isSessionCurrent: guard }), reject: wait.reject }); return wait.promise; },
  };
  const component = compile('screens/ChatListScreen.tsx', name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
    if (name === 'react-native') return new Proxy({ StyleSheet: { create: x => x } }, { get: (obj, key) => obj[key] || key });
    if (name === '@react-navigation/native') return {
      useNavigation: () => navigation, useIsFocused: () => f.focused,
      useFocusEffect(fn) { const i = hook(); const previous = slots[i];
        if (!previous || previous.fn !== fn || previous.focused !== f.focused) {
          f.effects.push(() => { previous?.cleanup?.(); const entry = { fn, focused: f.focused }; slots[i] = entry; if (f.focused) entry.cleanup = fn(); });
        }
      },
    };
    if (name === '../context/AuthContext') return { useAuth: () => ({ user: f.user }) };
    if (name === '../context/LanguageContext') return { useLang: () => ({ t, lang: 'en' }) };
    if (name === '../services/api') return { api };
    if (name === '@expo/vector-icons') return { MaterialIcons: 'MaterialIcons' };
    if (name === '../utils/chatInbox') return utils;
    throw Error(name);
  }).default;
  f.render = () => { let passes = 0; do { dirty = false; cursor = 0; f.tree = component(); f.frames.push(f.tree); const effects = f.effects.splice(0); effects.forEach(run => run()); assert.ok(++passes < 10); } while (dirty); return f.tree; };
  f.nodes = (type, tree = f.tree) => { const found = []; function visit(node) { if (!node || typeof node !== 'object') return; if (node.type === type) found.push(node); const children = node.props?.children; (Array.isArray(children) ? children.flat() : [children]).forEach(visit); } visit(tree); return found; };
  f.text = () => f.nodes('Text').map(n => n.props.children).join(' ');
  f.list = () => f.nodes('FlatList')[0]?.props;
  f.input = () => f.nodes('TextInput')[0]?.props;
  f.retry = () => f.nodes('TouchableOpacity').find(n => n.props.children?.props?.children === 'Try again')?.props.onPress();
  f.unmount = () => { for (const slot of slots) slot?.cleanup?.(); unmounted = true; };
  f.flush = async () => { await new Promise(setImmediate); f.render(); };
  f.render(); return f;
}

test('normalization is minimal, bounds Unicode text, preserves order and rejects malformed or duplicate rooms', () => {
  const input = { success: true, rooms: [room('b', { last_message: '🧰'.repeat(170), private_extra: 'hidden' }), room('a')] };
  const result = readInboxRooms(input);
  assert.equal(Array.from(result[0].last_message).length, 160);
  assert.equal(result[0].private_extra, undefined);
  assert.deepEqual(Array.from(result, x => x.id), ['b', 'a']);
  for (const data of [null, {}, { success: false, rooms: [] }, { success: true, rooms: {} },
    { success: true, rooms: [room(), room()] }, { success: true, rooms: [room('support-ticket-abc')] },
    ...[{ id: '' }, { is_group: 'false' }, { last_message_type: 'read' }, { last_message_at: 'bad' }, { last_message_at: 123 }, { last_message: {} }].map(extra => ({ success: true, rooms: [room('x', extra)] }))]) {
    assert.throws(() => readInboxRooms(data));
  }
});
test('name search matches direct and group names case-insensitively, never message text, without changing server order', () => {
  const rooms = readInboxRooms({ success: true, rooms: [room('z'), room('a', { is_group: true, name: 'Alpha Crew' })] });
  assert.deepEqual(Array.from(searchInbox(rooms, '  AL  ', t), r => r.id), ['z', 'a']);
  assert.equal(searchInbox(rooms, 'tomorrow', t).length, 0);
  assert.strictEqual(searchInbox(rooms, '   ', t), rooms);
  assert.equal(inboxTitle(room('empty', { is_group: true, name: ' ' }), t), 'Unnamed group');
});
test('preview shows captions, text, photo, audio, file and empty fallbacks; older servers do not imply empty history', () => {
  assert.equal(inboxPreview(room('text', { last_message: 'line one\n  line two' }), t), 'line one line two');
  for (const [kind, label] of [['image', 'Photo'], ['audio', 'Voice message'], ['file', 'Attachment'], ['text', 'Message'], [null, 'No messages yet']]) {
    assert.equal(inboxPreview(room('x', { last_message: '', last_message_type: kind }), t), label);
    if (kind) assert.equal(inboxPreview(room('x', { last_message: 'Caption', last_message_type: kind }), t), 'Caption');
  }
  const legacy = room(); delete legacy.last_message; delete legacy.last_message_type; delete legacy.last_message_at;
  assert.equal(inboxPreview(readInboxRooms({ success: true, rooms: [legacy] })[0], t), 'Direct message');
});
test('timestamp uses message time, local calendar day and year, with invalid and empty timestamps hidden', () => {
  const now = new Date(2026, 10, 11, 18, 0), today = new Date(2026, 10, 11, 12, 30), yesterday = new Date(2026, 10, 10, 23, 59);
  assert.equal(inboxTime(today.toISOString(), 'en-US', now), today.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));
  assert.equal(inboxTime(yesterday.toISOString(), 'en-US', now), yesterday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  assert.match(inboxTime(new Date(2025, 10, 11).toISOString(), 'en-US', now), /2025/);
  assert.equal(inboxTime(null, 'en-US', now), ''); assert.equal(inboxTime('bad', 'en-US', now), '');
});
test('full screen distinguishes loading, empty, failed refresh and retry; previews are removed before rechecking access', async () => {
  const f = fixture(); assert.equal(f.nodes('ActivityIndicator', f.frames[0]).length, 1); assert.equal(f.nodes('Text', f.frames[0]).some(n => String(n.props.children).includes('Could not load')), false); assert.equal(f.list().ListEmptyComponent.type, 'ActivityIndicator');
  f.requests[0].resolve({ success: true, rooms: [room()] }); await f.flush(); assert.equal(f.list().data.length, 1);
  const row = f.list().renderItem({ item: f.list().data[0] }); assert.equal(row.type, 'TouchableOpacity');
  f.list().refreshControl.props.onRefresh(); f.render(); assert.equal(f.list().data.length, 0); assert.equal(f.list().refreshControl.props.refreshing, true);
  f.requests[1].reject(Error('denied')); await f.flush(); assert.match(f.text(), /Could not load conversations/); assert.equal(f.list(), undefined);
  f.retry(); f.render(); f.requests[2].resolve({ success: true, rooms: [] }); await f.flush();
  assert.equal(f.list().ListEmptyComponent.props.children, 'No conversations yet');
});
test('native search input and clear preserve list order and show a distinct no-match state', async () => {
  const f = fixture(); f.requests[0].resolve({ success: true, rooms: [room('z'), room('a', { is_group: true, name: 'Crew' })] }); await f.flush();
  f.input().onChangeText('CREW'); f.render(); assert.deepEqual(Array.from(f.list().data, r => r.id), ['a']);
  f.input().onChangeText('absent'); f.render(); assert.equal(f.list().ListEmptyComponent.props.children, 'No conversations match your search');
  f.nodes('TouchableOpacity').find(n => n.props.accessibilityLabel === 'Clear search').props.onPress(); f.render();
  assert.deepEqual(Array.from(f.list().data, r => r.id), ['z', 'a']);
});
test('newer refresh wins over older successes and failures', async () => {
  for (const reject of [false, true]) {
    const f = fixture(); f.list().refreshControl.props.onRefresh(); f.render();
    assert.equal(f.requests[0].current(), false);
    f.requests[1].resolve({ success: true, rooms: [room('new')] }); await f.flush();
    reject ? f.requests[0].reject(Error('old')) : f.requests[0].resolve({ success: true, rooms: [room('old')] }); await f.flush();
    assert.equal(f.list().data[0].id, 'new');
  }
});
test('account/company/role changes and blur fence stale results and reset search; focus reloads membership', async () => {
  for (const change of ['id', 'companyId', 'role', 'blur']) for (const reject of [false, true]) {
    const f = fixture(); f.input().onChangeText('private search'); f.render();
    if (change === 'blur') f.focused = false; else f.user = { ...owner, [change]: 'replacement' };
    f.render(); assert.equal(f.requests[0].current(), false);
    reject ? f.requests[0].reject(Error('stale')) : f.requests[0].resolve({ success: true, rooms: [room('old')] }); await f.flush();
    assert.equal(f.list()?.data.length || 0, 0);
    if (change === 'blur') { f.focused = true; f.render(); }
    assert.equal(f.input().value, ''); assert.equal(f.requests.length, 2);
    f.requests[1].resolve({ success: true, rooms: [room('new')] }); await f.flush(); assert.equal(f.list().data[0].id, 'new');
  }
});
test('unmount ignores late successes and failures, including state finalizers', async () => {
  for (const reject of [false, true]) { const f = fixture(); f.unmount(); assert.equal(f.requests[0].current(), false);
    reject ? f.requests[0].reject(Error('stale')) : f.requests[0].resolve({ success: true, rooms: [room()] });
    await new Promise(setImmediate);
  }
});
test('token/revision changes before AuthContext rerender hide loaded previews and fence pending results and navigation', async () => {
  for (const pending of [false, true]) { const f = fixture(); let press;
    if (!pending) { f.requests[0].resolve({ success: true, rooms: [room()] }); await f.flush(); press = f.list().renderItem({ item: f.list().data[0] }).props.onPress; }
    f.authRevision++; assert.equal(f.requests[0].current(), false);
    if (pending) f.requests[0].resolve({ success: true, rooms: [room()] });
    await f.flush(); assert.equal(f.list(), undefined); press?.(); assert.equal(f.navigations.length, 0);
    assert.match(f.text(), /Could not load conversations/);
  }
});
test('navigation is current-row-only and same-turn locked; stale rows cannot open after refresh, account change or blur', async () => {
  for (const change of ['none', 'refresh', 'account', 'blur']) { const f = fixture(); f.requests[0].resolve({ success: true, rooms: [room()] }); await f.flush();
    const press = f.list().renderItem({ item: f.list().data[0] }).props.onPress;
    if (change === 'refresh') f.list().refreshControl.props.onRefresh();
    if (change === 'account') f.user = { ...owner, id: 'other' };
    if (change === 'blur') f.focused = false;
    f.render(); press(); press(); assert.equal(f.navigations.length, change === 'none' ? 1 : 0);
    if (change === 'none') assert.deepEqual(JSON.parse(JSON.stringify(f.navigations[0])), ['Chat', { roomId: 'room', roomName: 'Alice Baker' }]);
  }
});
test('malformed response is an error rather than empty, and signed-out state cannot request or navigate', async () => {
  const f = fixture(); f.requests[0].resolve({ success: false, rooms: [] }); await f.flush(); assert.match(f.text(), /Could not load conversations/);
  f.user = null; f.render(); assert.match(f.text(), /Sign in/); assert.equal(f.requests.length, 1); assert.equal(f.input(), undefined);
});
