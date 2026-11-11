import { API_BASE } from './api';
import { captureAuthSession } from './authSession';
import { chatOwnerKey, readChatOwner, type ChatOwner } from './chatSession';

// This is the endpoint's submitted-recipient limit. The creator is added by
// the server, so a group can contain this many selected people plus its creator.
export const MAX_CHAT_RECIPIENTS = 100;
export const chatPersonId = (value: unknown): string | null =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value.toLowerCase() : null;
const creationError = (code: string, message: string, status?: number) => Object.assign(new Error(message), { code, status });

export function openChatCreationSession(owner: ChatOwner, viewCurrent: () => boolean) {
  const captured = Object.freeze({ ...owner });
  const key = chatOwnerKey(captured);
  const auth = captureAuthSession();
  const isCurrent = () => !!chatPersonId(captured.id) && auth.isCurrent() && viewCurrent()
    && chatOwnerKey(readChatOwner()) === key;
  const assertCurrent = () => {
    if (!isCurrent()) throw creationError('CHAT_STALE', 'The account or page changed.');
  };
  async function request(path: string, body?: unknown): Promise<any> {
    assertCurrent();
    const write = body !== undefined;
    if (write && navigator.onLine === false) throw creationError('CHAT_NOT_SENT', 'You are offline. Nothing was queued.');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method: write ? 'POST' : 'GET',
        headers: { Authorization: `Bearer ${captured.token}`, ...(write ? { 'Content-Type': 'application/json' } : {}) },
        ...(write ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal, cache: 'no-store',
      });
      assertCurrent();
      const data = await response.json().catch(() => null);
      assertCurrent();
      if (!response.ok) {
        if ([401, 403, 404].includes(response.status)) {
          throw creationError('CHAT_ACCESS_CHANGED', 'Your access changed. Go back and reopen New conversation.', response.status);
        }
        // Creation validates these requests before committing. A 500 can mean
        // COMMIT succeeded but its reply was lost. Generic 5xx/network/abort
        // results must never unlock a group retry or use a queue automatically.
        const rejected = [400, 402, 409, 413, 415, 422].includes(response.status);
        throw creationError(write && rejected ? 'CHAT_NOT_SENT' : 'CHAT_UNCERTAIN', 'Creation was not confirmed.', response.status);
      }
      return data;
    } finally { window.clearTimeout(timeout); }
  }
  const validateMembers = (memberIds: string[]) => {
    if (!memberIds.length || memberIds.length > MAX_CHAT_RECIPIENTS
      || memberIds.some(id => !chatPersonId(id) || chatPersonId(id) === chatPersonId(captured.id))
      || new Set(memberIds.map(chatPersonId)).size !== memberIds.length) {
      throw creationError('CHAT_NOT_SENT', 'Select 1 to 100 other people.');
    }
  };
  return {
    isCurrent,
    // Company and current active coworkers are derived by the authenticated
    // endpoint. Never use the caller-selectable /users/company/:companyId route.
    readUsers: () => request('/api/users/company'),
    createDirect: (userId2: string) => {
      assertCurrent();
      validateMembers([userId2]);
      return request('/api/chat/create-direct', { userId2 });
    },
    createGroup: (name: string, memberIds: string[]) => {
      assertCurrent();
      validateMembers(memberIds);
      const trimmed = name.trim();
      if (!trimmed || trimmed.length > 100 || trimmed.includes('\0')) throw creationError('CHAT_NOT_SENT', 'Enter a valid group name.');
      return request('/api/chat/create-group', { name: trimmed, memberIds: [...memberIds] });
    },
  };
}
