'use strict';
// Source-loaded production handler. No server, sockets, provider or database.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const text = fs.readFileSync(path.join(__dirname, '../src/routes/chatRoutes.ts'), 'utf8');
const ast = ts.createSourceFile('chatRoutes.ts', text, ts.ScriptTarget.Latest, true);
const route = ast.statements.find(s => ts.isExpressionStatement(s)
  && ts.isCallExpression(s.expression) && s.expression.expression.getText(ast) === 'router.post'
  && s.expression.arguments[0]?.text === '/room/:roomId/attachments');
assert.ok(route);
const handler = route.expression.arguments.at(-1).getText(ast);
async function run(options = {}) {
  const state = { queries: [], releases: [], deleted: [], saved: false, emitted: 0, uploaded: 0, rollbackSettled: false };
  const client = {
    async query(sql) {
      state.queries.push(sql);
      if (sql === 'COMMIT') {
        if (options.commitApplied !== false) state.saved = true;
        if (options.commitReject) throw Error('synthetic lost acknowledgement');
      }
      if (sql === 'ROLLBACK') {
        if (options.rollbackReject) throw Error('synthetic rollback failure');
        // Yield so cleanup-before-settlement is observable.
        await Promise.resolve();
        state.rollbackSettled = true;
        // A rollback after committed data would not undo that commit.
      }
      if (options.failSql && sql.startsWith(options.failSql)) throw Error('synthetic statement failure');
      return { rows: [{ id: 'synthetic-id', sender_name: 'Fixture' }] };
    },
    release(destroy) { state.releases.push(destroy === true); },
  };
  const context = {
    authorizeChatMedia: async () => ({scope:{targetCompanyId:'company'},recheck(){}}),
    ChatMediaAccessError: class extends Error {},
    pool: { connect: async () => { if (options.connectReject) throw Error('synthetic connection failure'); return client; } },
    safeFilename: value => value,
    chatFileType: () => { if (options.invalidType) throw Error('invalid file'); return 'application/pdf'; },
    uploadPrivateChatFile: async () => { state.uploaded++; if (options.uploadReject) throw Error('synthetic upload uncertainty'); return 'private-synthetic-id'; },
    removePrivateChatFile: async id => { assert.equal(state.rollbackSettled || options.connectReject, true, 'rollback must settle before cleanup'); state.deleted.push(id); if (options.cleanupReject) throw Error('synthetic cleanup failure'); },
    emitAuthorizedRoom: () => { assert.equal(state.releases.length, 1); state.emitted++; if (options.emitThrow) throw Error('synthetic synchronous emitter'); return options.emitReject ? Promise.reject(Error('synthetic emitter')) : Promise.resolve(); },
  };
  const fn = vm.runInNewContext(ts.transpileModule(`(${handler})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  const req = { params: { roomId: 'room' }, chatUser: 'owner', chatCompany: 'company', body: options.longCaption ? { message: 'x'.repeat(5001) } : {},
    file: options.missingFile ? undefined : { originalname: 'file.pdf', buffer: Buffer.from('synthetic'), size: 9 }, app: { get: () => ({}) } };
  const res = { status(code) { state.status = code; return this; }, json(body) { state.body = body; return this; } };
  await fn(req, res);
  assert.equal(state.releases.length, (options.connectReject || options.invalidType || options.missingFile || options.longCaption || options.uploadReject) ? 0 : 1, 'exactly one release per acquired client');
  return state;
}
test('successful commit preserves bytes and releases before notification', async () => {
  const s = await run(); assert.equal(s.status, 201); assert.equal(s.saved, true); assert.equal(s.emitted, 1);
  assert.deepEqual(s.deleted, []); assert.deepEqual(s.releases, [false]);
});
for (const commitApplied of [true, false]) test(`ambiguous commit preserves blob and discards client (applied=${commitApplied})`, async () => {
  const s = await run({ commitReject: true, commitApplied });
  assert.equal(s.saved, commitApplied); assert.deepEqual(s.deleted, []); assert.deepEqual(s.releases, [true]);
  assert.equal(s.queries.includes('ROLLBACK'), false); assert.equal(s.emitted, 0);
  assert.equal(s.status, 500); assert.equal(s.body.code, 'CHAT_MEDIA_UNCERTAIN'); assert.equal(s.body.success, false);
  assert.match(s.body.message, /Check the conversation before uploading again/);
});
for (const failSql of ['BEGIN', 'INSERT INTO chat_attachments', 'INSERT INTO chat_messages', 'UPDATE chat_rooms', 'SELECT first_name']) {
  test(`definite precommit failure settles rollback before cleanup: ${failSql}`, async () => {
    const s = await run({ failSql }); assert.equal(s.queries.at(-1), 'ROLLBACK'); assert.equal(s.queries.includes('COMMIT'), false);
    assert.deepEqual(s.deleted, ['private-synthetic-id']); assert.deepEqual(s.releases, [false]); assert.equal(s.status, 500);
  });
}
test('rollback failure retains bytes, responds, and discards client', async () => {
  const s = await run({ failSql: 'INSERT INTO chat_messages', rollbackReject: true });
  assert.deepEqual(s.deleted, []); assert.deepEqual(s.releases, [true]); assert.equal(s.status, 500);
});
test('cleanup failure still responds and releases once', async () => {
  const s = await run({ failSql: 'INSERT INTO chat_messages', cleanupReject: true });
  assert.equal(s.deleted.length, 1); assert.equal(s.status, 500); assert.deepEqual(s.releases, [false]);
});
for (const kind of ['emitThrow', 'emitReject']) test(`confirmed commit survives ${kind}`, async () => {
  const s = await run({ [kind]: true }); assert.equal(s.status, 201); assert.equal(s.body.success, true); assert.equal(s.saved, true);
  assert.deepEqual(s.deleted, []); assert.deepEqual(s.releases, [false]); assert.equal(s.queries.includes('ROLLBACK'), false);
});
for (const kind of ['connectReject', 'uploadReject', 'invalidType', 'missingFile', 'longCaption']) test(`pretransaction ${kind} is bounded`, async () => {
  const s = await run({ [kind]: true }); assert.deepEqual(s.deleted, kind === 'connectReject' ? ['private-synthetic-id'] : []); assert.deepEqual(s.queries, []);
  assert.equal(s.status, ['invalidType', 'missingFile', 'longCaption'].includes(kind) ? 400 : 500);
});
