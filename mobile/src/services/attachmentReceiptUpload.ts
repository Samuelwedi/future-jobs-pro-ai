import * as FileSystem from 'expo-file-system/legacy';
import { api, type AttachmentSession } from './api';
import { checkOnlineStatus } from './offlineService';
import { getPendingAttachment, prepareAttachment, markAttachmentSubmitted, completeAttachment, type AttachmentReceipt } from './attachmentReceiptStore';
export { getPendingAttachment } from './attachmentReceiptStore';
export type { AttachmentReceipt } from './attachmentReceiptStore';
export type AttachmentOutcome = { state: 'completed' | 'prepared' | 'pending'; receipt?: AttachmentReceipt };
const flights = new Map<string,Promise<AttachmentOutcome>>();
const identity = (session: AttachmentSession, entryId: string) => JSON.stringify([session.ownerId,session.companyId,entryId]);
function assertSession(session: AttachmentSession, current: () => boolean) {
  api.assertAttachmentSession(session);
  if (!current()) throw new Error('Attachment screen changed. Reopen the original time entry.');
}
export function startAttachmentUpload(session: AttachmentSession, timeEntryId: string, file: {uri:string;name:string;mimeType?:string}, current: () => boolean) {
  const id = identity(session,timeEntryId);
  if (flights.has(id)) return flights.get(id)!;
  const task = (async () => {
    const record = await prepareAttachment({requestKey:`attachment-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`,
      ownerId:session.ownerId,companyId:session.companyId,timeEntryId,fileInfo:{name:file.name,mimeType:file.mimeType}},file.uri,()=>assertSession(session,current));
    return continueStored(session,record,current);
  })().finally(()=>flights.delete(id));
  flights.set(id,task); return task;
}
export function recoverAttachmentUpload(session: AttachmentSession, timeEntryId: string, current: () => boolean) {
  const id = identity(session,timeEntryId);
  if (flights.has(id)) return flights.get(id)!;
  const task = (async () => {
    assertSession(session,current);
    const record = await getPendingAttachment(session.ownerId,session.companyId,timeEntryId);
    assertSession(session,current);
    if (!record) throw new Error('Saved attachment is unavailable.');
    return continueStored(session,record,current);
  })().finally(()=>flights.delete(id));
  flights.set(id,task); return task;
}
async function continueStored(session: AttachmentSession, record: AttachmentReceipt, current: () => boolean): Promise<AttachmentOutcome> {
  assertSession(session,current);
  const online = await checkOnlineStatus(); assertSession(session,current);
  if (!online) return {state:record.phase==='prepared'?'prepared':'pending',receipt:record};
  let result;
  if (record.phase === 'prepared') {
    const info = await FileSystem.getInfoAsync(record.fileUri); assertSession(session,current);
    if (!info.exists) throw new Error('Saved attachment file is unavailable.');
    record = await markAttachmentSubmitted(record,()=>assertSession(session,current));
    assertSession(session,current);
    try {
      result = await api.requestAttachmentReceipt(session,record.requestKey,{uri:record.fileUri,...record.fileInfo,timeEntryId:record.timeEntryId},current);
    } catch {
      assertSession(session,current); return {state:'pending',receipt:record};
    }
  } else {
    // A submitted receipt is status-only, including missing, expired, or ambiguous server outcomes.
    try { result = await api.requestAttachmentReceipt(session,record.requestKey,undefined,current); }
    catch { assertSession(session,current); return {state:'pending',receipt:record}; }
  }
  assertSession(session,current);
  const data = result.data, attachment = data?.attachment;
  if ((result.status === 200 || result.status === 201) && data?.success === true && data.requestKey === record.requestKey
    && typeof attachment?.id === 'string' && attachment.id && attachment.company_id === record.companyId
    && attachment.uploaded_by === record.ownerId && attachment.time_entry_id === record.timeEntryId && attachment.file_name === record.fileInfo.name) {
    await completeAttachment(record);
    assertSession(session,current); return {state:'completed'};
  }
  return {state:'pending',receipt:record};
}
