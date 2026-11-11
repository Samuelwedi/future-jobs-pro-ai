const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture, message, settle, source, ast, evaluate } = require('./helpers/chat-lifecycle.cjs');
const ts = require('typescript');
const cursor = start => `opaque/v1+${start}=?`;
const rows = (start, end) => Array.from({ length: end - start + 1 }, (_, index) => message(`m${String(start + index).padStart(6, '0')}`));
const page = (start, end, hasMore = start > 1) => ({ success: true, messages: rows(start, end), hasMore, nextCursor: hasMore ? cursor(start) : null });
const ids = f => Array.from(f.c.messages, row => row.id);
async function respond(f, data) { f.reads.at(-1).resolve(data); await settle(); }
async function start(start = 1, end = 200) { const f = fixture(); await f.start(); await respond(f, page(start, end)); return f; }
const invalidCursor = () => ({ response: { status: 400, data: { code: 'CHAT_CURSOR_INVALID', refreshRequired: true } } });

test('reconnect recovers actual outage gap old1–200/latest251–450 using the latest response cursor', async () => {
  const f = await start(); await f.join(); await respond(f, page(251, 450));
  assert.equal(f.reads.length, 3, 'disjoint latest history must fetch the missing middle');
  assert.equal(f.reads.at(-1).options.before, cursor(251));
  await respond(f, page(51, 250));
  assert.deepEqual(ids(f), rows(1, 450).map(row => row.id));
  assert.equal(f.c.history.gaps, 0); assert.equal(f.maxInFlight, 1); f.cleanup();
});

test('older history is opt-in, one bounded response page per tap, deduped and exhaustion-aware', async () => {
  const f = await start(251, 450);
  assert.deepEqual(JSON.parse(JSON.stringify(f.reads[0].options)), { limit: 200 });
  assert.equal(f.reads.length, 1); assert.equal(f.c.history.hasOlder, true);
  f.c.historyRef.current.older(); f.c.historyRef.current.older();
  assert.equal(f.reads.length, 2); assert.equal(f.reads[1].options.before, cursor(251));
  await respond(f, page(51, 250)); assert.equal(f.reads.length, 2);
  f.c.historyRef.current.older(); await respond(f, { ...page(1, 50), messages: [...rows(1, 50), ...rows(51, 53)] });
  assert.deepEqual(ids(f), rows(1, 450).map(row => row.id)); assert.equal(f.c.history.hasOlder, false);
  f.c.historyRef.current.older(); assert.equal(f.reads.length, 3); f.cleanup();
});

test('large reconnect gap stops after three pages and explicit continuation completes without jumping to old merged oldest', async () => {
  const f = await start(); await f.join(); await respond(f, page(1001, 1200));
  for (const first of [801, 601, 401]) await respond(f, page(first, first + 199));
  assert.equal(f.reads.length, 5); assert.equal(f.c.history.gaps, 1); assert.equal(f.c.history.busy, false);
  assert.equal(f.c.history.hasOlder, false); // Beginning is not shown while gaps remain.
  f.c.historyRef.current.continueRecovery(); f.c.historyRef.current.continueRecovery();
  assert.equal(f.reads.at(-1).options.before, cursor(401));
  await respond(f, page(201, 400)); await respond(f, page(1, 200));
  assert.deepEqual(ids(f), rows(1, 1200).map(row => row.id)); assert.equal(f.c.history.gaps, 0);
  assert.equal(f.maxInFlight, 1); f.cleanup();
});

test('refresh during older paging fences late rows and cursor, then preserves the correct older continuation', async () => {
  const f = await start(801, 1000); f.c.historyRef.current.older(); const old = f.reads.at(-1);
  await f.join(); assert.equal(f.reads.length, 2);
  old.resolve(page(601, 800)); await settle(); assert.equal(f.reads.length, 3);
  assert.equal(ids(f).includes('m000601'), false);
  await respond(f, page(1101, 1300)); assert.equal(f.reads.at(-1).options.before, cursor(1101));
  await respond(f, page(901, 1100));
  f.c.historyRef.current.older(); assert.equal(f.reads.at(-1).options.before, cursor(801));
  await respond(f, page(601, 800)); assert.deepEqual(ids(f), rows(601, 1300).map(row => row.id));
  assert.equal(f.maxInFlight, 1); f.cleanup();
});

