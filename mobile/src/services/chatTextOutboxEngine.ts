import {
  ChatTextIntent, ChatTextOwner, ChatTextRecord, ChatTextSnapshot, readChatTextOutbox,
  persistChatTextIntent, updateChatTextRecord, dismissSavedChatText,
  sameChatTextIntent, matchesChatTextIdentity, validChatTextReceipt,
} from './chatTextOutboxStore';

type Session = {
  generation: string; isCurrent: () => boolean; authorize: () => Promise<void>;
  request: (intent: ChatTextRecord, lookup: boolean) => Promise<{ status: number; data: any }>;
};
type Dependencies = { openSession: (owner: ChatTextOwner, current: () => boolean) => Promise<Session>; online: () => Promise<boolean>; now?: () => number };
const MAX_ATTEMPTS = 5, BATCH_SIZE = 8;
const sameOwner = (a: ChatTextOwner | null, b: ChatTextOwner | null) => a?.id === b?.id && a?.companyId === b?.companyId && a?.role === b?.role;
const sameIdentity = (owner: ChatTextOwner, r: ChatTextIntent) => owner.id === r.ownerId && owner.companyId === r.companyId;
const volatileKey = (r: ChatTextIntent) => JSON.stringify([r.ownerId, r.companyId, r.requestKey]);

