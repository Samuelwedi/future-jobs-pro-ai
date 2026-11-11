const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript'), { execFileSync } = require('node:child_process');
const { setup, owner, receipt, missing, root } = require('./helpers/chat-text-outbox.cjs');
// Load production parser functions from this checkout, or the separately reviewed
// backend actor-constraint checkout during client-only development. No SQL/network.
const backendRoot = process.env.CHAT_TEXT_BACKEND_ROOT || path.join(root, '../backend');
const backendSource = fs.readFileSync(path.join(backendRoot, 'src/services/chatTextReceipts.ts'), 'utf8');
const server = { exports: {}, Buffer, process: { env: {} }, require: name => {
  if (name === 'node:crypto') return require(name);
  if (name === '../config/database') return { pool: {} };
  if (name === './complimentaryAccess') return { hasComplimentaryAccess: () => false };
  throw Error(name);
} };
vm.runInNewContext(ts.transpileModule(backendSource, { fileName: 'chatTextReceipts.ts', compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, server);
const supportsActor = backendSource.includes('expectedActorId');
test('actual backend parser accepts exact native keyed POST/status contract, or safely rejects an older schema without fallback', async () => {
  const f = setup(); await f.seed('  exact\ntext 👋  ', 'room/with space');
  f.response = async (r, method, request) => {
    try {
      if (method === 'post') {
        const parsed = server.exports.parseTextRequest(request.body); assert.equal(parsed.expectedCompanyId, owner.companyId); assert.equal(parsed.expectedActorId, owner.id);
        assert.equal(parsed.message, r.text); assert.equal(parsed.roomId, r.roomId);
      } else {
        const url = new URL('https://synthetic.test' + request.url);
        const parsed = server.exports.parseTextStatus(r.roomId, r.requestKey, Object.fromEntries(url.searchParams));
        assert.equal(parsed.expectedActorId, owner.id); assert.equal(parsed.expectedCompanyId, owner.companyId);
      }
      return receipt(r, method === 'get');
    } catch (error) { if (supportsActor) throw error; return { status: error.status, data: { success: false, code: error.code } }; }
  };
  await f.drain(); assert.equal(f.sent.length, 1);
  const saved = (await f.records())[0]; assert.equal(saved.state, supportsActor ? 'saved' : 'needs-review');
  assert.equal(f.sent[0].url, '/chat/message-requests'); assert.equal(f.sent[0].body.expectedActorId, owner.id);
  if (supportsActor) {
    await f.store.updateChatTextRecord({ ...saved, state: 'uncertain', attempts: 1 }, () => {});
    await f.drain(); assert.equal(f.sent.at(-1).method, 'get'); assert.equal((await f.records())[0].state, 'saved');
  }
});
test('actual backend and native canonical input validation agree on Unicode, whitespace, length and support exclusion', () => {
  const f = setup();
  if (!supportsActor) return; // Explicit old-schema negative control is covered above.
  for (const text of ['Hello', '  hello  ', 'é', 'e\u0301', '👋', 'a\nb', '\ud800', '\udc00', '\0', ' ', 'x'.repeat(5001)]) {
    let clientAccepted = true, serverAccepted = true, client, serverValue;
    try { client = f.store.createChatTextIntent(owner, 'ordinary', text); } catch { clientAccepted = false; }
    try { serverValue = server.exports.parseTextRequest({ roomId: 'ordinary', message: text, requestKey: 'synthetic-stable-key', expectedCompanyId: owner.companyId, expectedActorId: owner.id }); } catch { serverAccepted = false; }
    assert.equal(clientAccepted, serverAccepted, JSON.stringify(text.slice(0, 20)));
    if (clientAccepted) assert.equal(client.text, serverValue.message);
  }
});
test('verified baseline ordinary text was online-only and did not persist offline Send; current path does', async () => {
  const baseline = execFileSync('git', ['show', '6b80edadd6c121aa7d72bda0a2ef2693ff3c3c76:mobile/src/services/api.ts'], { cwd: path.join(root, '..'), encoding: 'utf8' });
  let sent = 0, queued = 0; const client = { interceptors: { request: { use() {} }, response: { use() {} } }, post: async () => { sent++; return {}; } };
  const c = { exports: {}, __DEV__: false, process: { env: {} }, console, require: name => {
    if (name === 'axios') return { default: { create: () => client } };
    if (name === 'expo-secure-store') return { getItemAsync: async () => JSON.stringify(owner) };
    if (name === 'react-native') return { Platform: { OS: 'ios' } };
    if (name === './offlineService') return { checkOnlineStatus: async () => false, queueAction: async () => queued++ };
    if (name === '../utils/uploadMetadata' || name === 'expo-file-system/legacy') return {};
    throw Error(name);
  } };
  vm.runInNewContext(ts.transpileModule(baseline, { fileName: 'api.ts', compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, c);
  const api = c.exports.api; api.token = 'token'; const session = await api.openChatSession('ordinary', owner, () => true);
  await assert.rejects(session.sendMessage('Hello'), { code: 'CHAT_NOT_SENT' }); assert.equal(sent, 0); assert.equal(queued, 0);
  const f = setup(); f.online = false; await f.engine.enqueue(await f.intent('Hello', 'ordinary'), () => true); await f.drain();
  assert.equal((await f.records())[0].state, 'queued'); assert.equal(f.sent.length, 0);
});