test('a second reconnect preserves unfinished first gap and separately catches its new gap', async () => {
  const f = await start(); await f.join(); await respond(f, page(1001, 1200));
  for (const first of [801, 601, 401]) await respond(f, page(first, first + 199));
  f.fire('disconnect'); await f.join(); await respond(f, page(2001, 2200));
  assert.equal(f.reads.at(-1).options.before, cursor(401), 'first unresolved cursor must survive newer latest');
  await respond(f, page(201, 400)); await respond(f, page(1, 200));
  assert.equal(f.reads.at(-1).options.before, cursor(2001)); await respond(f, page(1801, 2000));
  assert.equal(f.c.history.gaps, 1); assert.equal(f.c.history.busy, false);
  f.c.historyRef.current.continueRecovery();
  for (const first of [1601, 1401, 1201]) await respond(f, page(first, first + 199));
  f.c.historyRef.current.continueRecovery(); await respond(f, page(1001, 1200));
  assert.deepEqual(ids(f), rows(1, 2200).map(row => row.id)); assert.equal(f.c.history.gaps, 0); f.cleanup();
});

test('refresh during gap paging ignores the superseded page and resumes its retained cursor', async () => {
  const f = await start(); await f.join(); await respond(f, page(501, 700));
  const pendingGap = f.reads.at(-1);
  f.fire('disconnect'); await f.join(); pendingGap.resolve(page(301, 500)); await settle();
  await respond(f, page(551, 750));
  assert.equal(f.reads.at(-1).options.before, cursor(501));
  await respond(f, page(301, 500)); await respond(f, page(101, 300));
  assert.deepEqual(ids(f), rows(1, 750).map(row => row.id)); assert.equal(f.c.history.gaps, 0); f.cleanup();
});

test('older failures offer an explicit one-page retry without dropping rows or looping', async () => {
  const f = await start(251, 450); f.c.historyRef.current.older();
  f.reads.at(-1).reject(Error('offline')); await settle(); const count = f.reads.length;
  assert.equal(f.c.history.problem, 'load'); await settle(); assert.equal(f.reads.length, count);
  assert.equal(f.c.messages.length, 200); f.c.historyRef.current.retry(); f.c.historyRef.current.retry();
  assert.equal(f.reads.length, count + 1); assert.equal(f.reads.at(-1).options.before, cursor(251));
  await respond(f, page(51, 250)); assert.equal(f.c.history.problem, null); f.cleanup();
});

test('invalid older cursor requires explicit refresh and rebases without deleting already loaded history', async () => {
  const f = await start(251, 450); f.c.historyRef.current.older();
  f.reads.at(-1).reject(invalidCursor()); await settle(); assert.equal(f.c.history.problem, 'cursor');
  f.c.historyRef.current.older(); assert.equal(f.reads.length, 2); assert.equal(f.c.messages.length, 200);
  f.c.historyRef.current.retry(); assert.equal(f.reads.at(-1).options.before, undefined);
  await respond(f, page(301, 500)); assert.deepEqual(ids(f), rows(251, 500).map(row => row.id));
  f.c.historyRef.current.older(); assert.equal(f.reads.at(-1).options.before, cursor(301));
  await respond(f, page(101, 300)); f.cleanup();
});

