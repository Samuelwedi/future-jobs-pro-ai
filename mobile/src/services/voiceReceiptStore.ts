import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
export type VoiceMode = 'audio-only' | 'audio-transcribed';
export type VoiceReceipt = {
  requestKey: string; ownerId: string; companyId: string; projectId: string; timeEntryId: string | null;
  mode: VoiceMode; fileUri: string; fileInfo: { name: string; mimeType: string }; phase: 'prepared' | 'submitted';
};
let writes: Promise<unknown> = Promise.resolve();
const exclusive = <T>(work: () => Promise<T>): Promise<T> => {
  const next = writes.then(work); writes = next.catch(() => undefined); return next;
};
const key = (owner: string, company: string) => `voice-receipts-v1:${JSON.stringify([owner, company])}`;
const validKey = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{16,100}$/.test(value);
const text = (value: unknown): value is string => typeof value === 'string' && !!value;
const target = (record: Pick<VoiceReceipt, 'projectId' | 'timeEntryId'>) => JSON.stringify([record.projectId, record.timeEntryId]);
function folder(owner: string, company: string) {
  if (!FileSystem.documentDirectory) throw new Error('Local recording storage is unavailable.');
  return `${FileSystem.documentDirectory}voice-receipts/${encodeURIComponent(JSON.stringify([owner, company]))}/`;
}
function valid(record: any, owner: string, company: string) {
  return record && validKey(record.requestKey) && record.ownerId === owner && record.companyId === company
    && text(owner) && text(company) && text(record.projectId) && (record.timeEntryId === null || text(record.timeEntryId))
    && ['audio-only', 'audio-transcribed'].includes(record.mode)
    && record.fileInfo?.name === 'voice.m4a' && record.fileInfo.mimeType === 'audio/mp4'
    && ['prepared', 'submitted'].includes(record.phase)
    && record.fileUri === folder(owner, company) + record.requestKey + '.m4a';
}
async function read(owner: string, company: string): Promise<VoiceReceipt[]> {
  const raw = await AsyncStorage.getItem(key(owner, company));
  let records;
  try { records = raw ? JSON.parse(raw) : []; } catch { throw new Error('Saved recording records could not be read. They have not been changed.'); }
  if (!Array.isArray(records) || records.some(record => !valid(record, owner, company))
    || new Set(records.map(record => record.requestKey)).size !== records.length
    || new Set(records.map(target)).size !== records.length) {
    throw new Error('Saved recording records could not be read. They have not been changed.');
  }
  return records;
}
export function getPendingVoice(owner: string, company: string, projectId: string, timeEntryId: string | null) {
  // A replacement screen must not see an empty index while the old screen's
  // durable preparation is still writing. Internal transaction reads stay direct.
  return exclusive(async () => (await read(owner, company)).find(record => record.projectId === projectId && record.timeEntryId === timeEntryId));
}
const same = (a: VoiceReceipt, b: VoiceReceipt) => a.requestKey === b.requestKey && a.ownerId === b.ownerId
  && a.companyId === b.companyId && target(a) === target(b) && a.mode === b.mode && a.fileUri === b.fileUri
  && a.fileInfo.name === b.fileInfo.name && a.fileInfo.mimeType === b.fileInfo.mimeType;
export function prepareVoice(receipt: Omit<VoiceReceipt, 'fileUri' | 'phase'>, sourceUri: string, assertCurrent: () => void) {
  const snapshot = JSON.parse(JSON.stringify(receipt));
  return exclusive(async () => {
    assertCurrent();
    const record: VoiceReceipt = { ...snapshot, fileUri: folder(snapshot.ownerId, snapshot.companyId) + snapshot.requestKey + '.m4a', phase: 'prepared' };
    if (!valid(record, snapshot.ownerId, snapshot.companyId) || !sourceUri) throw new Error('Recording details are incomplete.');
    const records = await read(record.ownerId, record.companyId); assertCurrent();
    if (records.some(saved => target(saved) === target(record) || saved.requestKey === record.requestKey)) {
      throw new Error('Check the saved recording before recording another note.');
    }
    await FileSystem.makeDirectoryAsync(folder(record.ownerId, record.companyId), { intermediates: true }); assertCurrent();
    const existing = await FileSystem.getInfoAsync(record.fileUri); assertCurrent();
    if (existing.exists) throw new Error('Saved recording path already exists.');
    let copied = false, persistenceAttempted = false;
    try {
      copied = true; await FileSystem.copyAsync({ from: sourceUri, to: record.fileUri }); assertCurrent();
      const info = await FileSystem.getInfoAsync(record.fileUri); assertCurrent();
      if (!info.exists || info.isDirectory || !Number.isFinite(info.size) || info.size <= 0 || info.size > 100 * 1024 * 1024) {
        throw new Error('Choose a nonempty recording up to 100 MB.');
      }
      // A rejected storage acknowledgment may still have written. Preserve the
      // copy after attempting persistence; never strand a durable index without audio.
      persistenceAttempted = true;
      await AsyncStorage.setItem(key(record.ownerId, record.companyId), JSON.stringify([...records, record]));
      assertCurrent();
      return record;
    } catch (error) {
      if (copied && !persistenceAttempted) await FileSystem.deleteAsync(record.fileUri, { idempotent: true }).catch(() => undefined);
      throw error;
    }
  });
}
export function markVoiceSubmitted(receipt: VoiceReceipt, assertCurrent: () => void) {
  const snapshot = JSON.parse(JSON.stringify(receipt));
  return exclusive(async () => {
    assertCurrent();
    const records = await read(snapshot.ownerId, snapshot.companyId); assertCurrent();
    const stored = records.find(record => same(record, snapshot));
    if (!stored || stored.phase !== 'prepared') throw new Error('Check the saved recording status before continuing.');
    stored.phase = 'submitted';
    await AsyncStorage.setItem(key(stored.ownerId, stored.companyId), JSON.stringify(records));
    assertCurrent();
    return stored;
  });
}
export function completeVoice(receipt: VoiceReceipt, assertCurrent: () => void) {
  const snapshot = JSON.parse(JSON.stringify(receipt));
  return exclusive(async () => {
    assertCurrent();
    const records = await read(snapshot.ownerId, snapshot.companyId); assertCurrent();
    const stored = records.find(record => same(record, snapshot));
    if (!stored || stored.phase !== 'submitted') throw new Error('Saved recording acknowledgment could not be matched.');
    // Remove only this exact app-owned copy after a strict server acknowledgment.
    // Cleanup/write failure retains a submitted receipt for later status-only recovery.
    await FileSystem.deleteAsync(stored.fileUri, { idempotent: true }); assertCurrent();
    await AsyncStorage.setItem(key(stored.ownerId, stored.companyId), JSON.stringify(records.filter(record => record !== stored)));
    assertCurrent();
  });
}
