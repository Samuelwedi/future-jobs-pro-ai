import type { ChatOwner, openChatSession } from './chatSession';

export type ViewContext = { actorId: string; companyId: string; roomId: string; membershipInstanceId: string };
export type ViewPair = { id: string; viewVersion: string };
export type ViewCount = { roomId: string; membershipInstanceId: string; unviewedCount: number; unviewedCountCapped: boolean };
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
export const PRIVATE_VIEW_DWELL_MS = 1000;
export const PRIVATE_VIEW_HISTORY_NOTE = "The 'Messages not marked read' count is private to you. Previous views were not recorded, so older messages begin unmarked. A whole message visible for 1 second is marked read. Messages taller than the visible area are not marked automatically.";
export const privateViewLabel = (count: ViewCount | null | undefined) => count
  ? `Messages not marked read: ${count.unviewedCountCapped ? '99+' : count.unviewedCount}`
  : 'Messages not marked read: unavailable';
export function parseViewContext(value: any, owner: ChatOwner, roomId: string): ViewContext | null {
  return value && uuid(value.actorId) && value.actorId === owner.id && uuid(value.companyId) && value.companyId === owner.companyId
    && value.roomId === roomId && !roomId.startsWith('support-ticket-') && uuid(value.membershipInstanceId)
    ? { actorId: value.actorId, companyId: value.companyId, roomId, membershipInstanceId: value.membershipInstanceId } : null;
}
export function parseViewHistory(data: any, owner: ChatOwner, roomId: string): ViewContext | null {
  const context = parseViewContext(data?.viewContext, owner, roomId);
  return data?.success === true && context && Array.isArray(data.messages)
    && new Set(data.messages.map((row: any) => row?.id)).size === data.messages.length
    && data.messages.every((row: any) => row && uuid(row.id) && uuid(row.view_version)
      && row.room_id === roomId && row.company_id === owner.companyId && typeof row.sender_id === 'string') ? context : null;
}
export function parseViewCounts(data: any, owner: ChatOwner): ViewCount[] | null {
  const state = data?.viewState;
  if (data?.success !== true || !uuid(owner.id) || !uuid(owner.companyId) || state?.actorId !== owner.id
    || state?.companyId !== owner.companyId || state.historyPolicy !== 'unmarked_until_viewed' || !Array.isArray(state.rooms)) return null;
  const ids = new Set<string>();
  const counts: ViewCount[] = [];
  for (const value of state.rooms) {
    if (!value || typeof value.roomId !== 'string' || !value.roomId || value.roomId.startsWith('support-ticket-') || ids.has(value.roomId)
      || !uuid(value.membershipInstanceId) || !Number.isInteger(value.unviewedCount) || value.unviewedCount < 0 || value.unviewedCount > 99
      || typeof value.unviewedCountCapped !== 'boolean' || (value.unviewedCountCapped && value.unviewedCount !== 99)) return null;
    ids.add(value.roomId);
    counts.push({ roomId: value.roomId, membershipInstanceId: value.membershipInstanceId,
      unviewedCount: value.unviewedCount, unviewedCountCapped: value.unviewedCountCapped });
  }
  return counts;
}
export function validViewAck(data: any, context: ViewContext, pairs: ViewPair[], owner: ChatOwner): boolean {
  const returned = parseViewContext(data?.viewContext, owner, context.roomId);
  if (data?.success !== true || returned?.membershipInstanceId !== context.membershipInstanceId
    || !Array.isArray(data.acknowledged) || data.acknowledged.length !== pairs.length) return false;
  const expected = new Map(pairs.map(pair => [pair.id, pair.viewVersion]));
  const seen = new Set<string>();
  return data.acknowledged.every((pair: any) => pair && uuid(pair.id) && uuid(pair.viewVersion)
    && !seen.has(pair.id) && !!seen.add(pair.id) && expected.get(pair.id) === pair.viewVersion);
}

