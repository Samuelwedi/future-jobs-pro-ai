const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');

function load(file, requireFn = require) {
  const context = {exports: {}, require: requireFn};
  const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true}}).outputText, context);
  return context.exports;
}
const utils = load('utils/lucyEvidence.ts');
const source = {kind: 'task', id: 'task-1', title: '<script>untrusted()</script>', excerpt: 'https://untrusted.example/\n[Open](javascript:untrusted())', retrievedAt: '2026-11-08T12:00:00Z', date: '2026-11-07'};
const evidence = {sources: [source], incomplete: false};
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = tree => tree == null || typeof tree === 'boolean' ? '' : typeof tree !== 'object' ? String(tree) : Array.isArray(tree) ? tree.map(text).join('') : text(tree.props?.children);
function setup(language = 'en') {
  let expanded = false;
  const react = {createElement: (type, props, ...children) => ({type, props: {...props, children}}), useState: () => [expanded, next => {expanded = typeof next === 'function' ? next(expanded) : next;}]};
  const native = {StyleSheet: {create: value => value}, View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity'};
  const component = load('components/LucySourceEvidence.tsx', name => name === 'react' ? react : name === 'react-native' ? native : name === '../utils/lucyEvidence' ? utils : (() => {throw Error(`Unexpected dependency ${name}`);})()).default;
  return {render: value => component({evidence: value, language}), toggle: tree => nodes(tree).find(node => node.type === 'TouchableOpacity').props.onPress()};
}

test('empty evidence stays hidden; malformed or oversized data cannot appear complete', () => {
  const ui = setup();
  assert.equal(ui.render(undefined), null);
  assert.equal(ui.render({sources: [], incomplete: false}), null);
  const bad = {sources: [source, null, {...source, id: null}, {...source, kind: 'external'}, {...source, retrievedAt: 'invalid'}], incomplete: false};
  assert.equal(utils.readLucyEvidence(bad).sources.length, 1);
  assert.equal(utils.readLucyEvidence(bad).incomplete, true);
  const bounded = utils.readLucyEvidence({sources: Array.from({length: 13}, (_, index) => ({...source, id: String(index)})), incomplete: false});
  assert.equal(bounded.sources.length, 12); assert.equal(bounded.incomplete, true);
  assert.ok(text(ui.render({})).includes('Source evidence is incomplete.'));
});

test('accessible toggle expands and collapses inert source text without affecting another result', () => {
  const ui = setup(), other = setup();
  let tree = ui.render(evidence);
  let button = nodes(tree).find(node => node.type === 'TouchableOpacity');
  assert.equal(button.props.accessibilityRole, 'button');
  assert.equal(button.props.accessibilityState.expanded, false);
  assert.equal(button.props.accessibilityHint, 'Show sources');
  assert.ok(!text(tree).includes(source.excerpt));
  ui.toggle(tree); tree = ui.render(evidence);
  button = nodes(tree).find(node => node.type === 'TouchableOpacity');
  assert.equal(button.props.accessibilityState.expanded, true);
  assert.equal(button.props.accessibilityHint, 'Hide sources');
  for (const value of [source.title, source.excerpt, source.id, 'Task', 'Retrieved:', 'Record date: 2026-11-07']) assert.ok(text(tree).includes(value), value);
  for (const node of nodes(tree).filter(node => node.type === 'Text')) {
    assert.equal(node.props.onPress, undefined); assert.equal(node.props.href, undefined);
  }
  assert.ok(nodes(tree).every(node => ['View', 'Text', 'TouchableOpacity'].includes(node.type)));
  assert.ok(!text(other.render({sources: [{...source, excerpt: 'Separate record'}], incomplete: false})).includes(source.excerpt));
  ui.toggle(tree); assert.ok(!text(ui.render(evidence)).includes(source.excerpt));
});

test('source fields are bounded without inventing shortened record identifiers or timestamps', () => {
  const oversized = utils.readLucyEvidence({sources: [{...source, title: 't'.repeat(201), excerpt: 'e'.repeat(1201)}], incomplete: false});
  assert.equal(oversized.sources[0].title.length, 200); assert.equal(oversized.sources[0].excerpt.length, 1200);
  assert.equal(oversized.incomplete, true);
  for (const change of [{id: 'i'.repeat(201)}, {retrievedAt: source.retrievedAt + ' '.repeat(65)}, {date: 'd'.repeat(65)}]) {
    const invalid = utils.readLucyEvidence({sources: [{...source, ...change}], incomplete: false});
    assert.equal(invalid.sources.length, 0); assert.equal(invalid.incomplete, true);
  }
});

test('English, Spanish and French localize labels, source types and the always-visible incomplete notice', () => {
  const expected = {
    en: ['Sources', 'Show sources', 'Some records may be missing.', 'Task', 'Retrieved', 'Record date'],
    es: ['Fuentes', 'Mostrar fuentes', 'Pueden faltar algunos registros.', 'Tarea', 'Consultado', 'Fecha del registro'],
    fr: ['Sources', 'Afficher les sources', 'Certaines données peuvent manquer.', 'Tâche', 'Consulté', 'Date de l’enregistrement'],
  };
  for (const [language, labels] of Object.entries(expected)) {
    const ui = setup(language); let tree = ui.render({...evidence, incomplete: true});
    const button = nodes(tree).find(node => node.type === 'TouchableOpacity');
    assert.equal(button.props.accessibilityLabel, `${labels[0]} (1)`);
    assert.equal(button.props.accessibilityHint, labels[1]);
    assert.ok(text(tree).includes(labels[2]));
    ui.toggle(tree); tree = ui.render({...evidence, incomplete: true});
    for (const label of labels.slice(3)) assert.ok(text(tree).includes(label));
    assert.ok(text(ui.render({sources: [], incomplete: true})).includes(labels[2]));
  }
});

test('chat and work results use the selected language and their own evidence, without restoring historic evidence', () => {
  const chat = fs.readFileSync(path.join(__dirname, '../src/screens/AIAssistantScreen.tsx'), 'utf8');
  const panel = fs.readFileSync(path.join(__dirname, '../src/components/LucyWorkspacePanel.tsx'), 'utf8');
  assert.match(chat, /evidence: data\.evidence/);
  assert.match(chat, /<LucySourceEvidence evidence=\{item\.evidence\} language=\{lang\}/);
  assert.match(panel, /<LucySourceEvidence evidence=\{job\.result\?\.evidence\} language=\{lang\}/);
  assert.match(chat, /map\(\(m: any\) => \(\{\s*text: m\.content,\s*isUser: m\.role === 'user',\s*\}\)\)/);
});
