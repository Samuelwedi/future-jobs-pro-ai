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

// Run the actual async recording handlers with native failures delayed across blur.
const voiceNoteSource = fs.readFileSync(
  path.join(__dirname, '../src/screens/VoiceNoteScreen.tsx'), 'utf8',
);
for (const operation of ['start', 'stop']) {
  for (const lifecycle of ['active', 'blurred', 'refocused']) {
    test(`${operation} failure alerts only for its current focused recording (${lifecycle})`, async () => {
      const start = voiceNoteSource.indexOf(`  const ${operation}Recording = async () => {`);
      const end = voiceNoteSource.indexOf(
        operation === 'start' ? '  const stopRecording =' : '  const processRecording =', start,
      );
      assert.ok(start >= 0 && end > start);
      const handler = voiceNoteSource.slice(start, end).replace('catch (error: any)', 'catch (error)');
      let rejectNative;
      const nativeWork = new Promise((resolve, reject) => { rejectNative = reject; });
      let enteredNative;
      const entered = new Promise(resolve => { enteredNative = resolve; });
      const focused = { current: true };
      const generation = { current: 0 };
      const alerts = [];
      const busy = { current: false };
      const context = vm.createContext({
        generation, busy, mounted: { current: true }, hasPermission: true,
        current: epoch => focused.current && generation.current === epoch,
        audioRecorder: {
          isRecording: operation === 'stop',
          [operation]: () => { enteredNative(); return nativeWork; },
          cancel: () => {},
        },
        Alert: { alert: (...args) => alerts.push(args) },
        Haptics: { impactAsync: async () => {}, ImpactFeedbackStyle: { Medium: 1 } },
        setAudioModeAsync: async () => {},
        timerRef: { current: null }, clearInterval: () => {},
        setIsRecording: () => {}, setRecordingDuration: () => {},
        console: { error: () => {} },
      });
      const pending = vm.runInContext(`${handler}\n${operation}Recording();`, context);
      await entered;
      if (lifecycle !== 'active') {
        focused.current = false;
        generation.current += 1;
        if (lifecycle === 'refocused') focused.current = true;
      }
      rejectNative(new Error('native recording interrupted'));
      await pending;
      assert.equal(alerts.length, lifecycle === 'active' ? 1 : 0);
      assert.equal(busy.current, false, 'failure clears the operation lock');
    });
  }
}
