import AsyncStorage from '@react-native-async-storage/async-storage';

export type ChatTextOwner = Readonly<{ id: string; companyId: string; role: string }>;
export type ChatTextIntent = Readonly<{
  version: 1; requestKey: string; ownerId: string; companyId: string; role: string;
  roomId: string; text: string; createdAt: number;
}>;
export type ChatTextRecord = ChatTextIntent & {
  state: 'queued' | 'sending' | 'uncertain' | 'needs-review' | 'saved';
  attempts: number; nextAttemptAt: number; sequence: number; approvedRole: string; approvedGeneration: string; stopPost?: true; reason?: string; receipt?: any;
};
export type ChatTextProblem = { storageKey: string; roomId?: string; reason: string };
export type ChatTextSnapshot = { records: ChatTextRecord[]; problems: ChatTextProblem[] };
const PREFIX = 'chat-text-outbox-v1:';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const scope = (owner: Pick<ChatTextOwner, 'id' | 'companyId'>) => PREFIX + JSON.stringify([owner.id, owner.companyId]) + ':';
const storageKey = (r: ChatTextIntent) => scope({ id: r.ownerId, companyId: r.companyId }) + JSON.stringify([r.roomId, r.requestKey]);
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
let writes: Promise<unknown> = Promise.resolve();
const exclusive = <T>(work: () => Promise<T>): Promise<T> => {
  const next = writes.then(work); writes = next.catch(() => undefined); return next;
};
// JS strings must round-trip through UTF-8, matching the server's text contract.
function validString(value: unknown, max: number): value is string {
  if (typeof value !== 'string' || !value.length || value.length > max || value.includes('\0')) return false;
  for (let i = 0; i < value.length; i++) {
    const n = value.charCodeAt(i);
    if (n >= 0xd800 && n <= 0xdbff) { const low = value.charCodeAt(++i); if (!(low >= 0xdc00 && low <= 0xdfff)) return false; }
    else if (n >= 0xdc00 && n <= 0xdfff) return false;
  }
  return true;
}
export function validChatTextIntent(r: any): boolean {
  return !!r && r.version === 1 && typeof r.requestKey === 'string' && KEY.test(r.requestKey)
    && typeof r.ownerId === 'string' && UUID.test(r.ownerId) && typeof r.companyId === 'string' && UUID.test(r.companyId)
    && validString(r.role, 100) && validString(r.roomId, 255) && r.roomId.trim() === r.roomId
    && !r.roomId.startsWith('support-ticket-') && validString(r.text, 5000) && r.text.trim() === r.text
    && Number.isSafeInteger(r.createdAt) && r.createdAt > 0;
}
export function sameChatTextIntent(a: ChatTextIntent, b: ChatTextIntent) {
  return a.version === b.version && a.requestKey === b.requestKey && a.ownerId === b.ownerId
    && a.companyId === b.companyId && a.role === b.role && a.roomId === b.roomId
    && a.text === b.text && a.createdAt === b.createdAt;
}
export function matchesChatTextIdentity(r: ChatTextIntent, value: any, state: string) {
  return value?.key === r.requestKey && value.actorId === r.ownerId && value.companyId === r.companyId
    && value.roomId === r.roomId && value.state === state;
}
export function validChatTextReceipt(r: ChatTextIntent, value: any) {
  const m = value?.message;
  return value?.success === true && matchesChatTextIdentity(r, value.request, 'saved')
    && typeof value.request.replayed === 'boolean' && m && typeof m.id === 'string' && UUID.test(m.id)
    && m.sender_id === r.ownerId && m.company_id === r.companyId && m.room_id === r.roomId
    && m.message === r.text && m.attachment_id === null
    && m.attachment_name === null && m.attachment_type === null && m.attachment_size === null
    && (!(r as ChatTextRecord).receipt?.message?.id || m.id === (r as ChatTextRecord).receipt.message.id)
    && typeof m.created_at === 'string' && Number.isFinite(Date.parse(m.created_at));
}
function validRecord(r: any): r is ChatTextRecord {
  return validChatTextIntent(r) && ['queued', 'sending', 'uncertain', 'needs-review', 'saved'].includes(r.state)
    && Number.isSafeInteger(r.attempts) && r.attempts >= 0 && Number.isFinite(r.nextAttemptAt) && r.nextAttemptAt >= 0
    && validString(r.approvedRole, 100) && validString(r.approvedGeneration, 200)
    && Number.isSafeInteger(r.sequence) && r.sequence > 0 && (r.stopPost === undefined || r.stopPost === true)
    && (r.reason === undefined || typeof r.reason === 'string')
    && (r.receipt === undefined || validChatTextReceipt(r, r.receipt))
    && (r.state !== 'saved' || validChatTextReceipt(r, r.receipt));
}
export function createChatTextIntent(owner: ChatTextOwner, roomId: string, raw: string): ChatTextIntent {
  // Validate before trim, including the raw 5000-code-unit admission bound.
  if (!validString(raw, 5000)) throw new Error('Enter valid text up to 5000 characters.');
  const r: ChatTextIntent = { version: 1, requestKey: `text-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`,
    ownerId: owner.id, companyId: owner.companyId, role: owner.role, roomId, text: raw.trim(), createdAt: Date.now() };
  if (!validChatTextIntent(r)) throw new Error('A current account and ordinary conversation are required.');
  return Object.freeze(r);
}
async function readAll(owner: ChatTextOwner, assertCurrent: () => void): Promise<ChatTextSnapshot> {
  assertCurrent();
  const keys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith(scope(owner))).sort(); assertCurrent();
  const records: ChatTextRecord[] = [], problems: ChatTextProblem[] = [];
  if (keys.length > 500) problems.push({ storageKey: scope(owner), reason: 'Too many saved records. Some records are not shown and have not been changed.' });
  for (const key of keys.slice(0, 500)) {
    let roomId: string | undefined;
    try { const tuple = JSON.parse(key.slice(scope(owner).length)); if (Array.isArray(tuple) && typeof tuple[0] === 'string') roomId = tuple[0]; } catch { /* retain malformed keys */ }
    let raw;
    try { raw = await AsyncStorage.getItem(key); } catch { assertCurrent(); problems.push({ storageKey: key, roomId, reason: 'Saved text could not be read. It has not been changed.' }); continue; }
    assertCurrent();
    try {
      const record = JSON.parse(raw || 'null');
      if (!validRecord(record) || record.ownerId !== owner.id || record.companyId !== owner.companyId || storageKey(record) !== key) throw new Error('invalid');
      records.push(record);
    } catch { problems.push({ storageKey: key, roomId, reason: 'A saved text record needs review. It has been retained and will not be sent automatically.' }); }
  }
  records.sort((a, b) => a.sequence - b.sequence || a.requestKey.localeCompare(b.requestKey));
  return { records, problems };
}
export function readChatTextOutbox(owner: ChatTextOwner, assertCurrent: () => void) {
  return exclusive(() => readAll({ ...owner }, assertCurrent));
}
export function persistChatTextIntent(intent: ChatTextIntent, assertCurrent: () => void, approval: { role: string; generation: string }): Promise<ChatTextRecord> {
  const r = copy(intent);
  return exclusive(async () => {
    assertCurrent(); if (!validChatTextIntent(r)) throw new Error('Invalid saved text identity.');
    const raw = await AsyncStorage.getItem(storageKey(r)); assertCurrent();
    if (raw !== null) {
      const previous = JSON.parse(raw);
      if (!validRecord(previous) || !sameChatTextIntent(previous, r)) throw new Error('Saved text identity conflicts. Nothing was changed.');
      return previous;
    }
    const keys = await AsyncStorage.getAllKeys(); assertCurrent();
    if (keys.filter(key => key.startsWith(scope({ id: r.ownerId, companyId: r.companyId }))).length >= 500) throw new Error('Review saved text records before adding another.');
    const existing = await readAll({ id: r.ownerId, companyId: r.companyId, role: r.role }, assertCurrent); assertCurrent();
    const sequence = Math.max(0, ...existing.records.map(record => record.sequence)) + 1;
    const record: ChatTextRecord = { ...r, state: 'queued', attempts: 0, nextAttemptAt: 0, sequence, approvedRole: approval.role, approvedGeneration: approval.generation };
    if (!validRecord(record)) throw new Error('Invalid session approval.');
    // Never delete on rejection: storage may have committed before rejecting.
    await AsyncStorage.setItem(storageKey(r), JSON.stringify(record));
    // Once the write is acknowledged, admission succeeded. Navigation afterward
    // must not cancel this durable intent; dispatch has its own owner fences.
    return record;
  });
}
export function updateChatTextRecord(record: ChatTextRecord, assertCurrent: () => void): Promise<void> {
  const r = copy(record);
  return exclusive(async () => {
    assertCurrent(); if (!validRecord(r)) throw new Error('Invalid text receipt.');
    const raw = await AsyncStorage.getItem(storageKey(r)); assertCurrent();
    const previous = JSON.parse(raw || 'null');
    if (!validRecord(previous) || !sameChatTextIntent(previous, r)) throw new Error('Saved text record changed.');
    if (previous.receipt && (!r.receipt || r.receipt.message.id !== previous.receipt.message.id)) {
      throw Object.assign(new Error('Saved receipt identity conflicts. The original message is retained.'), { code: 'CHAT_TEXT_RECEIPT_CONFLICT' });
    }
    await AsyncStorage.setItem(storageKey(r), JSON.stringify(r)); assertCurrent();
  });
}
export function dismissSavedChatText(record: ChatTextRecord, assertCurrent: () => void): Promise<void> {
  const r = copy(record);
  return exclusive(async () => {
    assertCurrent();
    const raw = await AsyncStorage.getItem(storageKey(r)); assertCurrent();
    if (raw === null) return;
    const previous = JSON.parse(raw);
    if (!validRecord(previous) || previous.state !== 'saved' || !sameChatTextIntent(previous, r)
      || !validChatTextReceipt(previous, previous.receipt)) throw new Error('Check the saved receipt before dismissing it.');
    await AsyncStorage.removeItem(storageKey(r)); assertCurrent();
  });
}
