import { API_BASE } from './api';
import { captureAuthSession } from './authSession';
import { chatOwnerKey, readChatOwner, type ChatOwner } from './chatSession';

export { chatOwnerKey as projectOwnerKey, readChatOwner as readProjectOwner };
export type ProjectOwner = ChatOwner;
export type ProjectStatus = 'active' | 'on_hold' | 'completed';
export type Project = {
  id: string; name: string; client_name?: string | null; address?: string | null;
  status: ProjectStatus; archived_at: string | null;
  latitude?: number | null; longitude?: number | null; geofence_radius?: number | null;
};
export const canManageProjects = (owner: ProjectOwner) => ['boss', 'manager', 'admin'].includes(owner.role);
const failure = (code: string, message: string, status?: number) => Object.assign(new Error(message), { code, status });
export function readProjects(data: any, archived: boolean): Project[] {
  if (data?.success !== true || !Array.isArray(data.projects)) throw failure('PROJECT_UNCERTAIN', 'Projects could not be verified. Refresh to try again.');
  const ids = new Set<string>();
  for (const p of data.projects) {
    if (!p || typeof p.id !== 'string' || !p.id || ids.has(p.id) || typeof p.name !== 'string'
      || !['active', 'on_hold', 'completed'].includes(p.status)
      || !(p.archived_at === null || (typeof p.archived_at === 'string' && Number.isFinite(Date.parse(p.archived_at))))
      || Boolean(p.archived_at) !== archived) throw failure('PROJECT_UNCERTAIN', 'Projects could not be verified. Refresh to try again.');
    ids.add(p.id);
  }
  return data.projects;
}
export function confirmedProject(data: any, id?: string, archived?: boolean): boolean {
  try {
    const p = data?.project;
    readProjects({ success: data?.success, projects: [p] }, archived ?? Boolean(p?.archived_at));
    return !id || p.id === id;
  } catch { return false; }
}

// Immutable credentials and auth-generation fences apply before dispatch and
// after both response and body. Unlike the generic api, an old page cannot
// redirect a newer visit on 401/402, even under the same signed-in account.
export function openProjectSession(owner: ProjectOwner, viewCurrent: () => boolean) {
  const captured = Object.freeze({ ...owner });
  const auth = captureAuthSession();
  const isCurrent = () => auth.isCurrent() && viewCurrent() && chatOwnerKey(readChatOwner()) === chatOwnerKey(captured);
  const assertCurrent = () => { if (!isCurrent()) throw failure('PROJECT_STALE', 'The account or page changed.'); };
  async function request(path: string, method = 'GET', body?: unknown): Promise<any> {
    assertCurrent();
    if (method !== 'GET' && !canManageProjects(captured)) throw failure('PROJECT_ACCESS_CHANGED', 'Manager access is required to change projects.', 403);
    if (navigator.onLine === false) throw failure('PROJECT_NOT_SENT', 'You are offline. Reconnect and try again.');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method, headers: { Authorization: `Bearer ${captured.token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: controller.signal, cache: 'no-store',
      });
      assertCurrent();
      const data = await response.json().catch(() => null);
      assertCurrent();
      if (!response.ok) {
        if ([401, 403].includes(response.status)) throw failure('PROJECT_ACCESS_CHANGED', 'Your project access changed. Reopen Projects or sign in again.', response.status);
        if ([400, 402, 404, 413, 415, 422].includes(response.status)) throw failure('PROJECT_NOT_SENT', response.status === 402
          ? 'Project changes require an active subscription.' : String(data?.message || 'This project request was rejected.'), response.status);
        throw failure('PROJECT_UNCERTAIN', 'The project request was not confirmed.', response.status);
      }
      return data;
    } finally { window.clearTimeout(timeout); }
  }
  return {
    isCurrent,
    list: async (archived: boolean) => readProjects(await request(`/api/projects?archived=${archived}`), archived),
    setArchived: (id: string, archived: boolean) => request(`/api/projects/${encodeURIComponent(id)}${archived ? '' : '/restore'}`, archived ? 'DELETE' : 'POST'),
    save: (id: string | undefined, body: unknown) => request(id ? `/api/projects/${encodeURIComponent(id)}` : '/api/projects', id ? 'PUT' : 'POST', body),
  };
}