test('invalid gap cursor refresh retains its original anchor rather than mistaking merged latest rows for recovery', async () => {
  const f = await start(); await f.join(); await respond(f, page(501, 700));
  f.reads.at(-1).reject(invalidCursor()); await settle(); assert.equal(f.c.history.gaps, 1);
  f.c.historyRef.current.retry(); await respond(f, page(551, 750));
  assert.equal(f.reads.at(-1).options.before, cursor(551));
  for (const first of [351, 151]) await respond(f, page(first, first + 199));
  assert.deepEqual(ids(f), rows(1, 750).map(row => row.id)); assert.equal(f.c.history.gaps, 0); f.cleanup();
});

test('malformed or missing page metadata cannot report exhaustion or poison future overlap anchors', async () => {
  for (const metadata of [{}, { hasMore: false }, { hasMore: true, nextCursor: null }, { hasMore: 'false', nextCursor: null }, { hasMore: false, nextCursor: 'unexpected' }, { hasMore: true, nextCursor: '   ' }, { hasMore: true, nextCursor: 42 }]) {
    const f = await start(); await f.join(); await respond(f, { messages: rows(251, 450), ...metadata });
    assert.equal(f.c.history.problem, 'metadata'); assert.equal(f.reads.length, 2);
    f.c.historyRef.current.retry(); await respond(f, page(251, 450));
    assert.equal(f.reads.at(-1).options.before, cursor(251));
    await respond(f, page(51, 250)); assert.deepEqual(ids(f), rows(1, 450).map(row => row.id)); f.cleanup();
  }
});

test('unchanged cursor or empty nonterminal response stops instead of looping', async () => {
  for (const empty of [false, true]) {
    const f = await start(251, 450); f.c.historyRef.current.older();
    await respond(f, { messages: empty ? [] : rows(51, 250), hasMore: true, nextCursor: empty ? cursor(51) : cursor(251) });
    assert.equal(f.c.history.problem, 'metadata'); assert.equal(f.reads.length, 2); f.cleanup();
  }
});

test('paging responses and controls honor focus/room/account/session/unmount fences', async () => {
  for (const change of ['scope', 'auth', 'sessionCurrent', 'unmount']) for (const fail of [false, true]) {
    const f = await start(251, 450); const controls = f.c.historyRef.current; controls.older();
    if (change === 'unmount') f.cleanup(); else f.c[change] = false;
    const before = f.events.length;
    fail ? f.reads.at(-1).reject(invalidCursor()) : f.reads.at(-1).resolve(page(51, 250)); await settle();
    controls.older(); controls.retry(); controls.continueRecovery(); controls.refresh();
    assert.equal(f.events.length, before); assert.equal(f.reads.length, 2); assert.equal(f.c.messages.length, 200);
    if (change !== 'unmount') f.cleanup();
  }
});

test('foreign room/company or invalid identity pages cannot advance history or add messages', async () => {
  for (const extra of [{ room_id: 'other' }, { company_id: 'other' }, { sender_id: null }, { id: '' }]) {
    const f = await start(251, 450); f.c.historyRef.current.older();
    await respond(f, { ...page(51, 250), messages: [message('foreign', extra)] });
    assert.equal(f.c.history.problem, 'load'); assert.equal(f.c.messages.length, 200);
    f.c.historyRef.current.retry(); assert.equal(f.reads.at(-1).options.before, cursor(251));
    await respond(f, page(51, 250)); f.cleanup();
  }
});

test('socket and HTTP rows arriving while paging survive ID dedup without scrolling a reader away', async () => {
  const f = await start(251, 450); await f.join(); await respond(f, page(251, 450));
  f.c.nearBottom.current = false; f.c.historyRef.current.older();
  f.fire('new-message', message('m000451', { message: 'socket wins' }));
  await respond(f, { ...page(51, 250), messages: [...rows(51, 250), message('m000451', { message: 'old snapshot' })] });
  assert.equal(f.c.messages.find(row => row.id === 'm000451').message, 'socket wins');
  assert.equal(f.c.scrollAfterLayout.current, false); assert.equal(f.events.filter(event => event[0] === 'scroll').length, 0);
  f.c.nearBottom.current = true; f.fire('new-message', message('m000452'));
  assert.equal(f.c.scrollAfterLayout.current, true);
  assert.match(source, /maintainVisibleContentPosition=\{\{ minIndexForVisible: 0 \}\}/);
  assert.match(source, /if \(scrollAfterLayout.current && nearBottom.current\)/);
  assert.match(source, /history.hasOlder === false && history.gaps === 0/); f.cleanup();
});

