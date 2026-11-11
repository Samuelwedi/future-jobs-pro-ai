const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the real lifecycle, including its callbacks and asynchronous reads.
// CHAT_SOURCE_ROOT also runs the exact regression against the untouched base.
const root = process.env.CHAT_SOURCE_ROOT || path.join(__dirname, '../..');
const { createChatHistory } = require('./load-chat-history.cjs');
const source = fs.readFileSync(path.join(root, 'src/screens/ChatScreen.tsx'), 'utf8');
const ast = ts.createSourceFile('ChatScreen.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let effect;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect'
    && node.arguments[0]?.getText(ast).includes('const connect')) effect = node.arguments[0];
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(effect, 'chat socket lifecycle exists');
function evaluate(text, context) {
  return vm.runInNewContext(ts.transpileModule(text, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const settle = () => new Promise(setImmediate);
const message = (id, extra = {}) => ({ id, room_id: 'room', company_id: 'company', sender_id: 'owner',
  created_at: '2026-11-11T12:00:00Z', message: id, ...extra });
function fixture() {
  const open = deferred(), room = deferred(), reads = [], joins = [], events = [], listeners = new Map();
  let inFlight = 0, maxInFlight = 0, disconnects = 0, sockets = 0;
  const c = { roomId: 'room', user: { id: 'owner', companyId: 'company', role: 'employee' },
    mounted: { current: true }, sessionRef: { current: null }, socketRef: { current: null },
    flatListRef: { current: { scrollToEnd: () => events.push(['scroll']) } },
    historyRef: { current: null }, nearBottom: { current: true }, scrollAfterLayout: { current: false }, createChatHistory,
    auth: true, scope: true, sessionCurrent: true, t: value => value, WS_URL: 'https://example.test',
    messages: [], error: '', connected: false, ready: false, room: null };
  c.isCurrent = () => c.mounted.current && c.auth && c.scope;
  for (const key of ['Messages', 'Error', 'Connected', 'Ready', 'Room', 'History']) {
    const property = key[0].toLowerCase() + key.slice(1);
    c[`set${key}`] = value => {
      c[property] = typeof value === 'function' ? value(c[property]) : value;
      events.push([property, c[property]]);
    };
  }
  const socket = {
    on: (name, callback) => { assert.ok(!listeners.has(name), `duplicate listener: ${name}`); listeners.set(name, callback); },
    off: (name, callback) => { assert.equal(listeners.get(name), callback); listeners.delete(name); },
    emit: (name, roomId, ack) => { events.push(['emit', name, roomId]); if (name === 'join-room') joins.push(ack); },
    disconnect: () => { disconnects++; },
  };
  c.io = () => { sockets++; return socket; };
  const session = { token: 'scoped-token', isCurrent: () => c.isCurrent() && c.sessionCurrent,
    readRoom: () => room.promise,
    readMessages: options => {
      const read = deferred(); read.options = options; reads.push(read); inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      return read.promise.finally(() => { inFlight--; });
    },
  };
  c.api = { openChatSession: () => open.promise };
  for (const name of ['validMessage', 'mergeMessages']) {
    const node = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    evaluate(node.getText(ast), c);
  }
  const cleanup = evaluate(`result = ${effect.getText(ast)}`, c)();
  const fire = (name, ...args) => { assert.ok(listeners.has(name), `missing ${name}`); listeners.get(name)(...args); };
  return { c, reads, joins, events, listeners, socket, session, open, room, cleanup, fire,
    get maxInFlight() { return maxInFlight; }, get disconnects() { return disconnects; }, get sockets() { return sockets; },
    async start() { open.resolve(session); await settle(); },
    async join() { fire('connect'); joins.at(-1)({ success: true }); await settle(); },
    async resolveReads(messages = []) {
      for (let i = 0; i < reads.length; i++) { reads[i].resolve({ messages }); await settle(); }
    },
  };
}

module.exports = { fixture, message, settle, deferred, source, ast, evaluate };
