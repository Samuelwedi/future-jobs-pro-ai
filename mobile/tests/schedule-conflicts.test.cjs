const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/components/ScheduleConflictNotice.tsx'), 'utf8');
const transpile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
const initialProps = () => ({ date: '2026-11-11', startTime: '09:00', endTime: '17:00', projectId: 'project', employeeIds: ['worker'], excludeShiftId: 'editing' });
const summary = (changes = {}) => ({ success: true, coverage: 'saved_same_day_assignments', applicable: true, conflictingEmployeeCount: 1, conflictingShiftCount: 2, uncheckedShiftCount: 0, ...changes });
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
function fixture() {
  const hooks = [], timers = new Map(), requests = [];
  let index = 0, nextTimer = 0, pendingFocus, cleanup, focusCallback, focused = true, tree;
  const f = { props: initialProps(), user: { id: 'owner', companyId: 'company', role: 'manager' }, revision: 0, requests };
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: initial => { const slot = index++; if (!(slot in hooks)) hooks[slot] = initial; return [hooks[slot], value => { hooks[slot] = typeof value === 'function' ? value(hooks[slot]) : value; }]; },
    useRef: initial => { const slot = index++; if (!(slot in hooks)) hooks[slot] = { current: initial }; return hooks[slot]; },
    useCallback: (fn, deps) => { const slot = index++; if (!hooks[slot] || deps.some((value, i) => value !== hooks[slot].deps[i])) hooks[slot] = { fn, deps }; return hooks[slot].fn; },
  };
  const api = {
    captureSessionGuard: () => { const revision = f.revision; return () => revision === f.revision; },
    checkScheduleConflicts: (...args) => new Promise((resolve, reject) => requests.push({ args, resolve, reject })),
  };
  const context = { exports: {}, require: name => {
    if (name === 'react') return react;
    if (name === 'react-native') return { View: 'View', Text: 'Text', TouchableOpacity: 'Button', StyleSheet: { create: value => value } };
    if (name === '@react-navigation/native') return { useFocusEffect: fn => { if (fn !== focusCallback && focused) { focusCallback = fn; pendingFocus = fn; } } };
    if (name === '../context/AuthContext') return { useAuth: () => ({ user: f.user }) };
    if (name === '../context/LanguageContext') return { useLang: () => ({ t: (key, vars) => Object.entries(vars || {}).reduce((text, [key, value]) => text.replace(`{${key}}`, value), key) }) };
    if (name === '../services/api') return { api };
    throw Error(name);
  }, setTimeout: fn => { timers.set(++nextTimer, fn); return nextTimer; }, clearTimeout: id => timers.delete(id) };
  vm.runInNewContext(transpile(source), context);
  f.render = (commit = true) => { index = 0; tree = context.exports.ScheduleConflictNotice(f.props); if (commit) f.commit(); return tree; };
  f.commit = () => { if (pendingFocus) { cleanup?.(); cleanup = pendingFocus(); pendingFocus = undefined; } };
  f.fire = () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => void fn()); };
  f.text = () => { const collect = node => node == null || node === false ? '' : typeof node === 'string' ? node : (node.props?.children || []).flat(Infinity).map(collect).join(' '); return collect(f.render()); };
  f.button = () => { const find = node => !node || typeof node !== 'object' ? null : node.type === 'Button' ? node : (node.props?.children || []).flat(Infinity).map(find).find(Boolean); return find(f.render()); };
  f.blur = () => { cleanup?.(); cleanup = undefined; focused = false; };
  f.focus = () => { focused = true; focusCallback = undefined; f.render(); };
  f.render(); return f;
}