test('null timestamps remain accepted, sort last by ID and display unavailable rather than epoch time', async () => {
  const f = await start();
  const unknown = [message('null-b', { created_at: null }), message('null-a', { created_at: null })];
  assert.ok(f.c.validMessage(unknown[0], 'room', 'company'));
  const merged = f.c.mergeMessages(unknown, rows(1, 2));
  assert.deepEqual(Array.from(merged, row => row.id), ['m000001', 'm000002', 'null-a', 'null-b']);
  assert.match(source, /item.created_at === null \? t\('Time unavailable'\)/); f.cleanup();
});

test('disconnected stale generation releases only busy state so older HTTP history stays usable', async () => {
  for (const fail of [false, true]) {
    const f = await start(251, 450); await f.join(); f.fire('disconnect');
    const before = f.events.length;
    fail ? f.reads.at(-1).reject(Error('stale')) : f.reads.at(-1).resolve(page(51, 250)); await settle();
    assert.equal(f.c.history.busy, false); assert.equal(f.c.messages.length, 200);
    assert.deepEqual(f.events.slice(before).map(event => event[0]), ['history']);
    f.c.historyRef.current.older(); assert.equal(f.reads.at(-1).options.before, cursor(251));
    await respond(f, page(51, 250)); assert.equal(f.c.messages.length, 400); f.cleanup();
  }
});

test('automatic reconnect cannot silently rebase an invalid cursor; explicit refresh can', async () => {
  const f = await start(251, 450); f.c.historyRef.current.older(); f.reads.at(-1).reject(invalidCursor()); await settle();
  await f.join(); await respond(f, page(301, 500));
  assert.equal(f.c.history.problem, 'cursor'); assert.equal(f.reads.length, 3);
  f.c.historyRef.current.retry(); await respond(f, page(301, 500));
  assert.equal(f.c.history.problem, null); f.c.historyRef.current.older();
  assert.equal(f.reads.at(-1).options.before, cursor(301)); await respond(f, page(101, 300)); f.cleanup();
});

test('message ordering compares instants including offset and fractional precision, with nulls last', async () => {
  const f = await start();
  const merged = f.c.mergeMessages([], [
    message('later', { created_at: '2026-11-11T11:00:00.001Z' }),
    message('first', { created_at: '2026-11-11T12:00:00+02:00' }),
    message('middle', { created_at: '2026-11-11T11:00:00Z' }),
    message('unknown', { created_at: null }),
  ]);
  assert.deepEqual(Array.from(merged, row => row.id), ['first', 'middle', 'later', 'unknown']); f.cleanup();
});

