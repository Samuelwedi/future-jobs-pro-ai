const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const root = process.env.CHAT_SOURCE_ROOT || path.join(__dirname, '../..');
const owner = { id: '00000000-0000-4000-a000-000000000001', companyId: '00000000-0000-4000-a000-000000000002', role: 'employee' };
const second = { ...owner, id: '00000000-0000-4000-a000-000000000003' };
const messageId = '00000000-0000-4000-a000-000000000004';
const clone = v => JSON.parse(JSON.stringify(v));
const settle = () => new Promise(setImmediate);
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function evaluate(file, requireModule, extras = {}) {
  const c = { exports: {}, require: requireModule, console, ...extras };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText, c, { filename: file }); return c.exports;
}
function receipt(r, replayed = false, extra = {}) {
  return { status: 200, data: { success: true, request: { key: r.requestKey, actorId: r.ownerId, companyId: r.companyId, roomId: r.roomId, state: 'saved', replayed },
    message: { id: messageId, sender_id: r.ownerId, company_id: r.companyId, room_id: r.roomId, message: r.text,
      attachment_id: null, attachment_name: null, attachment_type: null, attachment_size: null,
      created_at: '2026-11-11T12:00:00Z', sender_name: 'Synthetic User', sender_avatar: null }, ...extra } };
}
function missing(r, state = 'missing') {
  return { status: state === 'missing' ? 404 : 410, data: { success: false, code: state === 'missing' ? 'CHAT_REQUEST_NOT_FOUND' : 'CHAT_REQUEST_UNAVAILABLE',
    request: { key: r.requestKey, actorId: r.ownerId, companyId: r.companyId, roomId: r.roomId, state } } };
}
function setup(existing) {
  const data = existing || new Map(), events = [], sent = [], secure = new Map([['authToken', 'token'], ['userData', JSON.stringify(owner)], ['chatTextAuthGeneration', 'login-one']]);
  let online = true, now = Date.now(), beforeStorage = async () => {}, afterStorage = async () => {}, beforeSend = async () => {}, afterSend = async () => {}, beforeSecure = async () => {}, beforeSecureWrite = async () => {};
  let response = async r => receipt(r), requestInterceptor, responseFailure;
  const storage = {
    async getAllKeys() { await beforeStorage('keys'); const result = [...data.keys()]; await afterStorage('keys'); return result; },
    async getItem(key) { await beforeStorage('get', key); const result = data.get(key) ?? null; await afterStorage('get', key); return result; },
    async setItem(key, value) { await beforeStorage('set', key, value); data.set(key, value); events.push(['persist', JSON.parse(value)]); await afterStorage('set', key, value); },
    async removeItem(key) { await beforeStorage('remove', key); data.delete(key); await afterStorage('remove', key); },
  };
  const store = evaluate('src/services/chatTextOutboxStore.ts', n => { if (n === '@react-native-async-storage/async-storage') return { default: storage }; throw Error(n); });
  const client = { interceptors: { request: { use: fn => requestInterceptor = fn }, response: { use: (_ok, fail) => responseFailure = fail } } };
  async function send(method, url, body, config) {
    await beforeSend(); config = { ...config, headers: { ...config?.headers } }; await requestInterceptor(config);
    const r = method === 'post' ? { ownerId: body.expectedActorId, companyId: body.expectedCompanyId, roomId: body.roomId, requestKey: body.requestKey, text: body.message }
      : (() => { const parsed = new URL('https://synthetic.test' + url), parts = parsed.pathname.split('/'); const found = [...data.values()].map(JSON.parse).find(r => r.requestKey === decodeURIComponent(parts.at(-1)));
        return { ...found, ownerId: parsed.searchParams.get('expectedActorId'), companyId: parsed.searchParams.get('expectedCompanyId'), roomId: decodeURIComponent(parts[3]), requestKey: decodeURIComponent(parts[5]) }; })();
    const request = { method, url, body, config, record: r }; sent.push(request); events.push(['request', method, r.requestKey]);
    try { const result = await response(r, method, request); await afterSend(); return result; }
    catch (e) { e.config = config; return responseFailure(e); }
  }
  client.post = (url, body, config) => send('post', url, body, config);
  client.get = (url, config) => send('get', url, undefined, config);
  const api = evaluate('src/services/api.ts', n => {
    if (n === 'axios') return { default: { create: () => client } };
    if (n === 'expo-secure-store') return { async getItemAsync(key) { await beforeSecure(key); return secure.get(key) ?? null; }, async setItemAsync(key, value) { await beforeSecureWrite('set', key, value); secure.set(key, value); }, async deleteItemAsync(key) { await beforeSecureWrite('delete', key); secure.delete(key); } };
    if (n === 'react-native') return { Platform: { OS: 'ios' } };
    if (n === './offlineService') return { checkOnlineStatus: async () => online, getOnlineStatus: () => online, requiresOnlineConfirmation: url => /^\/chat(?:\/|$)/.test(url), queueAction: () => { throw Error('Generic queue must never be used'); } };
    if (n === '../utils/uploadMetadata') return { uploadMetadata: () => ({}) };
    if (n === 'expo-file-system/legacy') return {};
    throw Error(n);
  }, { __DEV__: false, process: { env: {} }, console: { warn() {}, error() {} } }).api;
  api.token = 'token';
  const engineExports = evaluate('src/services/chatTextOutboxEngine.ts', n => { if (n === './chatTextOutboxStore') return store; throw Error(n); });
  const engine = engineExports.createChatTextOutbox({ openSession: (o, current) => api.openChatTextSession(o, current), online: async () => online, now: () => now });
  engine.setContext(owner, true);
  return { data, secure, store, engine, api, events, sent, storage, engineExports, get responseFailure() { return responseFailure; },
    async intent(text = 'Hello', room = 'room') { return store.createChatTextIntent(owner, room, text); },
    async seed(text = 'Hello', room = 'room') { const r = await this.intent(text, room); return store.persistChatTextIntent(r, () => {}, { role: owner.role, generation: 'login-one' }); },
    async records(o = owner) { return (await engine.snapshot(o, () => {})).records; },
    async drain() { await settle(); await engine.kick(); await settle(); },
    set online(v) { online = v; }, set now(v) { now = v; }, get now() { return now; },
    set beforeStorage(fn) { beforeStorage = fn; }, set afterStorage(fn) { afterStorage = fn; }, set beforeSend(fn) { beforeSend = fn; }, set afterSend(fn) { afterSend = fn; }, set beforeSecure(fn) { beforeSecure = fn; }, set beforeSecureWrite(fn) { beforeSecureWrite = fn; }, set response(fn) { response = fn; },
  };
}
module.exports = { setup, owner, second, receipt, missing, deferred, settle, clone, evaluate, root };
