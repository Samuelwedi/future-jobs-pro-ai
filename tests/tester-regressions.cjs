// Run: node --test tests/tester-regressions.cjs
// Native APIs, providers and the database are mocked; no production requests.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../backend/node_modules/typescript');
const root = path.resolve(__dirname, '..');
function load(relative, mocks = {}, globals = {}, transform = s => s) {
  const filename = path.join(root, relative);
  const source = transform(fs.readFileSync(filename, 'utf8'));
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: id => {
    if (id in mocks) return mocks[id];
    if (id.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(filename), id + '.ts')));
    return require(id);
  }, console: { log() {}, error() {} }, process, Buffer, setTimeout, clearTimeout, ...globals }, { filename });
  return exports;
}
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

// The old duplicated UI mocks targeted expo-av and generic queued voice uploads.
// Run the maintained source suites in isolated Node processes instead. A child
// failure (including an assertion failure or missing dependency) fails this gate.
function sourceSuites(files) {
  const { spawnSync } = require('node:child_process');
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; // Do not inherit the parent runner's child-worker protocol.
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', '--test-concurrency=1', ...files], {
    cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024,
    env,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.signal, null, `Child suite terminated: ${result.signal}`);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /(?:#|ℹ) tests [1-9]/, 'Child suite must execute tests');
}
test('offline voice preserves app-owned audio and reconciles submitted recordings without blind replay', () => {
  sourceSuites(['mobile/tests/voice-receipt-native.test.cjs', 'mobile/tests/offline-approval.test.cjs']);
});
test('Lucy drops late responses after blur/refocus and identity changes', () => {
  sourceSuites(['mobile/tests/lucy-chat-retries.test.cjs']);
});
test('Lucy fences speech preparation, recording and superseded native callbacks', async () => {
  sourceSuites(['mobile/tests/lucy-speech-lifecycle.test.cjs']);
  const source = fs.readFileSync(path.join(root, 'mobile/src/screens/AIAssistantScreen.tsx'), 'utf8');
  const mode = source.match(/const setSessionAudioMode =[\s\S]*?(?=\n  \/\/ Speak Lucy)/)[0];
  const speech = source.match(/const speakText = async[\s\S]*?(?=\n  const runRequest =)/)[0];
  let speakCalls = 0, background;
  const voices = deferred(), selecting = deferred();
  const context = { active:{current:true}, controller:{suspend(){},resume(){}}, conversationActiveRef:{current:false},
    followUpTimer:{current:null},conversationTimer:{current:null},maximumRecordingTimer:{current:null},
    clearTimeout, syncRequest(){},setIsRecording(){},setLoading(){},setConversationActive(){},setVoiceStatus(){},
    navigation:{isFocused:()=>true,addListener:()=>()=>{}},DeviceEventEmitter:{emit(){}},
    AppState:{currentState:'active',addEventListener:(_name,fn)=>{background=fn;return {remove(){}};}},
    audioModeQueue: {current:Promise.resolve()}, generation:{current:0}, speechGeneration:{current:0}, isSpeaking:{current:false},
    startingRecording:{current:false}, recorderRef:{current:{hasRecording:false,isRecording:false,cancel(){}}},
    current:epoch=>context.active.current && context.generation.current===epoch, lang:'en', setAudioModeAsync:async()=>{},
    Speech:{stop:async()=>{},getAvailableVoicesAsync:async()=>[],speak:()=>{speakCalls++;throw Error('native unavailable');}} };
  vm.runInNewContext(ts.transpileModule(mode+'\n'+speech+'\nthis.speakText=speakText;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText, context);
  await assert.doesNotReject(context.speakText('test'));
  assert.equal(speakCalls, 1, 'native failure path must actually invoke Speech.speak');
  const ast = ts.createSourceFile('Lucy.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let lifecycle;
  function visit(node) { if(ts.isCallExpression(node) && node.expression.getText(ast)==='useEffect'
    && node.arguments[0]?.getText(ast).includes("AppState.addEventListener")) lifecycle=node.arguments[0]; ts.forEachChild(node,visit); }
  visit(ast); assert.ok(lifecycle);
  vm.runInNewContext(ts.transpileModule('this.lifecycle='+lifecycle.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  const cleanup = context.lifecycle();
  context.Speech.getAvailableVoicesAsync=()=>{selecting.resolve();return voices.promise;};
  const pending=context.speakText('late speech');
  await selecting.promise;
  background('background');
  voices.resolve([]);
  await pending;
  assert.equal(speakCalls,1,'background during voice lookup must prevent another native utterance');
  assert.equal(context.active.current,false); cleanup();

});
test('recorder cancellation waits for preparation/stop and never uses a released object', () => {
  sourceSuites(['mobile/tests/recorder-session.test.cjs']);
});
test('supported device locales and every Home/Profile translation resolve', () => {
  const { t, deviceLanguage } = load('mobile/src/services/i18n.ts');
  const { screenCopy } = load('mobile/src/services/screenTranslations.ts');
  for (const [locale, expected] of [['es-MX','es'], ['fr_CA','fr'], ['de-DE','en'], [undefined,'en']]) assert.equal(deviceLanguage(locale), expected);
  // Existing named i18n aliases intentionally take precedence over lowercase enum copy.
  const aliases = {vacation:['Vacation','Vacaciones','Vacances'], sick:['Sick','Enfermedad','Maladie'],
    personal:['Personal','Personal','Personnel'], pending:['Pending','Pendiente','En attente'],
    approved:['Approved','Aprobado','Approuvé'], rejected:['Rejected','Rechazado','Refusé']};
  for (const [key, values] of Object.entries(screenCopy)) {
    const expected = aliases[key] || [key, ...values];
    for (const [index,lang] of ['en','es','fr'].entries()) assert.equal(t(key,lang),expected[index],`${key}:${lang}`);
  }
  assert.equal(t('{count} shifts today', 'es', { count: '3' }), 'Turnos hoy: 3');
});

function voiceRoute({ failProcessing = false, failSave = false } = {}) {
  const routes = {}, writes = []; let tempFile;
  const router = { patch() {}, post: (url, ...handlers) => { routes[url] = handlers.at(-1); }, get() {} };
  load('backend/src/routes/voiceRoutes.ts', {
    '../services/voiceTranscriptService': { TranscriptEditError: class extends Error {} },
    '../services/voiceReceipts': { validVoiceKey: () => false, VoiceReceiptError: class extends Error {} },
    '../utils/auth': { verifyToken: () => ({ id: 'user' }) },
    express: { Router: () => router }, multer: Object.assign(() => ({ single: () => {} }), { memoryStorage: () => ({}) }),
    cloudinary: { v2: { config() {}, uploader: { upload: async input => { assert.match(input, /^data:audio\/wav;base64,/); return { secure_url: 'https://example.test/audio' }; } } } },
    '../config/database': { pool: { query: async (sql, values) => {
      writes.push({ sql, values });
      if (sql.includes('INSERT')) { if (failSave) throw Error('database unavailable'); return { rows: [{ id: 'note' }] }; }
      return { rowCount: 1, rows: [{ id: 'user', company_id: 'company' }] };
    } } },
    '../services/voiceService': { processVoiceNote: async filename => {
      tempFile = filename; assert.equal(path.extname(filename), '.wav'); assert.ok(fs.existsSync(filename));
      if (failProcessing) throw Error('provider unavailable');
      return { transcript: 'Replaced filter', structuredData: { actions: ['Replaced filter'] }, tags: [], duration: 1, clientSummary: 'Replaced filter' };
    } },
  });
  return { run: async () => {
    const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } };
    await routes['/process']({ file: { originalname: 'recording.wav', mimetype: 'audio/wav', buffer: Buffer.from('test audio') }, body: { projectId: 'project' } }, res);
    if (tempFile) assert.equal(fs.existsSync(tempFile), false, 'temporary audio removed');
    return { res, writes };
  } };
}
test('saved language loads, while a delayed read cannot overwrite a new choice', async () => {
  for (const chooseFirst of [false, true]) {
    const saved = deferred(), updates = [], writes = [], effects = [];
    const React = {
      createContext: () => ({ Provider: 'Provider' }),
      createElement: (type, props) => ({ type, props }),
      useState: initial => [typeof initial === 'function' ? initial() : initial, value => updates.push(value)],
      useRef: value => ({ current: value }), useEffect: effect => effects.push(effect),
    };
    const { LanguageProvider } = load('mobile/src/context/LanguageContext.tsx', {
      react: { ...React, useCallback: fn => fn },
      'expo-localization': { getLocales: () => [{languageTag:'en-US'}] },
      '@react-native-async-storage/async-storage': { getItem: () => saved.promise, setItem: async (...args) => { writes.push(args); } },
    });
    const provider = LanguageProvider({ children: null });
    const cleanup = effects[0]();
    if (chooseFirst) await provider.props.value.setLang('fr');
    saved.resolve('es');
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(updates, [chooseFirst ? 'fr' : 'es']);
    if (chooseFirst) assert.deepEqual(writes, [['language', 'fr']]);
    cleanup();
  }
});
test('voice upload preserves format, stores summary and always removes temporary audio', async () => {
  for (const key of ['OPENAI_API_KEY','CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET']) process.env[key] = 'test-only';
  const { res, writes } = await voiceRoute().run();
  assert.equal(res.statusCode, 200);
  const insert = writes.find(w => w.sql.includes('INSERT'));
  assert.match(insert.sql, /structured_data, client_summary/);
  assert.equal(insert.values.at(-1), 'Replaced filter');
  for (const failure of [{ failProcessing: true }, { failSave: true }]) {
    const { res } = await voiceRoute(failure).run();
    assert.equal(res.statusCode, 500);
    assert.ok(res.body.requestId);
    assert.match(res.body.message, /retry your saved recording/);
  }
});

test('root regression gate fails closed when a selected child assertion fails', () => {
  const folder = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'future-gate-check-'));
  const fixture = path.join(folder, 'failure.test.cjs');
  try {
    fs.writeFileSync(fixture, "require('node:test').test('sentinel assertion',()=>require('node:assert/strict').fail('intentional gate check'));\n");
    assert.throws(() => sourceSuites([fixture]), /intentional gate check/);
  } finally { fs.rmSync(folder, {recursive:true,force:true}); }
});
