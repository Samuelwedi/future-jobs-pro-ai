/** Private, exact-version view state. Never a sender receipt or a timestamp watermark. */
export type ViewOwner = { id: string; companyId: string };
export type ViewContext = { actorId: string; companyId: string; roomId: string; membershipInstanceId: string };
export type ViewedMessage = { id: string; viewVersion: string };
export type ViewCount = { roomId: string; membershipInstanceId: string; unviewedCount: number; unviewedCountCapped: boolean };
export const VIEW_DWELL_MS = 1000;
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
export function readViewContext(value: any, owner: ViewOwner, roomId: string): ViewContext | null {
  return value?.actorId === owner.id && value.companyId === owner.companyId && value.roomId === roomId
    && uuid(value.membershipInstanceId) ? { actorId: value.actorId, companyId: value.companyId, roomId, membershipInstanceId: value.membershipInstanceId } : null;
}
export function readViewCounts(data: any, owner: ViewOwner): ViewCount[] {
  const value = data?.viewState;
  if (data?.success !== true || value?.actorId !== owner.id || value.companyId !== owner.companyId
    || value.historyPolicy !== 'unmarked_until_viewed' || !Array.isArray(value.rooms)) throw new Error('Invalid private view counts');
  const ids = new Set<string>();
  return value.rooms.map((room: any) => {
    if (typeof room?.roomId !== 'string' || !room.roomId || room.roomId.length > 255 || room.roomId.trim() !== room.roomId
      || room.roomId.includes('\0') || room.roomId.startsWith('support-ticket-') || ids.has(room.roomId) || !uuid(room.membershipInstanceId)
      || !Number.isInteger(room.unviewedCount) || room.unviewedCount < 0 || room.unviewedCount > 99
      || typeof room.unviewedCountCapped !== 'boolean' || (room.unviewedCountCapped && room.unviewedCount !== 99)) throw new Error('Invalid private view count');
    ids.add(room.roomId);
    return { roomId: room.roomId, membershipInstanceId: room.membershipInstanceId,
      unviewedCount: room.unviewedCount, unviewedCountCapped: room.unviewedCountCapped };
  });
}
export function validViewAcknowledgement(data: any, scope: ViewContext, messages: ViewedMessage[]): boolean {
  const context = readViewContext(data?.viewContext, { id: scope.actorId, companyId: scope.companyId }, scope.roomId);
  if (data?.success !== true || context?.membershipInstanceId !== scope.membershipInstanceId
    || !Array.isArray(data.acknowledged) || data.acknowledged.length !== messages.length) return false;
  const requested = new Map(messages.map(message => [message.id, message.viewVersion]));
  for (const row of data.acknowledged) {
    if (!row || requested.get(row.id) !== row.viewVersion) return false;
    requested.delete(row.id);
  }
  return requested.size === 0;
}
export function viewAccessDenied(error: any): boolean {
  return [401, 402, 403].includes(error?.response?.status);
}
export function fullyVisible(row: { x: number; y: number; width: number; height: number }, viewport: typeof row): boolean {
  return [row.x, row.y, row.width, row.height, viewport.x, viewport.y, viewport.width, viewport.height].every(Number.isFinite)
    && row.width > 0 && row.height > 0 && viewport.width > 0 && viewport.height > 0
    && row.x >= viewport.x && row.y >= viewport.y && row.x + row.width <= viewport.x + viewport.width
    && row.y + row.height <= viewport.y + viewport.height;
}

// Shared invalidation only, never message content or durable state. Counts loaded
// before an acknowledgement cannot overwrite a later refresh, including on focus.
let countRevision = 0;
const countListeners = new Set<() => void>();
export const privateViewRevision = () => countRevision;
export const subscribePrivateViewCounts = (listener: () => void) => { countListeners.add(listener); return () => { countListeners.delete(listener); }; };
export const invalidatePrivateViewCounts = () => { countRevision++; countListeners.forEach(listener => listener()); };