// No count cache: each scoped view starts unknown. A write/invalidation fences
// all earlier reads; only a trailing post-write read may publish a new count.
export function createViewCountReader(options: {
  owner: ChatOwner; isCurrent: () => boolean; read: (guard: () => boolean) => Promise<any>;
  onCounts: (counts: ViewCount[] | null) => void; onDenied: () => void;
}) {
  let active = true, revision = 0, running = false, again = false;
  const current = () => active && options.isCurrent();
  const invalidate = () => { revision++; again = false; if (current()) options.onCounts(null); };
  const refresh = async () => {
    if (!current() || !uuid(options.owner.id) || !uuid(options.owner.companyId)) return;
    if (running) { again = true; return; }
    running = true;
    const version = revision;
    const guard = () => current() && version === revision;
    try {
      const result = await options.read(guard);
      if (guard()) options.onCounts(parseViewCounts(result, options.owner));
    } catch (error: any) {
      if (guard()) { options.onCounts(null); if (error?.code === 'CHAT_ACCESS_CHANGED') options.onDenied(); }
    } finally {
      running = false;
      if (again && current()) { again = false; void refresh(); }
    }
  };
  // A POST can commit after its origin unmounts. This contains no old private
  // data and can only clear a still-current reader, never publish a stale count.
  window.addEventListener('chat-views-invalidated', invalidate);
  return { refresh, invalidate, dispose: () => {
    active = false; revision++; again = false; window.removeEventListener('chat-views-invalidated', invalidate);
  } };
}

