import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
export type AttachmentReceipt = {
  requestKey: string; ownerId: string; companyId: string; timeEntryId: string;
  fileUri: string; fileInfo: { name: string; mimeType?: string }; phase: 'prepared' | 'submitted';
};
let writes: Promise<unknown> = Promise.resolve();
const exclusive = <T>(work: () => Promise<T>): Promise<T> => {
  const next = writes.then(work); writes = next.catch(() => undefined); return next;
};
const key = (owner: string, company: string) => `attachment-receipts-v1:${JSON.stringify([owner,company])}`;
const validKey = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{16,100}$/.test(value);
function folder(owner: string, company: string) {
  if (!FileSystem.documentDirectory) throw new Error('Local storage is unavailable.');
  return `${FileSystem.documentDirectory}attachment-receipts/${encodeURIComponent(JSON.stringify([owner,company]))}/`;
}
async function read(owner: string, company: string): Promise<AttachmentReceipt[]> {
  const raw = await AsyncStorage.getItem(key(owner,company));
  const records = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(records) || records.some(r => !r || !validKey(r.requestKey) || r.ownerId !== owner || r.companyId !== company
    || typeof r.timeEntryId !== 'string' || !r.timeEntryId || !r.fileInfo || typeof r.fileInfo.name !== 'string' || !r.fileInfo.name
    || (r.fileInfo.mimeType !== undefined && typeof r.fileInfo.mimeType !== 'string')
    || (r.phase !== 'prepared' && r.phase !== 'submitted') || r.fileUri !== folder(owner,company) + r.requestKey + '.bin') ) {
    throw new Error('Saved attachment records could not be read. They have not been changed.');
  }
  if (new Set(records.map(r=>r.requestKey)).size !== records.length || new Set(records.map(r=>r.timeEntryId)).size !== records.length) {
    throw new Error('Saved attachment records could not be read. They have not been changed.');
  }
  return records;
}
export async function getPendingAttachment(owner: string, company: string, timeEntryId: string) {
  return (await read(owner,company)).find(r => r.timeEntryId === timeEntryId);
}
export function prepareAttachment(receipt: Omit<AttachmentReceipt,'fileUri'|'phase'>, sourceUri: string, assertCurrent: () => void) {
  // Snapshot before storage waits so caller edits cannot alter persisted identity or metadata.
  const snapshot = JSON.parse(JSON.stringify(receipt));
  return exclusive(async () => {
    assertCurrent();
    if (!validKey(snapshot.requestKey) || !snapshot.ownerId || !snapshot.companyId || !snapshot.timeEntryId || !snapshot.fileInfo?.name) throw new Error('Attachment details are incomplete.');
    if (typeof snapshot.fileInfo.name !== 'string' || snapshot.fileInfo.name.length > 255 || /[\\/\x00-\x1f\x7f]/.test(snapshot.fileInfo.name) || !/\.(pdf|doc|docx|xls|xlsx|csv|txt|rtf|png|jpg|jpeg|webp|mp3|m4a|wav|mp4|mov|webm)$/i.test(snapshot.fileInfo.name)) throw new Error('Choose a supported file up to 100 MB.');
    const records = await read(snapshot.ownerId,snapshot.companyId); assertCurrent();
    if (records.some(r=>r.timeEntryId===snapshot.timeEntryId)) throw new Error('Check the saved attachment before choosing another file.');
    const directory = folder(snapshot.ownerId,snapshot.companyId), fileUri = directory + snapshot.requestKey + '.bin';
    await FileSystem.makeDirectoryAsync(directory,{intermediates:true}); assertCurrent();
    if ((await FileSystem.getInfoAsync(fileUri)).exists) throw new Error('Saved attachment path already exists.');
    assertCurrent();
    let copied = false;
    try {
      copied = true; await FileSystem.copyAsync({from:sourceUri,to:fileUri}); assertCurrent();
      const copiedInfo = await FileSystem.getInfoAsync(fileUri); assertCurrent();
      if (!copiedInfo.exists || copiedInfo.isDirectory || !Number.isFinite(copiedInfo.size) || copiedInfo.size <= 0 || copiedInfo.size > 100 * 1024 * 1024) throw new Error('Choose a supported file up to 100 MB.');
      const record: AttachmentReceipt = {...snapshot,fileUri,phase:'prepared'};
      await AsyncStorage.setItem(key(snapshot.ownerId,snapshot.companyId),JSON.stringify([...records,record]));
      return record;
    } catch (error) {
      // No POST has started. Remove only this newly created app copy on preparation failure.
      if (copied) await FileSystem.deleteAsync(fileUri,{idempotent:true}).catch(()=>undefined);
      throw error;
    }
  });
}
export function markAttachmentSubmitted(receipt: AttachmentReceipt, assertCurrent: () => void) {
  return exclusive(async () => {
    assertCurrent();
    const records = await read(receipt.ownerId,receipt.companyId); assertCurrent();
    const stored = records.find(r=>r.requestKey===receipt.requestKey && r.timeEntryId===receipt.timeEntryId);
    if (!stored) throw new Error('Saved attachment is unavailable.');
    stored.phase = 'submitted';
    await AsyncStorage.setItem(key(receipt.ownerId,receipt.companyId),JSON.stringify(records));
    return stored;
  });
}
export function completeAttachment(receipt: AttachmentReceipt) {
  return exclusive(async () => {
    const records = await read(receipt.ownerId,receipt.companyId);
    const stored = records.find(r=>r.requestKey===receipt.requestKey && r.timeEntryId===receipt.timeEntryId);
    if (!stored) return;
    // A failed cleanup/write keeps a submitted receipt for later status-only reconciliation.
    await FileSystem.deleteAsync(stored.fileUri,{idempotent:true});
    await AsyncStorage.setItem(key(receipt.ownerId,receipt.companyId),JSON.stringify(records.filter(r=>r!==stored)));
  });
}
