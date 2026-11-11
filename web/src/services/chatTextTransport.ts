import { API_BASE } from './api';
import { captureAuthSession } from './authSession';
import { chatOwnerKey, readChatOwner, type ChatOwner } from './chatSession';
import { receiptIdentity, validTextIdentity, validTextReceipt, type TextIdentity, type TextReceipt } from './chatTextOutbox';

export type TextResult = { kind: 'saved'; receipt: TextReceipt } | { kind: 'missing' | 'unavailable' | 'review' | 'uncertain'; reason: string };
export function readTextAuthorization(owner: ChatOwner) {
  // Storage failures block, rather than guessing a generation or saving tokens.
  return { generation: localStorage.getItem('auth-generation'), role: owner.role };
}
export function openTextTransport(owner: ChatOwner, roomId: string, viewCurrent: () => boolean) {
  const captured = Object.freeze({ ...owner });
  const auth = captureAuthSession();
  const key = chatOwnerKey(captured);
  const isCurrent = () => auth.isCurrent() && viewCurrent() && chatOwnerKey(readChatOwner()) === key;
  const assertCurrent = () => { if (!isCurrent()) throw Object.assign(new Error('Account or view changed.'), { code: 'CHAT_STALE' }); };
  async function request(record: TextIdentity, action: 'send' | 'status'): Promise<TextResult> {
    assertCurrent();
    if (!validTextIdentity(record) || record.actorId !== captured.id || record.companyId !== captured.companyId || record.roomId !== roomId) {
      throw Object.assign(new Error('Queued message scope changed.'), { code: 'CHAT_STALE' });
    }
    if (navigator.onLine === false) return { kind: 'uncertain', reason: 'Offline. Kept on this browser for retry.' };
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    try {
      const statusPath = `/api/chat/room/${encodeURIComponent(record.roomId)}/requests/${encodeURIComponent(record.key)}`
        + `?expectedCompanyId=${encodeURIComponent(record.companyId)}&expectedActorId=${encodeURIComponent(record.actorId)}`;
      const response = await fetch(`${API_BASE}${action === 'send' ? '/api/chat/message-requests' : statusPath}`, {
        method: action === 'send' ? 'POST' : 'GET', cache: 'no-store', signal: controller.signal,
        headers: { Authorization: `Bearer ${captured.token}`, ...(action === 'send' ? { 'Content-Type': 'application/json' } : {}) },
        ...(action === 'send' ? { body: JSON.stringify({ roomId: record.roomId, message: record.text, requestKey: record.key,
          expectedCompanyId: record.companyId, expectedActorId: record.actorId }) } : {}),
      });
      assertCurrent();
      const data = await response.json().catch(() => null);
      assertCurrent();
      if (response.ok) return validTextReceipt(data, record) ? { kind: 'saved', receipt: data }
        : { kind: 'review', reason: 'The server reply did not match this message. Check status before retrying.' };
      if (action === 'status' && response.status === 404 && data?.success === false && data.code === 'CHAT_REQUEST_NOT_FOUND'
        && receiptIdentity(data.request, record, 'missing')) {
        return { kind: 'missing', reason: 'No receipt found yet. An earlier request can still finish. Retry only this same message.' };
      }
      if (response.status === 410) return { kind: 'unavailable', reason: 'The original message is unavailable. This request will never be recreated.' };
      if (response.status >= 400 && response.status < 500) {
        return { kind: 'review', reason: response.status === 402 ? 'Subscription access needs review. No payment page was opened.'
          : response.status === 409 ? 'This key conflicts with a saved request. Do not resend as a new message.'
          : 'Access or server compatibility needs review. This message was kept; nothing fell back to a legacy send.' };
      }
      return { kind: 'uncertain', reason: 'The save was not confirmed. Only this same request key will be retried.' };
    } catch (error: any) {
      assertCurrent();
      if (error?.code === 'CHAT_STALE') throw error;
      return { kind: 'uncertain', reason: 'The save was not confirmed. Only this same request key will be retried.' };
    } finally { window.clearTimeout(timeout); }
  }
  return { isCurrent, request };
}