type ViewMessage = { id: string; room_id: string; company_id: string; sender_id: string; view_version?: string };
// This controller never stores a retry queue. Every batch is rebuilt from DOM
// intersections and current geometry at dispatch. performance.now is monotonic.
export function createPrivateViewObserver(options: {
  owner: ChatOwner; roomId: string; session: ReturnType<typeof openChatSession>;
  isCurrent: () => boolean; root: () => HTMLElement | null; chooserOpen: () => boolean;
  onCount: (count: ViewCount | null) => void; onDenied: () => void; onMembershipChanged?: (membership: string) => void; refreshHistory: () => void;
}) {
  let active = true, epoch = 0, running = false, blocked = true;
  let context: ViewContext | null = null, root: HTMLElement | null = null;
  let observer: IntersectionObserver | null = null;
  const versions = new Map<string, string>(), acknowledged = new Map<string, string>();
  const elements = new Set<HTMLElement>(), intersections = new Set<HTMLElement>(), since = new Map<HTMLElement, number>();
  const current = () => active && options.isCurrent() && options.session.isCurrent();
  const modalOpen = () => Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog[open]'))
    .some(node => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden');
  const eligible = () => current() && navigator.onLine !== false && document.visibilityState === 'visible'
    && document.hasFocus() && !options.chooserOpen() && !modalOpen();
  const counts = createViewCountReader({ owner: options.owner, isCurrent: () => eligible() && !running, read: options.session.readViewCounts,
    onCounts: values => {
      const value = values?.find(value => value.roomId === options.roomId) || null;
      // Counts can independently reveal a removed/re-added membership. A fresh
      // history context is required before observing the new incarnation.
      if (values !== null && context && value?.membershipInstanceId !== context.membershipInstanceId) {
        reset();
        if (value) options.onMembershipChanged?.(value.membershipInstanceId);
        options.refreshHistory(); return;
      }
      options.onCount(value && context && value.membershipInstanceId === context.membershipInstanceId ? value : null);
    }, onDenied: options.onDenied });
  function reset() {
    epoch++; context = null; versions.clear(); acknowledged.clear(); since.clear(); intersections.clear();
    // IntersectionObserver does not redeliver unchanged intersections. Rebind
    // after reset so no old event can stand in for a new foreground observation.
    observer?.disconnect(); observer = null; elements.clear(); root = null;
    counts.invalidate();
    if (current()) options.onCount(null);
  }
  const pairFor = (element: HTMLElement): ViewPair | null => {
    const id = element.dataset.chatViewId, version = element.dataset.chatViewVersion;
    return id && uuid(version) && versions.get(id) === version && acknowledged.get(id) !== version
      ? { id, viewVersion: version } : null;
  };
  const fullBubble = (element: HTMLElement) => {
    if (!root || !element.isConnected || !root.contains(element)) return false;
    const box = element.getBoundingClientRect(), viewport = root.getBoundingClientRect();
    const visual = window.visualViewport;
    const left = Math.max(viewport.left + root.clientLeft, visual?.offsetLeft || 0);
    const top = Math.max(viewport.top + root.clientTop, visual?.offsetTop || 0);
    const right = Math.min(viewport.left + root.clientLeft + root.clientWidth, (visual?.offsetLeft || 0) + (visual?.width || window.innerWidth));
    const bottom = Math.min(viewport.top + root.clientTop + root.clientHeight, (visual?.offsetTop || 0) + (visual?.height || window.innerHeight));
    if (!(box.width > 0 && box.height > 0 && box.left >= left && box.right <= right && box.top >= top && box.bottom <= bottom)) return false;
    for (let node: HTMLElement | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.visibility !== 'visible' || style.display === 'none' || Number(style.opacity) === 0) return false;
    }
    // Full geometry is necessary, not sufficient: don't mark a bubble obscured
    // by a fixed overlay, sticky header, open media viewer or another element.
    const middleX = (box.left + box.right) / 2, middleY = (box.top + box.bottom) / 2;
    // Edge midpoints stay inside rounded Paper corners (unlike corner ±1px).
    return [[middleX, box.top + 1], [middleX, box.bottom - 1], [box.left + 1, middleY],
      [box.right - 1, middleY], [middleX, middleY]]
      .every(([x, y]) => element.contains(document.elementFromPoint(x, y)));
  };
  const bind = () => {
    const nextRoot = options.root();
    if (nextRoot !== root) { observer?.disconnect(); observer = null; root = nextRoot; elements.clear(); intersections.clear(); since.clear(); }
    if (!root || typeof IntersectionObserver === 'undefined') return;
    if (!observer) {
      const binding = epoch;
      observer = new IntersectionObserver(entries => {
        if (!eligible() || binding !== epoch) return;
        for (const entry of entries) {
          const element = entry.target as HTMLElement;
          if (entry.isIntersecting && entry.intersectionRatio >= 1 && fullBubble(element)) intersections.add(element);
          else { intersections.delete(element); since.delete(element); }
        }
      }, { root, threshold: [0, 1] });
    }
    const next = new Set(Array.from(root.querySelectorAll<HTMLElement>('[data-chat-view-id]')));
    for (const element of elements) if (!next.has(element)) { observer.unobserve(element); elements.delete(element); intersections.delete(element); since.delete(element); }
    for (const element of next) if (!elements.has(element)) { elements.add(element); observer.observe(element); }
  };
  const tick = () => {
    if (!active) return;
    if (!eligible()) { if (!blocked) { blocked = true; reset(); } return; }
    if (blocked) { blocked = false; options.refreshHistory(); if (!running) void counts.refresh(); }
    bind();
    if (!context || running) return;
    const now = performance.now(), pairs: ViewPair[] = [];
    for (const element of elements) {
      const pair = pairFor(element);
      if (!pair || !intersections.has(element) || !fullBubble(element)) { since.delete(element); continue; }
      if (!since.has(element)) since.set(element, now);
      if (now - since.get(element)! >= PRIVATE_VIEW_DWELL_MS && pairs.length < 100) pairs.push(pair);
    }
    if (!pairs.length) return;
    const captured = { ...context }, generation = epoch;
    const guard = () => eligible() && generation === epoch && context?.membershipInstanceId === captured.membershipInstanceId;
    if (!guard()) return;
    running = true;
    counts.invalidate();
    options.onCount(null);
    void (async () => {
      let accepted = false;
      try {
        const data = await options.session.acknowledgeViews(captured.membershipInstanceId, pairs, guard);
        if (!guard()) return;
        if (!validViewAck(data, captured, pairs, options.owner)) { reset(); return; }
        pairs.forEach(pair => acknowledged.set(pair.id, pair.viewVersion));
        // No optimistic decrement or room-wide clear, even for a complete page.
        accepted = true;
        window.dispatchEvent(new CustomEvent('chat-views-updated', { detail: captured }));
      } catch (error: any) {
        if (!guard()) return;
        reset();
        if (error?.code === 'CHAT_ACCESS_CHANGED') options.onDenied();
        else if (error?.code === 'CHAT_VIEWS_STALE') options.refreshHistory();
      } finally {
        running = false;
        window.dispatchEvent(new Event('chat-views-invalidated'));
        // A dropped response may still have committed. Invalidate again at
        // settlement, including counts read after an interruption but before
        // the POST finished. Never publish into a different auth/room session.
        if (current()) { counts.invalidate(); options.onCount(null); }
        if (accepted && guard()) void counts.refresh();
      }
    })();
  };
  const acceptMessage = (message: ViewMessage) => {
    if (!context || !eligible() || !uuid(message.id)) return;
    if (!uuid(message.view_version) || message.sender_id === options.owner.id
      || message.room_id !== options.roomId || message.company_id !== options.owner.companyId) {
      // A partial socket update must not reuse an older merged row's version.
      versions.delete(message.id);
      for (const element of elements) if (element.dataset.chatViewId === message.id) since.delete(element);
      return;
    }
    if (versions.get(message.id) !== message.view_version) {
      versions.set(message.id, message.view_version);
      for (const element of elements) if (element.dataset.chatViewId === message.id) since.delete(element);
    }
  };
  const acceptHistory = (data: any) => {
    if (!eligible()) return;
    const next = parseViewHistory(data, options.owner, options.roomId);
    if (!next) { reset(); return; }
    if (next.membershipInstanceId !== context?.membershipInstanceId) reset();
    context = next;
    data.messages.forEach(acceptMessage);
    if (!running) void counts.refresh();
  };
  // Any scroll or layout change requires a new uninterrupted dwell. IO handles
  // crossing the clip edge between timer samples, including rapid scroll-away.
  const moved = () => { since.clear(); };
  const interrupt = () => { blocked = true; reset(); };
  const unsupported = () => { if (current()) reset(); };
  const mutations = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => {
    if (!eligible()) interrupt();
    else { for (const element of elements) if (!fullBubble(element)) since.delete(element); }
  });
  mutations?.observe(document.documentElement, { subtree: true, childList: true, attributes: true });
  document.addEventListener('scroll', moved, true);
  window.addEventListener('resize', moved);
  window.visualViewport?.addEventListener('resize', moved);
  window.visualViewport?.addEventListener('scroll', moved);
  window.addEventListener('offline', interrupt);
  window.addEventListener('chat-views-unsupported', unsupported);
  const timer = window.setInterval(tick, 100);
  tick();
  return { acceptHistory, acceptMessage, interrupt, tick, historyEpoch: () => epoch,
    historyCurrent: (stamp: unknown) => eligible() && stamp === epoch, dispose: () => {
    active = false; epoch++; observer?.disconnect(); mutations?.disconnect(); counts.dispose();
    since.clear(); intersections.clear(); versions.clear(); acknowledged.clear(); elements.clear();
    window.clearInterval(timer); document.removeEventListener('scroll', moved, true); window.removeEventListener('resize', moved);
    window.visualViewport?.removeEventListener('resize', moved); window.visualViewport?.removeEventListener('scroll', moved);
    window.removeEventListener('offline', interrupt);
    window.removeEventListener('chat-views-unsupported', unsupported);
  } };
}
