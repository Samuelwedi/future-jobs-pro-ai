const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

const screen = fs.readFileSync(path.join(__dirname, '../src/screens/VoiceNoteScreen.tsx'), 'utf8');
const processing = screen.slice(screen.indexOf('  const processRecording = async'), screen.indexOf('  const formatDuration'));
const leaving = screen.slice(screen.indexOf('    const leave = () => {'), screen.indexOf('    const enter ='));
function setup() {
  const requests = [];
  const effects = [];
  const generation = { current: 0 };
  const focused = { current: true };
  const context = {
    generation, focused, mounted: { current: true },
    current: epoch => focused.current && generation.current === epoch,
    projectId: 'project', timeEntryId: 'entry', user: { id: 'user' },
    timerRef: { current: null }, clearInterval,
    audioRecorder: { cancel: () => effects.push(['cancel']) },
    setIsRecording: value => effects.push(['recording', value]),
    setRecordingDuration: value => effects.push(['duration', value]),
    setIsProcessing: value => effects.push(['processing', value]),
    setResult: value => effects.push(['result', value]),
    setRetryUri: value => effects.push(['retry', value]),
    Alert: { alert: (...args) => effects.push(['alert', ...args]) },
    Haptics: {
      NotificationFeedbackType: { Success: 'success' },
      notificationAsync: async () => { effects.push(['haptic']); },
    },
    api: {
      uploadFileWithData: () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
      recordAIEvent: async () => { effects.push(['event']); },
    },
  };
  vm.runInNewContext(stripTypeScriptTypes(processing + leaving + '\nglobalThis.processRecording = processRecording; globalThis.leave = leave;'), context);
  return { context, requests, effects };
}

test('voice-note success still updates a current recording', async () => {
  const { context, requests, effects } = setup();
  const pending = context.processRecording('file:///note.m4a');
  const response = { success: true, transcript: 'hello' };
  requests[0].resolve(response);
  await pending;
  assert.equal(effects.find(([name]) => name === 'result')[1], response);
  assert.ok(effects.some(([name]) => name === 'event'));
  assert.deepEqual(effects.at(-1), ['processing', false]);
});

for (const outcome of ['success', 'failure']) {
  test(`voice-note ${outcome} after leaving cannot affect a refocused screen or newer upload`, async () => {
    const { context, requests, effects } = setup();
    const old = context.processRecording('file:///old.m4a');
    context.leave();
    assert.deepEqual(effects.at(-1), ['processing', false]);
    context.focused.current = true;
    const newer = context.processRecording('file:///new.m4a');
    const before = effects.length;
    if (outcome === 'success') requests[0].resolve({ success: true });
    else requests[0].reject(Error('upload failed'));
    await old;
    assert.equal(effects.length, before, 'stale completion must not set results, alert, or clear the newer spinner');
    requests[1].resolve({ success: true });
    await newer;
    assert.deepEqual(effects.at(-1), ['processing', false]);
  });
}

test('a delayed processing callback after leaving does not start an upload', async () => {
  const { context, requests } = setup();
  context.leave();
  await context.processRecording('file:///old.m4a');
  assert.equal(requests.length, 0);
});
