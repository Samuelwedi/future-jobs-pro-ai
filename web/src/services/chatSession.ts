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

function openChatTransport(owner: ChatOwner, viewCurrent: () => boolean) {
  owner = Object.freeze({ ...owner });
  const key = chatOwnerKey(owner);
  const auth = captureAuthSession();
  const isCurrent = () => auth.isCurrent() && viewCurrent() && chatOwnerKey(readChatOwner()) === key;
  const assertCurrent = () => {
    if (!isCurrent()) throw chatError('CHAT_STALE', 'The account or conversation changed.');
  };
  async function request(path: string, init: RequestInit = {}, kind: 'read' | 'text' | 'media' | 'views' | 'views-history' = 'read', blob = false, guard: () => boolean = () => true): Promise<any> {
    const check = () => { assertCurrent(); if (!guard()) throw chatError('CHAT_STALE', 'The view changed.'); };
    check();
    if (kind !== 'read' && kind !== 'views-history' && navigator.onLine === false) throw chatError('CHAT_NOT_SENT', 'You are offline. Nothing was queued.');
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
      check();
      const data = blob && response.ok ? await response.blob() : await response.json().catch(() => null);
      check();
      if (!response.ok) {
        if (kind === 'views-history' && response.status === 400 && data?.code === 'CHAT_QUERY_INVALID') {
          throw chatError('CHAT_VIEWS_UNSUPPORTED', 'Private view metadata is not supported.', 400);
        }
        if (kind === 'views') {
          if ([401, 402, 403].includes(response.status)) throw chatError('CHAT_ACCESS_CHANGED', 'Your access to messages changed.', response.status);
          if (response.status === 409 && data?.code === 'CHAT_VIEW_STALE' && data.refreshRequired === true) {
            throw chatError('CHAT_VIEWS_STALE', 'Refresh messages before recording views.', response.status);
          }
          // An old server's 404 is unknown, not an empty count or loss of room access.
          throw chatError('CHAT_VIEWS_UNAVAILABLE', 'Private message counts are unavailable.', response.status);
        }
        if ((kind === 'read' || kind === 'views-history') && response.status === 400 && data?.code === 'CHAT_CURSOR_INVALID' && data.refreshRequired === true) {
          throw Object.assign(chatError('CHAT_CURSOR_INVALID', 'Refresh history to continue.', 400), { refreshRequired: true });
        }
        if ([401, 403, 404].includes(response.status) || (kind === 'views-history' && response.status === 402)) {
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
  return { token: owner.token, isCurrent, request };
}

export function openChatInboxSession(owner: ChatOwner, viewCurrent: () => boolean) {
  const session = openChatTransport(owner, viewCurrent);
  const path = `/api/chat/rooms/${encodeURIComponent(owner.id)}`;
  return {
    isCurrent: session.isCurrent,
    // The endpoint rechecks the authenticated owner, active company and current
    // membership. Support tickets keep their separate authorization and UI.
    readRooms: () => session.request(path),
    readViewCounts: (guard?: () => boolean) => session.request(viewCountsPath(owner), {}, 'views', false, guard),
  };
}

function viewCountsPath(owner: ChatOwner) {
  return `/api/chat/views?expectedActorId=${encodeURIComponent(owner.id)}&expectedCompanyId=${encodeURIComponent(owner.companyId)}`;
}

function withoutViewMetadata(data: any): any {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const { viewContext: _context, ...legacy } = data;
  if (Array.isArray(legacy.messages)) legacy.messages = legacy.messages.map((row: any) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
    const { view_version: _version, ...message } = row;
    return message;
  });
  return legacy;
}

export function openChatSession(roomId: string, owner: ChatOwner, viewCurrent: () => boolean) {
  const { token, isCurrent, request } = openChatTransport(owner, () => !!roomId && viewCurrent());
  const base = `/api/chat/room/${encodeURIComponent(roomId)}`;
  let viewsSupported = true;
  const privateGuard = (guard?: () => boolean) => () => viewsSupported && (!guard || guard());
  const unavailable = () => Promise.reject(chatError('CHAT_VIEWS_UNAVAILABLE', 'Private message views are unavailable for this session.'));
  return {
    token, isCurrent,
    readMessages: async (query?: { limit?: number; before?: string; views?: boolean }) => {
      const params = query ? [
        ...(query.limit !== undefined ? [`limit=${encodeURIComponent(query.limit)}`] : []),
        ...(query.before !== undefined ? [`before=${encodeURIComponent(query.before)}`] : []),
        ...(query.views && viewsSupported && !roomId.startsWith('support-ticket-') ? ['views=1'] : []),
      ] : [];
      const privateHistory = query?.views && viewsSupported && !roomId.startsWith('support-ticket-');
      try {
        const data = await request(`${base}${params.length ? `?${params.join('&')}` : ''}`, {}, privateHistory ? 'views-history' : 'read');
        return viewsSupported ? data : withoutViewMetadata(data);
      }
      catch (error: any) {
        if (!privateHistory || error?.code !== 'CHAT_VIEWS_UNSUPPORTED') throw error;
        // One read-only compatibility fallback per session. It carries no view
        // context and can never enable acknowledgements on an older server.
        viewsSupported = false;
        // Capability loss takes effect before the legacy request can fail or
        // hang. Previously displayed private state must become unknown now.
        window.dispatchEvent(new Event('chat-views-invalidated'));
        window.dispatchEvent(new Event('chat-views-unsupported'));
        const legacy = params.filter(value => value !== 'views=1');
        return withoutViewMetadata(await request(`${base}${legacy.length ? `?${legacy.join('&')}` : ''}`));
      }
    },
    readViewCounts: (guard?: () => boolean) => viewsSupported
      ? request(viewCountsPath(owner), {}, 'views', false, privateGuard(guard)) : unavailable(),
    acknowledgeViews: (membershipInstanceId: string, messages: { id: string; viewVersion: string }[], guard?: () => boolean) => {
      if (!viewsSupported || roomId.startsWith('support-ticket-')) return unavailable();
      return request(`${base}/views`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedActorId: owner.id, expectedCompanyId: owner.companyId, membershipInstanceId, messages }) }, 'views', false, privateGuard(guard));
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