test('Create/Edit renders automatic scoped overlap warning, partial coverage and explicit nonblocking wording', async () => {
  const f = fixture(); assert.match(f.text(), /Checking saved assignments/); f.fire(); assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].args[0].excludeShiftId, 'editing'); assert.equal(f.requests[0].args[1].id, 'owner');
  f.requests[0].resolve(summary({ uncheckedShiftCount: 1 })); await tick();
  assert.match(f.text(), /Possible overlap: 1 selected employees/); assert.match(f.text(), /Some saved shifts/);
  assert.match(f.text(), /not recurring rules or overnight shifts/); assert.match(f.text(), /Saving is still allowed/);
});
test('zero, uncheckable, malformed, unavailable and retry outcomes are not an unrestricted all-clear', async () => {
  for (const [response, expected] of [[summary({ conflictingEmployeeCount: 0, conflictingShiftCount: 0 }), /No overlap found among saved same-day assignments/],
    [summary({ applicable: false, conflictingEmployeeCount: 0, conflictingShiftCount: 0 }), /These times need manual review/],
    [{ success: true }, /Overlap check unavailable/], [summary({ coverage: 'unknown' }), /Overlap check unavailable/],
    [summary({ conflictingEmployeeCount: -1 }), /Overlap check unavailable/], [null, /Overlap check unavailable/]]) {
    const f = fixture(); f.fire(); f.requests[0].resolve(response); await tick(); assert.match(f.text(), expected);
  }
  const f = fixture(); f.fire(); f.requests[0].reject(Error('offline')); await tick(); assert.match(f.text(), /Overlap check unavailable/);
  f.button().props.onPress(); f.render(); f.fire(); f.requests[1].resolve(summary()); await tick(); assert.match(f.text(), /Possible overlap/);
});
test('debounced edits only request the latest draft and result hides immediately before effect cleanup', async () => {
  const f = fixture(); f.props = { ...f.props, startTime: '10:00' }; f.render(); f.props = { ...f.props, employeeIds: ['second'] }; f.render();
  f.fire(); assert.equal(f.requests.length, 1); assert.equal(f.requests[0].args[0].startTime, '10:00'); assert.equal(f.requests[0].args[0].employeeIds[0], 'second');
  f.requests[0].resolve(summary()); await tick(); assert.match(f.text(), /Possible overlap/);
  f.props = { ...f.props, date: '2026-11-12' }; const tree = f.render(false);
  assert.doesNotMatch(JSON.stringify(tree), /Possible overlap/); assert.equal(f.requests[0].args[2](), false); f.commit();
});
test('changed date, times, assignment, project, edit ID, user, company or role fence late success and failure', async () => {
  for (const change of ['date', 'startTime', 'endTime', 'employeeIds', 'projectId', 'excludeShiftId', 'id', 'companyId', 'role']) for (const fail of [false, true]) {
    const f = fixture(); f.fire(); const old = f.requests[0];
    if (['id', 'companyId', 'role'].includes(change)) f.user = { ...f.user, [change]: change === 'role' ? 'boss' : 'other' };
    else f.props = { ...f.props, [change]: change === 'employeeIds' ? ['other'] : change === 'date' ? '2026-11-12' : ['startTime', 'endTime'].includes(change) ? '12:00' : 'other' };
    f.render(false); assert.equal(old.args[2](), false, change); f.commit(); f.fire();
    f.requests[1].resolve(summary({ conflictingEmployeeCount: 0, conflictingShiftCount: 0 })); await tick();
    fail ? old.reject(Error('stale')) : old.resolve(summary()); await tick(); assert.match(f.text(), /No overlap found among saved same-day/); assert.doesNotMatch(f.text(), /Possible overlap/);
  }
});
test('blur/unmount and a token revision change suppress results; refocus rechecks rather than reuses', async () => {
  for (const transition of ['blur', 'token']) {
    const f = fixture(); f.fire(); const old = f.requests[0];
    transition === 'blur' ? f.blur() : f.revision++;
    assert.equal(old.args[2](), false); old.resolve(summary()); await tick(); assert.doesNotMatch(f.text(), /Possible overlap/);
    f.focus(); f.fire(); const next = f.requests.at(-1); assert.notEqual(next, old); next.resolve(summary()); await tick(); assert.match(f.text(), /Possible overlap/);
    f.revision++; assert.doesNotMatch(f.text(), /Possible overlap/); assert.match(f.text(), /Recheck overlaps for the current assignments/);
  }
});
test('rapid repeated refresh only dispatches the newest preview and cannot restore a stale warning', async () => {
  const f = fixture(); f.fire(); f.requests[0].resolve(summary()); await tick(); const recheck = f.button().props.onPress;
  recheck(); recheck(); f.render(); assert.doesNotMatch(f.text(), /Possible overlap/); f.fire(); assert.equal(f.requests.length, 2);
  assert.equal(f.requests[0].args[2](), false); f.requests[1].resolve(summary({ conflictingEmployeeCount: 0, conflictingShiftCount: 0 })); await tick(); assert.match(f.text(), /No overlap found among saved same-day/);
});
test('incomplete inputs, employee role and invalid times do not request private previews', () => {
  for (const changes of [{ projectId: '' }, { employeeIds: [] }, { startTime: '24:00' }, { endTime: 'bad' }]) {
    const f = fixture(); f.props = { ...f.props, ...changes }; f.render(); f.fire(); assert.equal(f.requests.length, 0); assert.match(f.text(), /Select a project and employees/);
  }
  const f = fixture(); f.user.role = 'employee'; assert.equal(f.render(), null); f.fire(); assert.equal(f.requests.length, 0);
});
test('preview never drives save, mutates schedule or changes create/edit controls', () => {
  const screen = fs.readFileSync(path.join(__dirname, '../src/screens/CreateShiftScreen.tsx'), 'utf8');
  assert.match(screen, /<ScheduleConflictNotice date=\{calendarDate\(date\)\}/);
  assert.match(screen, /excludeShiftId=\{editing\?\.id\}/);
  assert.doesNotMatch(source, /api\.(post|put|delete)|Alert\.alert|navigation\.|onSave|handleCreate/);
  assert.match(screen, /disabled=\{uploading\}/); assert.match(screen, /const save = editing \? api\.put\.bind\(api\) : api\.post\.bind\(api\)/);
});
test('every new user-facing string has English, Spanish and French coverage with preserved counts', () => {
  const c = { exports: {} }; vm.runInNewContext(transpile(fs.readFileSync(path.join(__dirname, '../src/services/screenTranslations.ts'), 'utf8')), c);
  const keys = [...source.matchAll(/\bt\('([^']+)'/g)].map(match => match[1]);
  for (const key of keys) { const translations = c.exports.screenCopy[key]; assert.equal(translations?.length, 2, key); translations.forEach(value => { assert.ok(value); if (key.includes('{count}')) assert.ok(value.includes('{count}')); }); }
});
test('edit draft takes only explicit assigned_user_ids and never infers the creator as an employee', () => {
  const screen = fs.readFileSync(path.join(__dirname, '../src/screens/CreateShiftScreen.tsx'), 'utf8');
  const ast = ts.createSourceFile('CreateShiftScreen.tsx', screen, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer;
  function visit(node) { if (ts.isVariableDeclaration(node) && node.name.getText(ast).includes('selectedEmployeeIds')) initializer = node.initializer.arguments[0].getText(ast); ts.forEachChild(node, visit); }
  visit(ast); assert.ok(initializer);
  for (const editing of [undefined, { user_id: 'creator' }, { user_id: 'creator', assigned_user_ids: null }, { user_id: 'creator', assigned_user_ids: [] }]) {
    const c = { editing }; vm.runInNewContext(transpile('result = ' + initializer), c); assert.equal(c.result.length, 0);
  }
  const c = { editing: { user_id: 'creator', assigned_user_ids: ['worker', null, '', 42] } };
  vm.runInNewContext(transpile('result = ' + initializer), c); assert.deepEqual(Array.from(c.result), ['worker']);
});
