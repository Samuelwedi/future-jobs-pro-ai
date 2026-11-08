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
const source = {kind: 'document', id: 'record-1', title: '<img src=x onerror=alert(1)>', excerpt: 'https://untrusted.example/\n[Open](javascript:alert(1))', retrievedAt: '2026-11-08T12:00:00Z', date: '2026-11-07'};
const evidence = {sources: [source], incomplete: false};
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = tree => tree == null || typeof tree === 'boolean' ? '' : typeof tree !== 'object' ? String(tree) : Array.isArray(tree) ? tree.map(text).join('') : text(tree.props?.children);
function setup() {
  let expanded = false;
  const react = {createElement: (type, props, ...children) => ({type, props: {...props, children}}), useId: () => 'source-test', useState: () => [expanded, next => {expanded = typeof next === 'function' ? next(expanded) : next;}]};
  const component = load('components/LucySourceEvidence.tsx', name => name === 'react' ? react : name === '../utils/lucyEvidence' ? utils : new Proxy({}, {get: (_, key) => key})).default;
  return {render: value => component({evidence: value}), toggle: tree => nodes(tree).find(node => node.type === 'Button').props.onClick()};
}

test('absent and complete empty evidence add no source claims', () => {
  const ui = setup();
  assert.equal(utils.readLucyEvidence(undefined), undefined);
  assert.equal(ui.render(undefined), null);
  assert.equal(ui.render({sources: [], incomplete: false}), null);
});

test('malformed and oversized evidence is bounded and explicitly incomplete', () => {
  for (const value of [{}, 'invalid', {sources: [null, {}, {...source, kind: 'url'}, {...source, retrievedAt: 'invalid'}], incomplete: false}]) {
    const result = utils.readLucyEvidence(value);
    assert.equal(result.incomplete, true); assert.equal(result.sources.length, 0);
  }
  const result = utils.readLucyEvidence({sources: Array.from({length: 13}, (_, index) => ({...source, id: String(index)})), incomplete: false});
  assert.equal(result.sources.length, 12); assert.equal(result.incomplete, true);
  assert.equal(utils.readLucyEvidence(evidence).incomplete, false);
});

test('sources expand and collapse with explicit accessible state and remain response scoped', () => {
  const first = setup(), second = setup();
  let tree = first.render(evidence);
  let button = nodes(tree).find(node => node.type === 'Button');
  assert.equal(button.props['aria-expanded'], false);
  assert.equal(nodes(tree).find(node => node.props?.role === 'region').props.hidden, true);
  assert.ok(!text(tree).includes(source.excerpt));
  first.toggle(tree); tree = first.render(evidence);
  button = nodes(tree).find(node => node.type === 'Button');
  const region = nodes(tree).find(node => node.props?.role === 'region');
  assert.equal(button.props['aria-expanded'], true);
  assert.equal(button.props['aria-controls'], region.props.id);
  assert.equal(region.props['aria-labelledby'], button.props.id);
  for (const value of [source.title, source.excerpt, source.id, 'document', 'Retrieved:', 'Record date: 2026-11-07']) assert.ok(text(tree).includes(value), value);
  assert.ok(!text(second.render({sources: [{...source, id: 'another', excerpt: 'Another record'}], incomplete: false})).includes(source.excerpt));
  first.toggle(tree); assert.ok(!text(first.render(evidence)).includes(source.excerpt));
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

test('incomplete notice is visible while collapsed, including zero available records', () => {
  for (const sources of [[], [source]]) {
    const tree = setup().render({sources, incomplete: true});
    assert.ok(text(tree).includes('Source evidence is incomplete. Some records may be missing.'));
    assert.ok(!text(tree).includes(source.excerpt));
  }
});

test('actual web markup escapes hostile source text and creates no links', () => {
  const React = require('react');
  const {renderToStaticMarkup} = require('react-dom/server');
  const Component = load('components/LucySourceEvidence.tsx', name => name === 'react' ? {...React, useState: () => [true, () => {}], useId: () => 'safe-source'} : name === '../utils/lucyEvidence' ? utils : require(name)).default;
  const markup = renderToStaticMarkup(Component({evidence}));
  assert.ok(markup.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(markup.includes('https://untrusted.example/'));
  assert.ok(!/<(?:a|img|iframe)\b/i.test(markup));
  assert.ok(!/\shref=|\sonerror=/i.test(markup.replaceAll('&lt;img src=x onerror=alert(1)&gt;', '')));
});

test('chat and work results consume only their own server evidence, not historic chat content', () => {
  const chat = fs.readFileSync(path.join(__dirname, '../src/pages/AskLucy.tsx'), 'utf8');
  const panel = fs.readFileSync(path.join(__dirname, '../src/components/LucyWorkspacePanel.tsx'), 'utf8');
  assert.match(chat, /evidence: data\.evidence/);
  assert.match(chat, /<LucySourceEvidence evidence=\{message\.evidence\}/);
  assert.match(panel, /<LucySourceEvidence evidence=\{job\.result\?\.evidence\}/);
  assert.match(chat, /data\.messages\.map\(\(item: any\) => \(\{ text: item\.content, isUser: item\.role === 'user' \}\)\)/);
});
