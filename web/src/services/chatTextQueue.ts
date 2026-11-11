import { type ChatOwner } from './chatSession';
import { createIndexedTextStore, type TextRecord, type TextRows, type TextStore, type TextReceipt, TEXT_ATTEMPT_LIMIT, TEXT_RECEIPT_CONFLICT } from './chatTextOutbox';
import { openTextTransport, readTextAuthorization } from './chatTextTransport';

let sharedStore: TextStore | undefined;
export function browserTextStore(): TextStore { return sharedStore ||= createIndexedTextStore(); }
// One controller belongs to one foreground room session. Tabs coordinate through
// transactional claims. Lease expiry can overlap requests, but never changes keys.
export function createTextQueue(options: {
  owner: ChatOwner; roomId: string; current: () => boolean; onRows: (rows: TextRows) => void;
  onSaved: (receipt: TextReceipt, localCommitted: boolean) => void; onError: (message: string) => void;
  batchSize?: number; store?: TextStore; transport?: ReturnType<typeof openTextTransport>; now?: () => number;
}) {
  const store = options.store || browserTextStore();
  const transport = options.transport || openTextTransport(options.owner, options.roomId, options.current);
  const scope = { actorId: options.owner.id, companyId: options.owner.companyId, roomId: options.roomId };
  const authorization = readTextAuthorization(options.owner);
  const now = options.now || Date.now;
  let active = true;
  let running: Promise<void> | null = null;
  const current = () => active && options.current() && transport.isCurrent();
  const report = () => { if (current()) options.onError('Local message storage could not be updated. Keep this browser data and retry with the same request.'); };
  const refresh = async () => {
    try { const rows = await store.list(scope); if (current()) options.onRows(rows); }
    catch { report(); }
  };
  async function drain() {
    try {
      // Bounded foreground batch. Subsequent visible ticks handle remaining work.
      for (let count = 0; count < (options.batchSize || 3) && current() && navigator.onLine !== false; count++) {
        const record = await store.claim(scope, authorization, crypto.randomUUID(), now(), current);
        if (!current() || !record) break;
        await refresh();
        if (!current()) break;
        const result = await transport.request(record, record.action);
        if (!current()) break;
        if (result.kind === 'saved') {
          let localCommitted = false;
          try {
            localCommitted = await store.finish(record, { state: 'saved', reason: '', nextAttempt: 0, receipt: result.receipt }, current);
          } catch (error: any) {
            if (error?.code === TEXT_RECEIPT_CONFLICT) {
              if (current()) options.onError('A conflicting saved-message receipt needs review. The original saved receipt was kept. Do not create another copy.');
              break; // Never emit/render the contradictory message UUID.
            }
            // A genuine storage failure does not undo the verified server save.
            // Same-key recovery remains safe; this is not a failed message.
          }
          if (!current()) break;
          options.onSaved(result.receipt, localCommitted);
          if (!localCommitted) break;
        } else {
          const uncertain = result.kind === 'uncertain' && record.attempts < TEXT_ATTEMPT_LIMIT && !record.unavailable;
          await store.finish(record, {
            state: uncertain ? 'uncertain' : 'needs-review', reason: result.reason,
            nextAttempt: uncertain ? now() + Math.min(60_000, 2000 * 2 ** (record.attempts - 1)) : 0,
            unavailable: record.unavailable || result.kind === 'unavailable',
          }, current);
          break; // Keep room ordering and avoid immediate retry loops.
        }
      }
    } catch { report(); }
    finally { await refresh(); }
  }
  const tick = (): Promise<void> => {
    if (!current()) return Promise.resolve();
    if (running) return running;
    running = drain().finally(() => { running = null; });
    return running;
  };
  return {
    tick, refresh,
    async review(record: TextRecord, action: 'send' | 'status') {
      if (!current() || record.actorId !== scope.actorId || record.companyId !== scope.companyId || record.roomId !== scope.roomId) return;
      try { await store.review(record, authorization, action, current); if (current()) await tick(); }
      catch { report(); }
      await refresh();
    },
    dispose() { active = false; },
  };
}

// App-shell coordinator: accepted messages are independent of route navigation.
// It deliberately has no timer/service worker of its own. The foreground shell
// supplies bounded ticks and revokes this runner at every lifecycle/auth boundary.
export function createOwnerTextRecovery(options: {
  owner: ChatOwner; current: () => boolean; onRows: (rows: TextRows) => void;
  onSaved: (receipt: TextReceipt, localCommitted: boolean) => void; onError: (message: string) => void;
  store?: TextStore;
}) {
  const store = options.store || browserTextStore();
  let active = true;
  let running: Promise<void> | null = null;
  let offset = 0;
  const current = () => active && options.current();
  const read = () => store.listOwner({ actorId: options.owner.id, companyId: options.owner.companyId });
  const tick = (): Promise<void> => {
    if (!current()) return Promise.resolve();
    if (running) return running;
    running = (async () => {
      try {
        const rows = await read();
        if (!current()) return;
        options.onRows(rows);
        const rooms = [...new Set(rows.records.filter(row => row.state !== 'saved').map(row => row.roomId))];
        // Rotate across blocked rooms so one room cannot starve another.
        for (let index = 0; index < Math.min(3, rooms.length) && current(); index++) {
          const roomId = rooms[(offset + index) % rooms.length];
          const queue = createTextQueue({ ...options, roomId, store, current, batchSize: 1, onRows: () => {} });
          await queue.tick();
          queue.dispose();
        }
        offset = rooms.length ? (offset + 3) % rooms.length : 0;
        const latest = await read();
        if (current()) options.onRows(latest);
      } catch { if (current()) options.onError('Local message storage is unavailable. Queued messages have not been discarded.'); }
    })().finally(() => { running = null; });
    return running;
  };
  return { tick, dispose() { active = false; } };
}
