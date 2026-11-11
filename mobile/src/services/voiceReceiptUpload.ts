import * as FileSystem from 'expo-file-system/legacy';
import { api, type VoiceSession } from './api';
import { checkOnlineStatus } from './offlineService';
import { getPendingVoice, prepareVoice, markVoiceSubmitted, completeVoice, type VoiceReceipt, type VoiceMode } from './voiceReceiptStore';
export { getPendingVoice } from './voiceReceiptStore';
export type { VoiceReceipt, VoiceMode } from './voiceReceiptStore';
export type VoiceOutcome = { state: 'completed'; response: any } | { state: 'prepared' | 'pending'; receipt: VoiceReceipt };
const flights = new Map<string, Promise<VoiceOutcome>>();
const identity = (session: VoiceSession, projectId: string, timeEntryId: string | null) => JSON.stringify([session.ownerId, session.companyId, projectId, timeEntryId]);
function assertSession(session: VoiceSession, current: () => boolean) {
  api.assertVoiceSession(session);
  if (!current()) throw new Error('Recording screen changed. Reopen the original project and shift.');
}
function flight(session: VoiceSession, projectId: string, timeEntryId: string | null, current: () => boolean, work: () => Promise<VoiceOutcome>) {
  assertSession(session, current);
  const id = identity(session, projectId, timeEntryId);
  // Do not hand a new screen/session an old operation's completion.
  if (flights.has(id)) throw new Error('This recording is already being checked. Please check its status shortly.');
  const task = work().finally(() => flights.delete(id)); flights.set(id, task); return task;
}
export function startVoiceUpload(session: VoiceSession, projectId: string, timeEntryId: string | null, mode: VoiceMode, sourceUri: string, current: () => boolean, onPrepared: (receipt: VoiceReceipt) => void = () => undefined) {
  return flight(session, projectId, timeEntryId, current, async () => {
    const record = await prepareVoice({ requestKey: `voice-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`,
      ownerId: session.ownerId, companyId: session.companyId, projectId, timeEntryId, mode,
      fileInfo: { name: 'voice.m4a', mimeType: 'audio/mp4' } }, sourceUri, () => assertSession(session, current));
    // The screen must relinquish the original-source retry before dispatch. Final
    // cleanup can remove this index even if its acknowledgment is subsequently lost.
    onPrepared(record);
    return continueStored(session, record, current);
  });
}
export function recoverVoiceUpload(session: VoiceSession, projectId: string, timeEntryId: string | null, current: () => boolean) {
  return flight(session, projectId, timeEntryId, current, async () => {
    const record = await getPendingVoice(session.ownerId, session.companyId, projectId, timeEntryId);
    assertSession(session, current);
    if (!record) throw new Error('Saved recording is unavailable.');
    return continueStored(session, record, current);
  });
}
async function continueStored(session: VoiceSession, receipt: VoiceReceipt, current: () => boolean): Promise<VoiceOutcome> {
  assertSession(session, current);
  const online = await checkOnlineStatus(); assertSession(session, current);
  if (!online) return { state: receipt.phase === 'prepared' ? 'prepared' : 'pending', receipt };
  let result;
  if (receipt.phase === 'prepared') {
    const info = await FileSystem.getInfoAsync(receipt.fileUri); assertSession(session, current);
    if (!info.exists || info.isDirectory || !Number.isFinite(info.size) || info.size <= 0 || info.size > 100 * 1024 * 1024) {
      throw new Error('Saved recording file is unavailable or invalid. It has not been submitted.');
    }
    receipt = await markVoiceSubmitted(receipt, () => assertSession(session, current));
    assertSession(session, current);
    try {
      result = await api.requestVoiceReceipt(session, receipt.requestKey, { uri: receipt.fileUri, ...receipt.fileInfo,
        projectId: receipt.projectId, timeEntryId: receipt.timeEntryId, mode: receipt.mode }, current);
    } catch {
      assertSession(session, current); return { state: 'pending', receipt };
    }
  } else {
    // Submitted recovery never reads the file or repeats POST, even after 404/410.
    try { result = await api.requestVoiceReceipt(session, receipt.requestKey, undefined, current); }
    catch { assertSession(session, current); return { state: 'pending', receipt }; }
  }
  assertSession(session, current);
  const data = result.data, verified = data?.receiptIdentity;
  if (result.status === 200 && data?.success === true && data.state === 'completed' && data.retryAllowed === false
    && data.requestKey === receipt.requestKey && typeof data.voiceNoteId === 'string' && !!data.voiceNoteId
    && verified?.actorId === receipt.ownerId && verified.companyId === receipt.companyId
    && verified.projectId === receipt.projectId && verified.timeEntryId === receipt.timeEntryId && verified.mode === receipt.mode
    && typeof data.audioUrl === 'string' && !!data.audioUrl
    && data.transcriptionStatus === (receipt.mode === 'audio-only' ? 'skipped' : 'completed')) {
    await completeVoice(receipt, () => assertSession(session, current));
    assertSession(session, current);
    return { state: 'completed', response: data };
  }
  return { state: 'pending', receipt };
}
