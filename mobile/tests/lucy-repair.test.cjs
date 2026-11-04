const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
// Execute the screen's JavaScript silence effect with React's dependency comparison.
const source = fs.readFileSync(
  path.join(__dirname, '../src/screens/AIAssistantScreen.tsx'), 'utf8',
);
const effect = source.match(/useEffect\(\(\) => \{\s+const activeRecorder = recorderRef\.current;[\s\S]*?\}, \[[^\n]*\]\);/);
assert.ok(effect, 'screen has a silence detection effect');
const code = effect[0];

test('unchanged quiet meter readings still finish recording after sustained silence', () => {
  let now = 0;
  let previous;
  const finished = [];
  const recorder = {};
  const context = vm.createContext({
    recorderRef: { current: recorder },
    heardSpeech: { current: false },
    silenceStartedAt: { current: null },
    finishRecordingRef: { current: value => finished.push(value) },
    Date: { now: () => now },
    useEffect: (callback, dependencies) => {
      if (!previous || dependencies.some((value, i) => !Object.is(value, previous[i]))) {
        previous = dependencies;
        callback();
      }
    },
  });
  const poll = (time, metering, isRecording = true) => {
    now = time;
    context.recorderState = { isRecording, metering };
    vm.runInContext(code, context);
  };
  poll(0, -20);
  poll(200, -60);
  poll(1800, -60);
  assert.equal(finished.length, 0);
  poll(2200, -60);
  assert.deepEqual(finished, [recorder]);
});

test('assistant ignores a new recording while the previous voice request is finishing', async () => {
  const start = source.match(/const startRecording = async \(\) => \{[\s\S]*?(?=\n  const stopRecording =)/);
  assert.ok(start, 'screen has a start recording handler');
  const calls = [];
  const context = vm.createContext({
    generation: { current: 0 },
    current: () => true,
    startingRecording: { current: false },
    finishingRecording: { current: true },
    recorderRef: { current: { isRecording: false } },
    requestRecordingPermissionsAsync: async () => { calls.push('permission'); return { granted: true }; },
    setAudioModeAsync: async () => calls.push('audio mode'),
    audioRecorder: { start: async () => { calls.push('start'); return false; } },
    Alert: { alert: () => calls.push('alert') },
  });
  await vm.runInContext(`${start[0]}\nstartRecording();`, context);
  assert.deepEqual(calls, []);
  assert.equal(context.startingRecording.current, false);
});
