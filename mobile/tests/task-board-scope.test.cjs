const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const root = process.env.CHAT_CREATION_SOURCE_ROOT || path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/screens/TasksScreen.tsx'), 'utf8');
const owner = { id: 'owner', companyId: 'company', role: 'employee' };
const person = (id = 'other', extra = {}) => ({ id, first_name: 'Alice', last_name: 'Baker', role: 'employee', ...extra });
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
// Execute the complete TSX screen with controlled hooks and a JSX tree, including
// keyed owner children. This is not React reconciliation or native-device QA.
function fixture() {
  const instances = new Map(), listeners = new Map(); let active, dirty = false, removed = false;
  const f = { user: { ...owner }, focused: true, revision: 0, reads: [], posts: [], navigations: [], alerts: [], effects: [], frames: [] };
  const react = {
    useCallback(fn) { return fn; }, useMemo(fn) { return fn(); },
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
    if (name === '../components/TaskEvidence') return {default:'TaskEvidence'};
    if (name === '../components/AdaptiveModal') return {AdaptiveModal:'AdaptiveModal'};
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
  f.ready = async (users = [person()]) => { await f.flush(); f.reads.at(-1).resolve({ success: true, tasks: users }); await f.flush(); };
  f.render(); return f;
}


test('task board remounts without old tasks or modal on account, company or role changes',async()=>{
 for(const field of ['id','companyId','role']){
 const f=fixture();await f.ready([{id:'task',description:'Private task',status:'pending'}]);
 const card=f.list().renderItem({item:f.list().data[0]});
 const button=f.nodes('TouchableOpacity',card).find(n=>n.props.children?.props?.children==='Receipts & notes');
 button.props.onPress();f.render();assert.equal(f.nodes('AdaptiveModal')[0].props.visible,true);
 f.user={...owner,[field]:'changed'};f.render();assert.equal(f.nodes('AdaptiveModal').length,0,'new board starts loading without old modal');
 assert.doesNotMatch(f.text(),/Private task/);
 }
});
test('late task list response cannot populate a newly keyed account board',async()=>{
 const f=fixture();const old=f.reads[0];f.user={...owner,companyId:'new-company'};f.render();
 old.resolve({tasks:[{id:'old',description:'PRIVATE OLD TASK',status:'pending'}]});await f.flush();assert.doesNotMatch(f.text(),/PRIVATE OLD TASK/);
 f.reads.at(-1).resolve({tasks:[]});await f.flush();assert.equal(f.list().data.length,0);
});
