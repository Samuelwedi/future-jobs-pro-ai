const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const transcript = 'SYNTHETIC_PRIVATE_MARKER: Pump failed; follow-up tomorrow.';
const unavailable = 'Summary unavailable. See the original technician note.';
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/voiceService.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText;
function load(mode) {
  const calls = [], logs = [], events = [], exported = {};
  const fixedRequire = name => {
    if (name.endsWith('voiceTranscript')) return {requireVoiceTranscript: value => value.trim()};
    if (name.endsWith('/database')) return {pool: {}};
    if (name.endsWith('adaptiveAIService')) return {recordUserEvent: async data => events.push(data)};
    if (name === 'openai') return class OpenAI {
      chat = {completions: {create: async input => {
        calls.push(input);
        if (input.messages[0].content.startsWith('Extract field-note')) {
          if (mode === 'error') throw Error(transcript);
          return {choices: [{message: {content: JSON.stringify({actions:[],parts:[],measurements:[],issues:[],nextSteps:[],people:[]})}}]};
        }
        if (mode === 'error') throw Error(transcript);
        if (mode === 'missing') return {choices: []};
        return {choices: [{message: {content: mode === 'blank' ? '  ' : 'Pump failed; follow-up tomorrow.'}}]};
      }}};
    };
    return require(name);
  };
  new Function('exports','require','process','console',source)(exported, fixedRequire,
    {env: mode === 'none' ? {} : {OPENAI_API_KEY: 'synthetic-fixture'}},
    {log: (...x) => logs.push(x), error: (...x) => logs.push(x)});
  return {calls, logs, events, process: () => exported.processTranscriptOnly(transcript, 'actor', 'project', 'shift')};
}
for (const mode of ['none','missing','blank','error','ok']) {
  test('report from a failed field visit, model: '+mode, async () => {
    const s = load(mode), result = await s.process();
    assert.equal(result.transcript, transcript);
    assert.equal(result.clientSummary, mode === 'ok' ? 'Pump failed; follow-up tomorrow.' : unavailable);
    assert.equal(s.events.length, 1);
    assert.doesNotMatch(JSON.stringify(s.logs), /SYNTHETIC_PRIVATE_MARKER/);
    if (mode !== 'none') {
      assert.equal(s.calls[1].messages[1].content, transcript);
      assert.match(s.calls[1].messages[0].content, /Do not infer/);
    }
  });
}