test('real list callbacks preserve a scrolled-up reader and scroll only a pending live append at the end', () => {
  const callbacks = {};
  function visit(node) {
    if (ts.isJsxAttribute(node) && ['onScroll', 'onContentSizeChange', 'onLayout'].includes(node.name.getText(ast))) {
      callbacks[node.name.getText(ast)] = node.initializer.expression.getText(ast);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  let scrolls = 0;
  const c = { nearBottom: { current: true }, scrollAfterLayout: { current: false }, keyboardVisible: true,
    flatListRef: { current: { scrollToEnd: () => scrolls++ } } };
  const onScroll = evaluate(`result = ${callbacks.onScroll}`, c);
  const onSize = evaluate(`result = ${callbacks.onContentSizeChange}`, c);
  const onLayout = evaluate(`result = ${callbacks.onLayout}`, c);
  onScroll({ nativeEvent: { contentSize: { height: 2000 }, layoutMeasurement: { height: 600 }, contentOffset: { y: 400 } } });
  onSize(); onLayout(); assert.equal(scrolls, 0);
  c.scrollAfterLayout.current = true;
  onScroll({ nativeEvent: { contentSize: { height: 2200 }, layoutMeasurement: { height: 600 }, contentOffset: { y: 500 } } });
  onSize(); assert.equal(scrolls, 0, 'scroll-away cancels a pending live append scroll');
  onScroll({ nativeEvent: { contentSize: { height: 2200 }, layoutMeasurement: { height: 600 }, contentOffset: { y: 1600 } } });
  onSize(); assert.equal(scrolls, 0, 'prepending alone never requests a scroll');
  c.scrollAfterLayout.current = true; onSize(); assert.equal(scrolls, 1); onSize(); assert.equal(scrolls, 1);
});


test('an initially empty room establishes older paging from its first nonempty latest page, including live arrivals', async () => {
  for (const liveArrival of [false, true]) {
    const f = fixture(); await f.start();
    await respond(f, { success: true, messages: [], hasMore: false, nextCursor: null });
    assert.equal(f.c.history.hasOlder, false);
    await f.join();
    if (liveArrival) f.fire('new-message', message('m000451'));
    await respond(f, page(251, 450));
    assert.equal(f.c.history.hasOlder, true, 'an empty old snapshot cannot claim newly populated history is complete');
    assert.equal(f.c.history.gaps, 0); assert.equal(f.reads.length, 2);
    f.c.historyRef.current.older();
    assert.equal(f.reads.at(-1).options.before, cursor(251));
    await respond(f, page(51, 250));
    f.c.historyRef.current.older(); await respond(f, page(1, 50));
    assert.deepEqual(ids(f), rows(1, liveArrival ? 451 : 450).map(row => row.id));
    assert.equal(f.c.history.hasOlder, false); assert.equal(f.c.history.gaps, 0); f.cleanup();
  }
});

test('a nonempty complete history retains its exhausted older boundary after an overlapping latest refresh', async () => {
  const f = await start(); await f.join(); await respond(f, page(51, 250));
  assert.deepEqual(ids(f), rows(1, 250).map(row => row.id));
  assert.equal(f.c.history.hasOlder, false); assert.equal(f.c.history.gaps, 0);
  f.c.historyRef.current.older(); assert.equal(f.reads.length, 2); f.cleanup();
});

const nullRows = (start, end) => Array.from({ length: end - start + 1 }, (_, index) =>
  message(`null${String(start + index).padStart(6, '0')}`, { created_at: null }));
const nullPage = (start, end, hasMore = true) => ({ success: true, messages: nullRows(start, end), hasMore,
  nextCursor: hasMore ? `null-cursor/${start}` : null });

test('a sticky null-timestamp overlap cannot hide the dated outage gap', async () => {
  const f = fixture(); await f.start();
  await respond(f, { ...page(1, 199, false), messages: [...rows(1, 199), ...nullRows(1, 1)] });
  await f.join(); await respond(f, { ...page(251, 449), messages: [...rows(251, 449), ...nullRows(1, 1)] });
  assert.equal(f.reads.at(-1).options.before, cursor(251));
  await respond(f, page(51, 250));
  assert.deepEqual(ids(f), [...rows(1, 449), ...nullRows(1, 1)].map(row => row.id));
  assert.equal(f.c.history.gaps, 0); assert.equal(f.c.history.hasOlder, false); f.cleanup();
});

test('an unchanged 200-null head is scanned below on reconnect and again after a completed scan', async () => {
  const f = fixture(); await f.start(); await respond(f, nullPage(1, 200, false));
  await f.join(); await respond(f, nullPage(1, 200));
  assert.equal(f.reads.at(-1).options.before, 'null-cursor/1'); await respond(f, page(1, 10));
  assert.equal(f.c.history.gaps, 0); assert.equal(f.c.history.hasOlder, false);
  f.fire('disconnect'); await f.join(); await respond(f, nullPage(1, 200));
  assert.equal(f.reads.at(-1).options.before, 'null-cursor/1');
  await respond(f, page(11, 210)); assert.equal(f.c.history.gaps, 1);
  await respond(f, page(1, 10));
  assert.deepEqual(ids(f), [...rows(1, 210), ...nullRows(1, 200)].map(row => row.id));
  assert.equal(f.c.history.gaps, 0); assert.equal(f.c.history.hasOlder, false); f.cleanup();
});

test('a null-only prefix beyond the automatic budget retains its cursor for continue and refresh', async () => {
  for (const resume of ['continue', 'refresh']) {
    const f = fixture(); await f.start(); await respond(f, nullPage(601, 800));
    for (const first of [401, 201, 1]) await respond(f, nullPage(first, first + 199));
    assert.equal(f.reads.length, 4); assert.equal(f.c.history.busy, false); assert.equal(f.c.history.gaps, 1);
    if (resume === 'continue') f.c.historyRef.current.continueRecovery();
    else { await f.join(); await respond(f, nullPage(601, 800)); }
    assert.equal(f.reads.at(-1).options.before, 'null-cursor/1', 'an unfinished null scan must not restart at the head');
    await respond(f, page(201, 400)); await respond(f, page(1, 200));
    assert.deepEqual(ids(f), [...rows(1, 400), ...nullRows(1, 800)].map(row => row.id));
    assert.equal(f.c.history.gaps, 0); assert.equal(f.c.history.hasOlder, false); f.cleanup();
  }
});

test('null-head probes preserve an unresolved dated gap while recovering later dated arrivals', async () => {
  const f = await start(); await f.join(); await respond(f, { ...page(1001, 1199), messages: [...rows(1001, 1199), ...nullRows(1, 1)] });
  for (const first of [801, 601, 401]) await respond(f, page(first, first + 199));
  assert.equal(f.c.history.gaps, 1);
  f.fire('disconnect'); await f.join(); await respond(f, nullPage(1, 200));
  assert.equal(f.reads.at(-1).options.before, cursor(401));
  await respond(f, page(201, 400)); await respond(f, page(1, 200));
  assert.equal(f.reads.at(-1).options.before, 'null-cursor/1'); await respond(f, page(1200, 1399));
  assert.equal(f.c.history.gaps, 1); assert.equal(f.c.history.busy, false);
  f.c.historyRef.current.continueRecovery(); await respond(f, page(1000, 1199));
  assert.deepEqual(ids(f), [...rows(1, 1399), ...nullRows(1, 200)].map(row => row.id));
  assert.equal(f.c.history.gaps, 0); f.cleanup();
});

test('null-only refresh preserves both an advanced older cursor and the unfinished discovery cursor', async () => {
  const f = fixture(); await f.start(); await respond(f, nullPage(1201, 1400));
  for (const first of [1001, 801, 601]) await respond(f, nullPage(first, first + 199));
  f.c.historyRef.current.older(); assert.equal(f.reads.at(-1).options.before, 'null-cursor/1201');
  await respond(f, nullPage(1001, 1200));
  await f.join(); await respond(f, nullPage(1201, 1400));
  assert.equal(f.reads.at(-1).options.before, 'null-cursor/601');
  for (const first of [401, 201, 1]) await respond(f, nullPage(first, first + 199));
  assert.equal(f.c.history.gaps, 1); assert.equal(f.c.history.busy, false);
  f.c.historyRef.current.older(); assert.equal(f.reads.at(-1).options.before, 'null-cursor/1001');
  await respond(f, nullPage(801, 1000));
  f.c.historyRef.current.continueRecovery(); assert.equal(f.reads.at(-1).options.before, 'null-cursor/1');
  await respond(f, page(1, 200));
  assert.deepEqual(ids(f), [...rows(1, 200), ...nullRows(1, 1400)].map(row => row.id));
  assert.equal(f.c.history.gaps, 0); assert.equal(f.c.history.hasOlder, false); f.cleanup();
});
