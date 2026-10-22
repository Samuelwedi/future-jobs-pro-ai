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

test('offline audio uses the supported filesystem API and retains its extension', async () => {
  const copied = [], queued = [];
  const { api } = load('mobile/src/services/api.ts', {
    axios: { create: () => ({ interceptors: { request: { use() {} }, response: { use() {} } } }) },
    'expo-secure-store': {},
    'expo-file-system/legacy': { documentDirectory: 'file:///documents/', copyAsync: async args => { copied.push(args); } },
    'react-native': { Platform: {} },
    './offlineService': { getOnlineStatus: () => false, queueAction: async args => { queued.push(args); } },
  }, { __DEV__: false });
  await assert.rejects(api.uploadFileWithData('/voice/process', 'file:///cache/note.m4a', { projectId: 'project' }, 'audio'), /queued for later/);
  assert.equal(copied.length, 1);
  assert.match(copied[0].to, /^file:\/\/\/documents\/offline-\d+\.m4a$/);
  assert.equal(queued[0].fileUri, copied[0].to);
  assert.equal(queued[0].fieldName, 'audio');
});

function lucy(overrides = {}) {
  const effects = [], cleanups = [], listeners = {};
  const stateUpdates = [];
  let speechCount = 0, stopCount = 0, appChange;
  const React = {
    createElement: () => null,
    useState: value => [value, update => stateUpdates.push(update)],
    useRef: value => ({ current: value }),
    useEffect: effect => effects.push(effect),
  };
  const Speech = {
    stop: async () => { stopCount++; },
    getAvailableVoicesAsync: async () => [],
    speak: (_, options) => { speechCount++; options.onDone(); },
    ...overrides.speech,
  };
  const recording = { isRecording: false, prepareToRecordAsync: overrides.prepareRecording || (async () => {}), record() { this.isRecording = true; }, stop: overrides.stopRecording || (async () => {}) };
  const Audio = {
    setAudioModeAsync: async () => {}, requestPermissionsAsync: async () => ({ granted: true }),
    RecordingOptionsPresets: { HIGH_QUALITY: { android: {}, ios: {} } },
    Recording: { createAsync: overrides.createRecording || (async () => { throw Error('unused'); }) },
  };
  const globals = { handlers: {} };
  const module = load('mobile/src/screens/AIAssistantScreen.tsx', {
    react: React,
    'react-native': { StyleSheet: { create: v => v }, Platform: {}, Alert: { alert() {} }, DeviceEventEmitter: { emit() {}, addListener: () => ({ remove() {} }) }, AppState: { addEventListener: (_, cb) => { appChange = cb; return { remove() {} }; } } },
    '@expo/vector-icons': {},
    '../context/AuthContext': { useAuth: () => ({ user: null }) },
    '../services/api': { api: { post: overrides.post || (async () => ({ text: 'Hello' })) } },
    '@react-navigation/native': { useNavigation: () => ({ addListener: (name, cb) => { listeners[name] = cb; return () => {}; }, isFocused: () => true }), useRoute: () => ({}) },
    'expo-audio': { RecordingPresets: { HIGH_QUALITY: {} }, useAudioRecorder: () => recording, useAudioRecorderState: () => ({}), setAudioModeAsync: async () => {}, requestRecordingPermissionsAsync: async () => ({ granted: true }) }, 'expo-speech': Speech,
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({}) },
    'expo-file-system/legacy': {}, 'expo-sharing': {},
    '@react-native-async-storage/async-storage': { getItem: async () => null },
  }, globals, source => source.replace('  return (\n    <KeyboardAvoidingView', '  Object.assign(handlers, { sendMessage, speakText, startRecording });\n  return (\n    <KeyboardAvoidingView'));
  module.default();
  effects.forEach(effect => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); });
  return { ...globals.handlers, blur: () => listeners.blur(), focus: () => listeners.focus(), background: () => appChange('background'), unmount: () => cleanups.forEach(f => f()), speechCount: () => speechCount, stopCount: () => stopCount, stateUpdates };
}

test('Lucy ignores a response arriving after blur, even after refocus', async () => {
  const response = deferred();
  const screen = lucy({ post: () => response.promise });
  await Promise.resolve(); // Finish the independent wake-word preference load.
  const pending = screen.sendMessage('test');
  screen.blur(); screen.focus();
  const updates = screen.stateUpdates.length;
  response.resolve({ text: 'Late response' });
  await pending;
  assert.equal(screen.speechCount(), 0);
  assert.equal(screen.stateUpdates.length, updates);
  screen.unmount();
});
test('Lucy cancels speech preparation on background and catches native failures', async () => {
  const voices = deferred();
  const screen = lucy({ speech: { getAvailableVoicesAsync: () => voices.promise } });
  const pending = screen.speakText('test');
  await Promise.resolve(); screen.background(); voices.resolve([]);
  await pending;
  assert.equal(screen.speechCount(), 0);
  assert.ok(screen.stopCount() > 0);
  screen.unmount();
  const failing = lucy({ speech: { speak: () => { throw Error('native unavailable'); } } });
  await assert.doesNotReject(failing.speakText('test'));
  failing.unmount();
});
test('Lucy releases a recorder created after leaving the screen', async () => {
  const created = deferred(), started = deferred(); let unloaded = 0;
  const screen = lucy({ prepareRecording: () => { started.resolve(); return created.promise; }, stopRecording: async () => { unloaded++; } });
  const pending = screen.startRecording();
  await started.promise;
  screen.blur();
  created.resolve();
  await pending;
  assert.equal(unloaded, 1);
  screen.unmount();
});
test('supported device locales and every Home/Profile translation resolve', () => {
  const { t, deviceLanguage } = load('mobile/src/services/i18n.ts');
  const { screenCopy } = load('mobile/src/services/screenTranslations.ts');
  for (const [locale, expected] of [['es-MX','es'], ['fr_CA','fr'], ['de-DE','en'], [undefined,'en']]) assert.equal(deviceLanguage(locale), expected);
  for (const [key, values] of Object.entries(screenCopy)) {
    assert.equal(t(key, 'en'), key);
    assert.equal(t(key, 'es'), values[0]);
    assert.equal(t(key, 'fr'), values[1]);
  }
  assert.equal(t('{count} shifts today', 'es', { count: '3' }), 'Turnos hoy: 3');
});

function voiceRoute({ failProcessing = false, failSave = false } = {}) {
  const routes = {}, writes = []; let tempFile;
  const router = { post: (url, ...handlers) => { routes[url] = handlers.at(-1); }, get() {} };
  load('backend/src/routes/voiceRoutes.ts', {
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
      react: React,
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
