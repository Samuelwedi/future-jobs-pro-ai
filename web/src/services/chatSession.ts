import { captureAuthSession } from './authSession';
import { API_BASE } from './api';

export type ChatOwner = Readonly<{ id: string; companyId: string; role: string; token: string }>;

// Web authentication is stored synchronously, unlike the native SecureStore client.
// Capture credentials once, then check storage and the view at every async boundary.
export function readChatOwner(): ChatOwner | null {
  try {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const companyId = user?.companyId ?? user?.company_id;
    if (!token || !user?.id || !companyId || !user?.role) return null;
    return Object.freeze({ token, id: String(user.id), companyId: String(companyId), role: String(user.role) });
  } catch { return null; }
}

export function chatOwnerKey(owner: ChatOwner | null): string {
  return owner ? JSON.stringify([owner.id, owner.companyId, owner.role, owner.token]) : '';
}

const chatError = (code: string, message: string, status?: number) => Object.assign(new Error(message), { code, status });

export function openChatSession(roomId: string, owner: ChatOwner, viewCurrent: () => boolean) {
  const key = chatOwnerKey(owner);
  const auth = captureAuthSession();
  const isCurrent = () => !!roomId && auth.isCurrent() && viewCurrent() && chatOwnerKey(readChatOwner()) === key;
  const assertCurrent = () => {
    if (!isCurrent()) throw chatError('CHAT_STALE', 'The account or conversation changed.');
  };
  const base = `/api/chat/room/${encodeURIComponent(roomId)}`;
  async function request(path: string, init: RequestInit = {}, kind: 'read' | 'text' | 'media' = 'read', blob = false): Promise<any> {
    assertCurrent();
    if (kind !== 'read' && navigator.onLine === false) throw chatError('CHAT_NOT_SENT', 'You are offline. Nothing was queued.');
    // Do not call generic api.upload: chat needs immutable owner credentials
    // and a view fence around every response, not a lookup of the latest token.
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        ...init,
        signal: controller.signal,
        headers: { ...init.headers, Authorization: `Bearer ${owner.token}` },
        cache: 'no-store',
      });
      assertCurrent();
      const data = blob && response.ok ? await response.blob() : await response.json().catch(() => null);
      assertCurrent();
      if (!response.ok) {
        if (kind === 'read' && response.status === 400 && data?.code === 'CHAT_CURSOR_INVALID' && data.refreshRequired === true) {
          throw Object.assign(chatError('CHAT_CURSOR_INVALID', 'Refresh history to continue.', 400), { refreshRequired: true });
        }
        if ([401, 403, 404].includes(response.status)) {
          throw chatError('CHAT_ACCESS_CHANGED', 'Your access to this conversation changed. Reopen it or sign in again.', response.status);
        }
        // Multipart routes can return 400 AFTER COMMIT. Never present those as a
        // rejected write or make them eligible for an automatic retry.
        const rejected = [402, 413, 415, 422].includes(response.status) || (kind === 'text' && response.status === 400);
        throw chatError(kind !== 'read' && rejected ? 'CHAT_NOT_SENT' : 'CHAT_UNCERTAIN',
          kind === 'read' ? 'Conversation could not be loaded.' : 'The result was not confirmed.', response.status);
      }
      return data;
    } finally { window.clearTimeout(timeout); }
  }
  return {
    token: owner.token, isCurrent,
    readMessages: (query?: { limit?: number; before?: string }) => {
      const params = query ? [
        ...(query.limit !== undefined ? [`limit=${encodeURIComponent(query.limit)}`] : []),
        ...(query.before !== undefined ? [`before=${encodeURIComponent(query.before)}`] : []),
      ] : [];
      return request(`${base}${params.length ? `?${params.join('&')}` : ''}`);
    },
    readRoom: () => request(`${base}/details`),
    // Explicit legacy support behavior only. Ordinary text must use the durable
    // outbox and must never fall back to this endpoint after any queued attempt.
    sendSupportMessage: (message: string) => {
      if (!roomId.startsWith('support-ticket-')) return Promise.reject(chatError('CHAT_NOT_SENT', 'Ordinary text requires the durable queue.'));
      return request('/api/chat/message', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId, message }),
      }, 'text');
    },
    upload: (kind: 'photo' | 'attachments', form: FormData) => request(`${base}/${kind}`, { method: 'POST', body: form }, 'media'),
    download: (id: string) => request(`/api/chat/attachments/${encodeURIComponent(id)}/content`, {}, 'read', true) as Promise<Blob>,
  };
}