export function createPrivateViews(options: {
  owner: ViewOwner; roomId: string; current: () => boolean;
  acknowledge: (scope: ViewContext, messages: ViewedMessage[], current: () => boolean) => Promise<any>;
  changed: () => void; unavailable: () => void; denied: () => void; stale: (messages: ViewedMessage[]) => void;
}) {
  let scope: ViewContext | null = null, stopped = false, generation = 0, inflight = false;
  const visible = new Map<string, { message: ViewedMessage; since: number }>();
  const confirmed = new Set<string>();
  let lastSample: number | null = null;
  const key = (row: ViewedMessage) => `${row.id}:${row.viewVersion}`;
  const reset = () => { generation++; visible.clear(); };
  const current = () => !stopped && !!scope && options.current();
  const tick = async (now: number) => {
    if (!current()) { reset(); return; }
    if (inflight) return;
    const messages = Array.from(visible.values()).filter(item => now - item.since >= VIEW_DWELL_MS)
      .map(item => item.message).filter(row => !confirmed.has(key(row))).slice(0, 100);
    if (!messages.length) return;
    const requestScope = { ...scope! }, requestGeneration = generation;
    const requestCurrent = () => current() && generation === requestGeneration
      && scope?.membershipInstanceId === requestScope.membershipInstanceId
      && messages.every(row => visible.get(row.id)?.message.viewVersion === row.viewVersion);
    inflight = true;
    let invalidated = false;
    try {
      const result = await options.acknowledge(requestScope, messages.map(row => ({ ...row })), requestCurrent);
      if (!requestCurrent()) return;
      if (!validViewAcknowledgement(result, requestScope, messages)) { reset(); options.unavailable(); return; }
      messages.forEach(row => confirmed.add(key(row)));
      invalidated = true; invalidatePrivateViewCounts(); options.changed();
    } catch (error: any) {
      if (!requestCurrent()) return;
      reset();
      if (viewAccessDenied(error)) { stopped = true; scope = null; confirmed.clear(); options.denied(); }
      else if (error?.response?.status === 409 && error.response.data?.code === 'CHAT_VIEW_STALE') {
        scope = null; confirmed.clear(); options.stale(messages);
      } else options.unavailable();
    } finally {
      inflight = false;
      // A dispatched request may have committed even if its screen disappeared
      // or the response was lost. Fence/refetch inbox counts without applying
      // old-scope content or claiming a successful acknowledgement.
      if (!invalidated) invalidatePrivateViewCounts();
    }
  };
  return {
    reset,
    context(value: any) {
      const next = readViewContext(value, options.owner, options.roomId);
      if (JSON.stringify(next) !== JSON.stringify(scope)) { reset(); confirmed.clear(); }
      scope = next;
      return next;
    },
    observe(rows: any[], now: number) {
      // Never substitute the wall clock: a changed device date is not dwell.
      // Keep the high-water sample across visibility resets so a broken clock
      // cannot restart below a previously observed monotonic reading.
      if (!Number.isFinite(now) || now < 0 || (lastSample !== null && now < lastSample)) { reset(); return false; }
      lastSample = now;
      if (!current()) { reset(); return false; }
      const seen = new Set<string>();
      for (const row of rows) {
        if (!uuid(row?.id) || !uuid(row.view_version) || row.room_id !== options.roomId
          || row.company_id !== options.owner.companyId || row.sender_id === options.owner.id
          || typeof row.sender_id !== 'string') continue;
        seen.add(row.id);
        const previous = visible.get(row.id);
        if (previous?.message.viewVersion !== row.view_version) visible.set(row.id, { message: { id: row.id, viewVersion: row.view_version }, since: now });
      }
      for (const id of visible.keys()) if (!seen.has(id)) visible.delete(id);
      void tick(now);
      return true;
    },
    dispose() { stopped = true; scope = null; reset(); confirmed.clear(); },
  };
}
