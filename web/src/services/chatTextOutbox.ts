// A dedicated, versioned text outbox. Never accepts URLs, credentials, attachments
// or legacy unkeyed records. IndexedDB transactions arbitrate tabs, not localStorage.
export type TextScope = Readonly<{ actorId: string; companyId: string; roomId: string }>;
export type TextIdentity = TextScope & Readonly<{ key: string; text: string }>;
export type TextAuthorization = { generation: string | null; role: string };
export type SavedText = {
  id: string; sender_id: string; company_id: string; room_id: string; message: string;
  created_at: string; attachment_id: null; attachment_name?: null; attachment_type?: null; attachment_size?: null;
  sender_name?: string; sender_avatar?: string | null;
};
export type TextReceipt = { success: true; message: SavedText; request: TextScope & {
  key: string; state: 'saved'; replayed: boolean;
} };
export type TextState = 'queued' | 'sending' | 'uncertain' | 'needs-review' | 'saved';
export type TextRecord = TextIdentity & {
  version: 1; sequence?: number; createdAt: number; authorization: TextAuthorization;
  state: TextState; attempts: number; nextAttempt: number; action: 'send' | 'status';
  lease: { id: string; until: number } | null; reason: string; unavailable: boolean; receipt?: TextReceipt;
};
export const TEXT_RECEIPT_CONFLICT = 'CHAT_TEXT_RECEIPT_CONFLICT';
export const TEXT_ATTEMPT_LIMIT = 5;
export const TEXT_LEASE_MS = 90_000; // Longer than the bounded HTTP attempt.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const requestKey = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
function validUnicode(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 0 || (code >= 0xdc00 && code <= 0xdfff)) return false;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    }
  }
  return true;
}
export function validTextIdentity(value: any): value is TextIdentity {
  return !!value && typeof value.actorId === 'string' && uuid.test(value.actorId)
    && typeof value.companyId === 'string' && uuid.test(value.companyId)
    && typeof value.roomId === 'string' && value.roomId.length > 0 && value.roomId.length <= 255
    && value.roomId.trim() === value.roomId && validUnicode(value.roomId) && !value.roomId.startsWith('support-ticket-')
    && typeof value.key === 'string' && requestKey.test(value.key)
    && typeof value.text === 'string' && value.text.length > 0 && value.text.length <= 5000
    && value.text.trim() === value.text && validUnicode(value.text);
}
export function sameText(a: TextIdentity, b: TextIdentity): boolean {
  return a.key === b.key && a.actorId === b.actorId && a.companyId === b.companyId && a.roomId === b.roomId && a.text === b.text;
}
export function receiptIdentity(value: any, record: TextIdentity, state: string): boolean {
  return !!value && value.key === record.key && value.actorId === record.actorId
    && value.companyId === record.companyId && value.roomId === record.roomId && value.state === state;
}
export function validTextReceipt(data: any, record: TextIdentity): data is TextReceipt {
  const message = data?.message;
  return data?.success === true && receiptIdentity(data.request, record, 'saved') && typeof data.request.replayed === 'boolean'
    && !!message && typeof message.id === 'string' && uuid.test(message.id)
    && message.sender_id === record.actorId && message.company_id === record.companyId && message.room_id === record.roomId
    && message.message === record.text && message.attachment_id === null
    && (message.attachment_name === undefined || message.attachment_name === null)
    && (message.attachment_type === undefined || message.attachment_type === null)
    && (message.attachment_size === undefined || message.attachment_size === null)
    && typeof message.created_at === 'string' && Number.isFinite(Date.parse(message.created_at));
}
export function validTextRecord(value: any): value is TextRecord {
  return validTextIdentity(value as unknown) && value.version === 1 && Number.isSafeInteger(value.sequence) && value.sequence > 0
    && Number.isFinite(value.createdAt) && value.createdAt >= 0
    && value.authorization && (value.authorization.generation === null || typeof value.authorization.generation === 'string')
    && typeof value.authorization.role === 'string' && !!value.authorization.role
    && ['queued', 'sending', 'uncertain', 'needs-review', 'saved'].includes(value.state)
    && Number.isSafeInteger(value.attempts) && value.attempts >= 0 && Number.isFinite(value.nextAttempt)
    && ['send', 'status'].includes(value.action) && typeof value.reason === 'string' && typeof value.unavailable === 'boolean'
    && (value.lease === null || (!!value.lease && typeof value.lease.id === 'string' && Number.isFinite(value.lease.until)))
    && (value.state !== 'saved' || validTextReceipt(value.receipt, value));
}
export function createTextRecord(scope: TextScope, text: string, authorization: TextAuthorization): TextRecord {
  // No weak-random fallback. An unavailable secure key generator blocks enqueue.
  const record: TextRecord = { ...scope, text: text.trim(), key: crypto.randomUUID(), version: 1, createdAt: Date.now(),
    authorization: { ...authorization }, state: 'queued', attempts: 0, nextAttempt: 0, action: 'send', lease: null,
    reason: '', unavailable: false };
  if (!validTextIdentity(record) || text.length > 5000) throw new Error('Enter valid text of at most 5000 characters.');
  return Object.freeze(record);
}
export type TextRows = { records: TextRecord[]; invalid: number };
export interface TextStore {
  enqueue(record: TextRecord, current: () => boolean): Promise<TextRecord>;
  list(scope: TextScope): Promise<TextRows>;
  listOwner(scope: Pick<TextScope, 'actorId' | 'companyId'>): Promise<TextRows>;
  claim(scope: TextScope, authorization: TextAuthorization, leaseId: string, now: number, current: () => boolean): Promise<TextRecord | null>;
  finish(record: TextRecord, patch: Pick<TextRecord, 'state' | 'reason' | 'nextAttempt'> & Partial<Pick<TextRecord, 'unavailable' | 'receipt'>>, current: () => boolean): Promise<boolean>;
  review(record: TextRecord, authorization: TextAuthorization, action: 'send' | 'status', current: () => boolean): Promise<void>;
}
const sameAuthorization = (a: TextAuthorization, b: TextAuthorization) => a.generation === b.generation && a.role === b.role;
export const textScopeKey = (scope: TextScope) => [scope.actorId, scope.companyId, scope.roomId];