// One foreground process owns this queue. No URL replay, background task, socket
// send or legacy fallback exists here. Persisted state is the restart authority.
export function createChatTextOutbox(deps: Dependencies) {
  let owner: ChatTextOwner | null = null, foreground = false, epoch = 0, suspended = false;
  let processing: Promise<void> | null = null;
  let wakeDelay: number | null = null, rerunRequested = false;
  const now = deps.now || Date.now;
  const listeners = new Set<() => void>();
  // Retain an intent across a storage rejection, navigation, and same-turn taps.
  // A rejection might mean the write persisted; only this SAME key may retry.
  const volatile = new Map<string, ChatTextRecord>();
  const publish = () => { for (const listener of listeners) { try { listener(); } catch { /* observers cannot alter queue durability */ } } };
  function context() {
    const identity = owner && { ...owner }, generation = epoch;
    const current = () => !!identity && sameOwner(owner, identity) && foreground && epoch === generation;
    const assertCurrent = () => { if (!current()) throw Object.assign(new Error('Saved text processing paused.'), { code: 'CHAT_TEXT_PAUSED' }); };
    assertCurrent(); return { identity: identity!, current, assertCurrent };
  }
  async function snapshot(identity: ChatTextOwner, assertCurrent: () => void): Promise<ChatTextSnapshot> {
    const result = await readChatTextOutbox(identity, assertCurrent); assertCurrent();
    for (const record of volatile.values()) {
      if (record.ownerId !== identity.id || record.companyId !== identity.companyId) continue;
      const index = result.records.findIndex(item => item.requestKey === record.requestKey);
      if (index >= 0) {
        if (sameChatTextIntent(result.records[index], record)) {
          const canonical = result.records[index].receipt;
          if (canonical && (!record.receipt || canonical.message.id !== record.receipt.message.id)) {
            result.problems.push({ storageKey: volatileKey(record), roomId: record.roomId, reason: 'Saved receipt identity conflicts. The original message is retained.' });
          } else result.records[index] = { ...record, sequence: result.records[index].sequence };
        }
        else result.problems.push({ storageKey: volatileKey(record), roomId: record.roomId, reason: 'Saved text identity conflicts. Both records have been retained.' });
      } else result.records.push(record);
    }
    result.records.sort((a, b) => a.sequence - b.sequence || a.requestKey.localeCompare(b.requestKey));
    return result;
  }
  async function remember(record: ChatTextRecord, session: Session, assertCurrent: () => void) {
    assertCurrent(); await session.authorize(); assertCurrent();
    try {
      await updateChatTextRecord(record, () => { assertCurrent(); if (!session.isCurrent()) throw new Error('Account changed.'); });
      assertCurrent(); volatile.delete(volatileKey(record));
    } catch (error: any) {
      // Valid save ACK remains a save even when local storage cannot acknowledge it.
      volatile.set(volatileKey(record), { ...record, reason: error?.code === 'CHAT_TEXT_RECEIPT_CONFLICT'
        ? 'Saved receipt identity conflicts. The original message is retained.' : record.state === 'saved'
        ? 'Saved to conversation. Local receipt update needs recovery.' : 'Local storage needs review. Retry this same saved request.' });
      throw error;
    } finally { publish(); }
  }
  async function perform(record: ChatTextRecord, recoveryOnly: boolean) {
    const ctx = context();
    if (!sameIdentity(ctx.identity, record)) return;
    const session = await deps.openSession(ctx.identity, ctx.current); ctx.assertCurrent();
    const assertCurrent = () => { ctx.assertCurrent(); if (!session.isCurrent()) throw Object.assign(new Error('Account changed.'), { code: 'CHAT_TEXT_PAUSED' }); };
    if (record.approvedRole !== ctx.identity.role || record.approvedGeneration !== session.generation) {
      await remember({ ...record, state: 'needs-review', reason: 'Login or role changed. Review this text and explicitly check or retry it with the current account.' }, session, assertCurrent);
      return;
    }
    // A retained canonical ACK already proves this intent was saved. Even a
    // later missing status cannot authorize another POST for that receipt.
    if (record.receipt) record = { ...record, stopPost: true };
    recoveryOnly = recoveryOnly || record.stopPost === true;
    const previous = record;
    record = { ...record, state: 'sending', attempts: record.attempts + 1, nextAttemptAt: 0, reason: undefined };
    // Recovery is required after any possible earlier dispatch, including a
    // restart with state=sending. A rejected state write cannot start a request.
    await remember(record, session, assertCurrent); assertCurrent();
    let result;
    try {
      const lookup = recoveryOnly || previous.attempts > 0 || previous.state !== 'queued';
      result = await session.request(record, lookup); assertCurrent();
      if (lookup && result.status === 404 && result.data?.success === false && result.data.code === 'CHAT_REQUEST_NOT_FOUND'
        && matchesChatTextIdentity(record, result.data.request, 'missing')) {
        if (recoveryOnly) {
          await remember({ ...record, state: 'needs-review', reason: 'No receipt found by this check. That does not prove the original was absent. Retry only this same request.' }, session, assertCurrent);
          return;
        }
        // An authorized missing status cannot rule out an overlapping commit.
        // The immutable same-key POST is safe; never allocate a replacement key.
        await session.authorize(); assertCurrent();
        result = await session.request(record, false); assertCurrent();
      }
      if (result.status === 200 && validChatTextReceipt(record, result.data)) {
        await remember({ ...record, state: 'saved', receipt: result.data, reason: undefined }, session, assertCurrent);
        return;
      }
      if (result.status === 410 && result.data?.success === false && result.data.code === 'CHAT_REQUEST_UNAVAILABLE'
        && matchesChatTextIdentity(record, result.data.request, 'unavailable')) {
        await remember({ ...record, state: 'needs-review', stopPost: true, reason: 'unavailable' }, session, assertCurrent); return;
      }
      if (result.status >= 500 || result.status === 408 || result.status === 429) {
        await remember({ ...record, state: record.attempts >= MAX_ATTEMPTS ? 'needs-review' : 'uncertain',
          nextAttemptAt: now() + Math.min(60000, 2000 * 2 ** Math.min(record.attempts - 1, 5)),
          reason: record.attempts >= MAX_ATTEMPTS ? 'Automatic attempts paused. Check or retry this same saved request.' : 'Save not confirmed. The same request will be checked again while the app is open.' }, session, assertCurrent);
        return;
      }
      // Includes unknown old-server 404, schema mismatches, all auth/validation
      // 4xx, and conflicts. None can silently become a new or legacy send.
      await remember({ ...record, state: 'needs-review', ...([409, 410].includes(result.status) ? { stopPost: true as const } : {}), reason: result.status === 409 ? 'conflict'
        : [401, 402, 403].includes(result.status) ? 'Access needs review. Restore access, then check this saved request.'
          : 'Response could not confirm this request. Check its status or retry the same key after reviewing access.' }, session, assertCurrent);
    } catch (error: any) {
      if (!ctx.current() || !session.isCurrent()) return; // leave sending for same-key recovery
      if (volatile.get(volatileKey(record))?.state === 'saved') return;
      if (volatile.has(volatileKey(record))) return; // a local state write failed; no network retry
      const status = error?.response?.status;
      const terminal = error?.code === 'CHAT_TEXT_SCOPE_CHANGED' || (status >= 400 && status < 500 && status !== 408 && status !== 429);
      const offline = error?.code === 'CHAT_TEXT_OFFLINE';
      await remember({ ...record, ...([409, 410].includes(status) ? { stopPost: true as const } : {}), state: terminal || record.attempts >= MAX_ATTEMPTS ? 'needs-review' : 'uncertain',
        nextAttemptAt: now() + (offline ? 10000 : Math.min(60000, 2000 * 2 ** Math.min(record.attempts - 1, 5))),
        reason: terminal ? 'Account access changed. Review this saved text.' : 'Save not confirmed. Check or retry this same saved request.' }, session, assertCurrent).catch(() => undefined);
    }
  }
  async function run() {
    wakeDelay = null;
    let ctx;
    try { ctx = context(); if (!await deps.online()) return; ctx.assertCurrent(); } catch { return; }
    let state;
    try { state = await snapshot(ctx.identity, ctx.assertCurrent); } catch { publish(); return; }
    if (state.problems.some(problem => problem.reason.startsWith('Too many'))) return;
    let currentGeneration: string | undefined;
    if (state.records.some(record => record.state !== 'saved' && record.state !== 'needs-review')) {
      try { const session = await deps.openSession(ctx.identity, ctx.current); ctx.assertCurrent(); currentGeneration = session.generation; }
      catch { /* per-record handling below retains and marks access failures for review */ }
    }
    const blockedRooms = new Set([...state.problems.flatMap(problem => problem.roomId ? [problem.roomId] : []),
      ...Array.from(volatile.values()).filter(record => sameIdentity(ctx.identity, record) && record.state !== 'saved').map(record => record.roomId)]);
    // Unknown scope corruption is reported, but never deletes unrelated records.
    let count = 0;
    for (const record of state.records) {
      if (!ctx.current()) { wakeDelay = null; return; }
      if (count >= BATCH_SIZE) break;
      if (record.state === 'saved') continue;
      if (blockedRooms.has(record.roomId)) continue;
      blockedRooms.add(record.roomId); // release only after this earlier record is saved
      const approvalChanged = record.approvedRole !== ctx.identity.role || (currentGeneration !== undefined && record.approvedGeneration !== currentGeneration);
      if (record.state === 'needs-review' || (!approvalChanged && record.nextAttemptAt > now()) || volatile.has(volatileKey(record))) continue;
      if (!sameIdentity(ctx.identity, record)) continue;
      count++;
      try {
        await perform(record, false); ctx.assertCurrent();
        const updated = await snapshot(ctx.identity, ctx.assertCurrent);
        if (updated.records.find(item => item.requestKey === record.requestKey)?.state === 'saved') blockedRooms.delete(record.roomId);
      } catch (error: any) {
        if (ctx.current() && !volatile.has(volatileKey(record))) {
          // A local authorization failure before dispatch also stops automatic
          // attempts. This modifies only this immutable owner's retained record.
          try { await updateChatTextRecord({ ...record, state: 'needs-review', reason: 'Access or local storage needs review. Check this same saved request.' }, ctx.assertCurrent); }
          catch { volatile.set(volatileKey(record), { ...record, state: 'needs-review', reason: 'Local storage needs review. The request is retained.' }); }
        }
      }
    }
    if (!ctx.current()) { wakeDelay = null; return; }
    // Schedule only actual pending work, respecting each room's first blocker.
    const latest = await snapshot(ctx.identity, ctx.assertCurrent);
    const seen = new Set([...latest.problems.flatMap(problem => problem.roomId ? [problem.roomId] : []),
      ...Array.from(volatile.values()).filter(record => sameIdentity(ctx.identity, record) && record.state !== 'saved').map(record => record.roomId)]);
    const delays: number[] = [];
    for (const record of latest.records) {
      if (record.state === 'saved' || seen.has(record.roomId)) continue;
      seen.add(record.roomId);
      if (record.state !== 'needs-review' && !volatile.has(volatileKey(record)) && sameIdentity(ctx.identity, record)) {
        const approvalChanged = record.approvedRole !== ctx.identity.role || (currentGeneration !== undefined && record.approvedGeneration !== currentGeneration);
        delays.push(approvalChanged ? 0 : record.nextAttemptAt - now());
      }
    }
    wakeDelay = delays.length ? Math.max(1000, Math.min(...delays)) : null;
  }
  function finished() {
    processing = null;
    const rerun = rerunRequested; rerunRequested = false; publish();
    if (rerun && foreground && owner && !suspended) void kick();
  }
  function kick(): Promise<void> {
    if (processing) { rerunRequested = true; return processing; }
    processing = run().catch(() => { wakeDelay = null; }).finally(finished);
    return processing;
  }
  return {
    setContext(identity: ChatTextOwner | null, active: boolean) {
      // Logout suspension is sticky until this runner is actually disposed.
      // A foreground event from its still-mounted listener cannot resume it.
      if (suspended && identity) return;
      if (!identity) suspended = false;
      if (!sameOwner(owner, identity) || foreground !== active) epoch++;
      owner = identity && { ...identity }; foreground = active;
    },
    pause() { suspended = true; foreground = false; epoch++; wakeDelay = null; publish(); },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    snapshot, kick, nextWakeDelay: () => wakeDelay,
    async enqueue(intent: ChatTextIntent, viewCurrent: () => boolean) {
      const r = { ...intent }, ctx = context();
      const assertNoEarlierAdmission = () => {
        if (Array.from(volatile.values()).some(previous => sameIdentity(ctx.identity, previous) && previous.roomId === r.roomId && previous.requestKey !== r.requestKey && previous.state !== 'saved')) {
          throw new Error('Review the earlier local text save in this conversation before adding another.');
        }
      };
      assertNoEarlierAdmission();
      if (!sameIdentity(ctx.identity, r) || ctx.identity.role !== r.role) throw new Error('Account changed.');
      const current = () => ctx.current() && viewCurrent();
      const session = await deps.openSession(ctx.identity, ctx.current);
      const assertCurrent = () => { ctx.assertCurrent(); if (!current() || !session.isCurrent()) throw new Error('Account or conversation changed.'); };
      assertCurrent(); await session.authorize(); assertCurrent();
      assertNoEarlierAdmission(); // another view may have admitted while authorization awaited
      volatile.set(volatileKey(r), { ...r, state: 'needs-review', attempts: 0, nextAttemptAt: 0, sequence: Number.MAX_SAFE_INTEGER, approvedRole: ctx.identity.role, approvedGeneration: session.generation, reason: 'Local save not confirmed. Retry this same request before sending another.' });
      try {
        await persistChatTextIntent(r, assertCurrent, { role: ctx.identity.role, generation: session.generation });
        volatile.delete(volatileKey(r)); publish(); void kick();
      } catch (error) { publish(); throw error; }
    },
    async retry(record: ChatTextRecord, recoveryOnly = false) {
      // Serialize manual recovery with automatic processing and other taps.
      if (processing) throw new Error('The text queue is busy. Try this recovery again after it finishes.');
      processing = (async () => {
        const ctx = context();
        if (!sameIdentity(ctx.identity, record)) throw new Error('Sign in with the original account and company to review this text.');
        const session = await deps.openSession(ctx.identity, ctx.current); ctx.assertCurrent();
        const assertCurrent = () => { ctx.assertCurrent(); if (!session.isCurrent()) throw new Error('Account changed.'); };
        if (Array.from(volatile.values()).some(previous => sameIdentity(ctx.identity, previous) && previous.roomId === record.roomId && previous.requestKey !== record.requestKey && previous.state !== 'saved')) {
          throw new Error('Review the earlier local text save in this conversation first.');
        }
        const memory = volatile.get(volatileKey(record));
        if (memory) {
          if (memory.state === 'saved') { await remember(memory, session, assertCurrent); return; }
          // A preparation write may have persisted before rejecting. This exact
          // intent either verifies that record or writes it once, never a new key.
          await persistChatTextIntent(memory, assertCurrent, { role: ctx.identity.role, generation: session.generation }); await session.authorize(); assertCurrent();
          volatile.delete(volatileKey(memory));
        }
        const state = await snapshot(ctx.identity, assertCurrent);
        const saved = state.records.find(item => item.requestKey === record.requestKey);
        if (!saved || !sameChatTextIntent(saved, record)) throw new Error('Saved text identity changed.');
        if (saved.state === 'saved') return;
        if (state.problems.some(item => item.roomId === saved.roomId)
          || state.records.some(item => item.roomId === saved.roomId && item.state !== 'saved'
            && (item.sequence < saved.sequence || (item.sequence === saved.sequence && item.requestKey < saved.requestKey)))) {
          throw new Error('Review the earlier saved text in this conversation first.');
        }
        const approved = { ...saved, approvedRole: ctx.identity.role, approvedGeneration: session.generation };
        await remember(approved, session, assertCurrent);
        // Unavailable/conflicting keys can be looked up, but can never POST again.
        await perform(approved, recoveryOnly || saved.reason === 'unavailable' || saved.reason === 'conflict');
      })().finally(() => { rerunRequested = true; finished(); });
      return processing;
    },
    async dismiss(record: ChatTextRecord, current: () => boolean) {
      const ctx = context();
      if (!sameIdentity(ctx.identity, record)) throw new Error('Account changed. Reopen the original receipt.');
      const pending = volatile.get(volatileKey(record));
      if (pending?.receipt && record.receipt && pending.receipt.message.id !== record.receipt.message.id) {
        throw new Error('Saved receipt identity conflicts. The original message is retained.');
      }
      const session = await deps.openSession(ctx.identity, () => ctx.current() && current());
      const assertCurrent = () => { ctx.assertCurrent(); if (!session.isCurrent() || !current()) throw new Error('Account changed.'); };
      await session.authorize(); assertCurrent();
      await dismissSavedChatText(record, assertCurrent); assertCurrent(); volatile.delete(volatileKey(record)); publish();
    },
  };
}
