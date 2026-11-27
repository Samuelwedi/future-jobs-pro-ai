const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const read = file => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
const compile = input => ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
function load(file) {
 const c = { exports: {} }; vm.runInNewContext(compile(read(file)), c); return c.exports;
}
const {evidenceProgressCopy} = load('utils/evidenceProgress.ts');
const {screenCopy} = load('services/screenTranslations.ts');
const source = ts.createSourceFile('camera.tsx', read('screens/CameraView.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let expression;
function visit(node) {
 if (ts.isJsxExpression(node) && node.getText(source).includes('accessibilityRole="progressbar"')) expression = node.expression;
 ts.forEachChild(node, visit);
}
visit(source); assert.ok(expression);
function render(value, lang = 'en', context = {}) {
 const t = (key, params = {}) => (lang === 'en' ? key : screenCopy[key][lang === 'es' ? 0 : 1]).replace(/\{(\w+)\}/g, (_,k) => params[k]);
 return vm.runInNewContext(compile(expression.getText(source)), {
  React: { createElement: (_type, props, ...children) => ({props, children}) }, Text: 'Text', styles:{captureHint:{}},
  isProcessing: true, previewActive: {current:true}, uploadProgress: {session:2,request:3,identity:'camera-a',value},
  cameraIdentity:'camera-a', session:{current:2}, progressRequest:{current:3}, evidenceProgressCopy, t, ...context,
 });
}
test('actual camera UX renders localized observable checks and honest pending confirmation', () => {
 for (const lang of ['en','es','fr']) for (const p of [
  {phase:'checking'}, {phase:'uploading'}, {phase:'uploading',loaded:25,total:100}, {phase:'uploading',loaded:100,total:100},
 ]) {
  const view=render(p,lang);
  assert.equal(view.props.accessibilityValue.text,view.children[0]);
  assert.equal(view.props.accessibilityRole,'progressbar');
  assert.equal(view.props.accessibilityLiveRegion,'polite');
 }
 assert.match(render({phase:'uploading',loaded:25,total:100}).children[0], /25%/);
 assert.match(render({phase:'uploading',loaded:100,total:100}).children[0], /not yet confirmed saved/);
});
test('actual camera UX hides progress when screen, capture mode, session or request has changed', () => {
 for (const extra of [{isProcessing:false},{previewActive:{current:false}},{cameraIdentity:'different'},{session:{current:4}},{progressRequest:{current:4}},{uploadProgress:null}])
  assert.ok(!render({phase:'uploading'},'en',extra));
});