export function createIndexedTextStore(factory: IDBFactory = indexedDB, name = 'future-jobs-chat-text-v1'): TextStore {
  let database: Promise<IDBDatabase> | null = null;
  function open(): Promise<IDBDatabase> {
    if (database) return database;
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(name, 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('texts', { keyPath: 'sequence', autoIncrement: true });
        store.createIndex('key', 'key', { unique: true });
        store.createIndex('scope', ['actorId', 'companyId', 'roomId']);
        store.createIndex('owner', ['actorId', 'companyId']);
      };
      request.onerror = () => reject(request.error || new Error('Cannot open local message storage.'));
      request.onblocked = () => reject(new Error('Local message storage is busy in another tab. Close that tab and retry.'));
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); database = null; };
        resolve(db);
      };
    }).catch(error => { database = null; throw error; });
    return database;
  }
  async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, set: (value: T) => void, fail: (error: unknown) => void) => void): Promise<T> {
    const db = await open();
    return new Promise((resolve, reject) => {
      let value: T;
      let failure: unknown;
      let tx: IDBTransaction;
      try { tx = db.transaction('texts', mode, mode === 'readwrite' ? { durability: 'strict' } : undefined); }
      catch (error) { reject(error); return; }
      // Request success is NOT commit. Only transaction completion resolves.
      tx.oncomplete = () => resolve(value);
      tx.onabort = () => reject(failure || tx.error || new Error('Local message storage transaction was aborted.'));
      tx.onerror = () => { /* abort is the terminal outcome; never resolve here */ };
      // Preserve typed errors raised inside later IDB request callbacks too.
      const fail = (error: unknown) => { failure = error; tx.abort(); };
      try { run(tx.objectStore('texts'), result => { value = result; }, fail); }
      catch (error) { fail(error); }
    });
  }
  function readScope(store: IDBObjectStore, scope: TextScope, run: (rows: any[]) => void) {
    const request = store.index('scope').getAll(textScopeKey(scope));
    request.onsuccess = () => {
      try { run(request.result); }
      catch { store.transaction.abort(); }
    };
  }
  return {
    enqueue(record, current) {
      if (!validTextIdentity(record)) return Promise.reject(new Error('Invalid local message.'));
      return transaction('readwrite', (store, set) => {
        const request = store.index('key').get(record.key);
        request.onsuccess = () => {
          if (!current()) { store.transaction.abort(); return; }
          const previous = request.result;
          if (previous) {
            if (!validTextRecord(previous) || !sameText(previous, record)) { store.transaction.abort(); return; }
            set(previous); // Retry an ambiguous enqueue with the exact same key.
          } else {
            const add = store.add(record);
            add.onsuccess = () => set({ ...record, sequence: Number(add.result) });
          }
        };
      });
    },
    list(scope) {
      return transaction('readonly', (store, set) => readScope(store, scope, rows => set({
        records: rows.filter(validTextRecord), invalid: rows.filter(row => !validTextRecord(row)).length,
      })));
    },
    listOwner(scope) {
      return transaction('readonly', (store, set) => {
        const request = store.index('owner').getAll([scope.actorId, scope.companyId]);
        request.onsuccess = () => set({ records: request.result.filter(validTextRecord), invalid: request.result.filter(row => !validTextRecord(row)).length });
      });
    },
    claim(scope, authorization, leaseId, now, current) {
      return transaction('readwrite', (store, set) => {
        set(null);
        readScope(store, scope, rows => {
          if (!current() || rows.some(row => !validTextRecord(row))) return;
          // The scope index is ordered by its auto-increment primary key. The
          // first unsaved record blocks later intents, even when it needs review.
          const record: TextRecord | undefined = rows.find(row => row.state !== 'saved');
          if (!record || (record.lease && record.lease.until > now)) return;
          if (!sameAuthorization(record.authorization, authorization)) {
            store.put({ ...record, state: 'needs-review', reason: 'Account session or role changed. Review before retrying.', lease: null });
            return;
          }
          if (record.state === 'needs-review' || record.nextAttempt > now) return;
          if (record.attempts >= TEXT_ATTEMPT_LIMIT) {
            store.put({ ...record, state: 'needs-review', reason: 'Automatic attempts paused. Check status or retry this same message.', lease: null });
            return;
          }
          const claimed: TextRecord = { ...record, state: 'sending', attempts: record.attempts + 1,
            lease: { id: leaseId, until: now + TEXT_LEASE_MS } };
          store.put(claimed); set(claimed);
        });
      });
    },
    finish(record, patch, current) {
      return transaction('readwrite', (store, set, fail) => {
        set(false);
        const request = store.index('key').get(record.key);
        request.onsuccess = () => {
          const previous = request.result;
          if (!current() || !validTextRecord(previous) || !sameText(previous, record)) return;
          if (previous.state === 'saved') {
            // Once known, the original saved UUID is part of our evidence. A
            // contradictory later reply must not render a second message even
            // though a conforming server cannot produce this contradiction.
            if (patch.state === 'saved' && (!validTextReceipt(patch.receipt, record)
              || patch.receipt.message.id !== previous.receipt!.message.id)) {
              fail(Object.assign(new Error('The saved receipt conflicts with the original message.'), { code: TEXT_RECEIPT_CONFLICT }));
              return;
            }
            set(true); return;
          }
          if (patch.state === 'saved' ? !validTextReceipt(patch.receipt, record) : previous.lease?.id !== record.lease?.id) return;
          // A late, valid saved receipt is monotonic even after its lease expired.
          // No mutation ever inserts a missing record or rewrites its identity.
          store.put({ ...previous, ...patch, lease: null }); set(true);
        };
      });
    },
    review(record, authorization, action, current) {
      return transaction('readwrite', (store, set) => {
        set(undefined);
        const request = store.index('key').get(record.key);
        request.onsuccess = () => {
          const previous = request.result;
          if (!current() || !validTextRecord(previous) || !sameText(previous, record) || previous.state === 'saved'
            || (previous.lease && previous.lease.until > Date.now()) || (previous.unavailable && action === 'send')) return;
          store.put({ ...previous, authorization: { ...authorization }, action, state: 'queued', attempts: 0, nextAttempt: 0, lease: null, reason: '' });
        };
      });
    },
  };
}
