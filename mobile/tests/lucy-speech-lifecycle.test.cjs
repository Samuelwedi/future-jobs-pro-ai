const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/screens/AIAssistantScreen.tsx'), 'utf8');
const mode = source.match(/const setSessionAudioMode =[\s\S]*?(?=\n  \/\/ Speak Lucy)/)[0];
const speech = source.match(/const speakText = async[\s\S]*?(?=\n  const runRequest =)/)[0];
const start = source.match(/const startRecording = async[\s\S]*?(?=\n  const stopRecording =)/)[0];
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
const tick = () => new Promise(r => setImmediate(r));
function setup() {
 const calls = [], spoken = [];
 const c = {
  audioModeQueue: { current: Promise.resolve() },
  generation: { current: 0 }, speechGeneration: { current: 0 }, isSpeaking: { current: false },
  active: true, startingRecording: { current: false }, finishingRecording: { current: false },
  controller: { snapshot: () => ({ pending: false }) },
  recorderRef: { current: { isRecording: false, hasRecording: false } },
  requestRecordingPermissionsAsync: async () => ({ granted: true }),
  setAudioModeAsync: async () => calls.push('audio mode'),
  Speech: { stop: async () => calls.push('stop speech'), getAvailableVoicesAsync: async () => [],
   speak: (text, options) => { calls.push('speak'); spoken.push({ text, options }); options.onDone(); } },
  audioRecorder: { start: async () => { calls.push('record'); c.recorderRef.current.isRecording = true; c.recorderRef.current.hasRecording = true; return true; }, cancel: () => calls.push('cancel') },
  t: x => x, lang: 'en', Alert: { alert: () => calls.push('alert') },
  setIsRecording: () => {}, setVoiceStatus: () => {}, heardSpeech: { current: false },
  silenceStartedAt: { current: null }, maximumRecordingTimer: { current: null },
  setTimeout: () => 1,
 };
 c.current = epoch => c.active && epoch === c.generation.current;
 vm.createContext(c);
 vm.runInContext(ts.transpileModule(mode + '\n' + speech + '\n' + start + '\nthis.speakText=speakText;this.startRecording=startRecording;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, c);
 return { c, calls, spoken };
}
test('microphone stops speech before beginning native recording', async () => {
 const { c, calls } = setup(); c.isSpeaking.current = true;
 await c.startRecording();
 assert.ok(calls.indexOf('stop speech') >= 0);
 assert.ok(calls.indexOf('stop speech') < calls.indexOf('record'));
});
test('voice selection finishing after microphone start cannot speak into the recording', async () => {
 const { c, calls } = setup(), voices = deferred();
 c.Speech.getAvailableVoicesAsync = () => voices.promise;
 const speaking = c.speakText('Old answer'); await tick();
 await c.startRecording(); voices.resolve([]); await speaking;
 assert.ok(calls.includes('record')); assert.equal(calls.includes('speak'), false);
});
test('a new speech request is ignored while recording or waiting to start recording', async () => {
 for (const state of ['recording','starting']) {
  const { c, calls } = setup();
  if (state === 'recording') c.recorderRef.current.hasRecording = true;
  else c.startingRecording.current = true;
  await c.speakText('Do not speak'); assert.deepEqual(calls, []);
 }
});
test('leaving during speech stop prevents microphone setup and late speech selection', async () => {
 const { c, calls } = setup(), stopped = deferred();
 c.Speech.stop = () => stopped.promise;
 const starting = c.startRecording(); await tick();
 c.generation.current++; c.active = false; stopped.resolve(); await starting;
 assert.equal(calls.includes('record'), false); assert.equal(calls.includes('audio mode'), false);
});
test('superseded speech callbacks cannot clear the current utterance state', async () => {
 const { c, spoken } = setup();
 c.Speech.speak = (text, options) => spoken.push({ text, options });
 const first = c.speakText('First'); await tick();
 const second = c.speakText('Second'); await tick();
 assert.equal(spoken.length, 2); assert.equal(c.isSpeaking.current, true);
 spoken[0].options.onStopped(); await first;
 assert.equal(c.isSpeaking.current, true);
 spoken[1].options.onDone(); await second; assert.equal(c.isSpeaking.current, false);
});
test('speech stop failure prevents microphone start rather than recording over uncertain speech', async () => {
 const { c, calls } = setup(); c.Speech.stop = async () => { throw Error('native speech unavailable'); };
 await c.startRecording(); assert.equal(calls.includes('record'), false); assert.ok(calls.includes('alert'));
 assert.equal(c.startingRecording.current, false);
});
test('authentication scope reset clears speaking state even when old speech callbacks are fenced', async () => {
 const { c, spoken } = setup();
 c.Speech.speak = (text, options) => spoken.push({ text, options });
 const old = c.speakText('Prior account'); await tick(); assert.equal(c.isSpeaking.current, true);
 const scopeReset = source.match(/useEffect\(\(\) => \{\s+generation.current\+\+; interacted.current = false;[\s\S]*?\}, \[user\?\.id, user\?\.companyId, user\?\.role\]\);/);
 assert.ok(scopeReset);
 Object.assign(c, { useEffect: fn => fn(), interacted: { current: true }, conversationActiveRef: { current: true },
  followUpTimer: { current: null }, conversationTimer: { current: null }, clearTimeout: () => {},
  user: { id: 'new', companyId: 'new', role: 'worker' }, setMessages: () => {}, setInput: () => {},
  setLoading: () => {}, setConversationActive: () => {}, setWorkspaceVisible: () => {}, syncRequest: () => {} });
 c.recorderRef.current.cancel = () => {};
 vm.runInContext(scopeReset[0], c);
 assert.equal(c.isSpeaking.current, false); spoken[0].options.onStopped(); await old;
 assert.equal(c.isSpeaking.current, false);
});
test('microphone audio mode waits for an older native speech-mode write to settle', async () => {
 const { c, calls } = setup(), oldMode = deferred();
 c.setAudioModeAsync = async options => {
  if (!options.allowsRecording) { calls.push('old mode pending'); await oldMode.promise; }
  calls.push('mode applied ' + options.allowsRecording);
 };
 const speaking = c.speakText('Old answer'); await tick();
 const starting = c.startRecording(); await tick();
 assert.ok(calls.includes('old mode pending')); assert.equal(calls.includes('record'), false);
 oldMode.resolve(); await Promise.all([speaking, starting]);
 assert.ok(calls.indexOf('mode applied false') < calls.indexOf('mode applied true'));
 assert.ok(calls.indexOf('mode applied true') < calls.indexOf('record'));
 assert.equal(calls.includes('speak'), false);
});
test('a queued audio-mode write is skipped when its screen session expires', async () => {
 const { c, calls } = setup(), oldMode = deferred(); c.audioModeQueue.current = oldMode.promise;
 const starting = c.startRecording(); await tick();
 c.generation.current++; c.active = false; oldMode.resolve(); await starting;
 assert.equal(calls.includes('audio mode'), false); assert.equal(calls.includes('record'), false);
});
