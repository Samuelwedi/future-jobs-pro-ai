// Read-only history state survives foreground sessions, but never a room/account
// remount. Cursors belong to server response pages, not the merged message list.
export const CHAT_HISTORY_LIMIT = 200;
export const CHAT_CATCHUP_PAGES = 3;
export type HistoryRow = { id: string; created_at: string | null };
type Gap = { cursor: string; anchors: Set<string>; blocked: boolean; probe: boolean; sawDated: boolean };
export type HistoryState = {
  initialized: boolean;
  headIds: Set<string>;
  datedHeadIds: Set<string>;
  nullBoundaryCursor: string | null;
  olderCursor: string | null;
  hasOlder: boolean | null;
  olderBlocked: boolean;
  gaps: Gap[];
  latestError: string;
  pageError: string;
};
export type HistoryView = {
  initialized: boolean; hasOlder: boolean | null; gaps: number;
  busy: 'latest' | 'older' | 'recovery' | null;
  latestError: string; pageError: string; refreshRequired: boolean;
};
export function createHistoryState(): HistoryState {
  return { initialized: false, headIds: new Set(), datedHeadIds: new Set(), nullBoundaryCursor: null, olderCursor: null, hasOlder: null,
    olderBlocked: false, gaps: [], latestError: '', pageError: '' };
}
export function historyView(state: HistoryState, busy: HistoryView['busy'] = null): HistoryView {
  return { initialized: state.initialized, hasOlder: state.hasOlder, gaps: state.gaps.length, busy,
    latestError: state.latestError, pageError: state.pageError,
    refreshRequired: state.olderBlocked || state.gaps.some(gap => gap.blocked) };
}
export function mergeHistoryRows<T extends HistoryRow>(current: T[], incoming: T[]): T[] {
  const byId = new Map(current.map(message => [message.id, message]));
  incoming.forEach(message => byId.set(message.id, { ...byId.get(message.id), ...message }));
  // Backend pages reverse DESC NULLS FIRST, so unknown dates sort last.
  const time = (message: T) => message.created_at === null ? Infinity : Date.parse(message.created_at);
  return [...byId.values()].sort((left, right) => {
    const a = time(left), b = time(right);
    return (a < b ? -1 : a > b ? 1 : 0) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  });
}
type Page<T> = { messages: T[]; hasMore: boolean; nextCursor: string | null };
function parsePage<T extends HistoryRow>(data: any, valid: (row: any) => row is T, before?: string): Page<T> {
  if (data?.success !== true || !Array.isArray(data.messages) || data.messages.length > CHAT_HISTORY_LIMIT
    || data.messages.some((row: any) => !valid(row)) || typeof data.hasMore !== 'boolean'
    || (data.hasMore ? typeof data.nextCursor !== 'string' || !data.nextCursor || !data.messages.length
      || data.nextCursor === before : data.nextCursor !== null)) {
    throw new Error('Invalid history page');
  }
  return data;
}
// Null timestamps sort after every dated message. Shared legacy null rows are
// not evidence that the dated messages between two windows are continuous.
const datedRows = <T extends HistoryRow>(rows: T[]) => rows.filter(row => row.created_at !== null);
const overlaps = (rows: HistoryRow[], ids: Set<string>) => rows.some(row => row.created_at !== null && ids.has(row.id));

export function createHistoryController<T extends HistoryRow>(state: HistoryState, options: {
  readMessages: (query: { limit: number; before?: string }) => Promise<any>;
  isCurrent: () => boolean;
  validMessage: (row: any) => row is T;
  captureRead?: () => unknown;
  onAcceptedPage?: (data: any, before?: string, stamp?: unknown) => boolean;
  onMessages: (messages: T[], kind: 'latest' | 'history') => void;
  onChange: (view: HistoryView) => void;
  onAccessChanged: () => void;
}) {
  let active = true;
  let busy: HistoryView['busy'] = null;
  let running: Promise<void> | null = null;
  let queuedRefresh = false;
  let queuedExplicit = false;
  const current = () => active && options.isCurrent();
  const publish = () => { if (current()) options.onChange(historyView(state, busy)); };
  const read = async (before?: string) => {
    const stamp = options.captureRead?.();
    const data = await options.readMessages({ limit: CHAT_HISTORY_LIMIT, ...(before ? { before } : {}) });
    if (!current()) return null;
    const page = parsePage(data, options.validMessage, before);
    // Private view metadata must never consume a stale or malformed page.
    if (options.onAcceptedPage?.(data, before, stamp) === false || !current()) return null;
    return page;
  };
  const failed = (cause: any, kind: 'latest' | 'older' | 'recovery', gap?: Gap) => {
    if (!current()) return;
    if (cause?.code === 'CHAT_ACCESS_CHANGED') { options.onAccessChanged(); return; }
    if (cause?.code === 'CHAT_CURSOR_INVALID') {
      if (gap) gap.blocked = true;
      else if (kind === 'older') state.olderBlocked = true;
      state.pageError = 'The history position is no longer available. Refresh history to continue. Your loaded messages are kept.';
    } else if (kind === 'latest') state.latestError = 'Recent messages could not be loaded. Try again.';
    else state.pageError = 'More messages could not be loaded. Try again.';
  };
  const recover = async (gaps: Gap[]) => {
    let budget = CHAT_CATCHUP_PAGES;
    for (const gap of gaps) {
      while (budget > 0 && current() && state.gaps.includes(gap) && !gap.blocked) {
        budget--;
        try {
          const before = gap.cursor;
          const page = await read(before);
          if (!page) return;
          if (gap.probe && !gap.sawDated) {
            const dated = datedRows(page.messages);
            if (dated.length) {
              state.datedHeadIds = new Set(dated.map(row => row.id));
              gap.sawDated = true;
              // Once traversal crosses into dated rows it is an ordinary
              // retained gap. A later refresh needs a fresh null-boundary probe
              // for arrivals above this gap's already-advanced dated cursor.
              gap.probe = false;
              // `before` is still a server-issued null-row cursor. A dated
              // page's nextCursor would skip future arrivals above that row.
              state.nullBoundaryCursor = before;
            } else state.nullBoundaryCursor = page.nextCursor || before;
          }
          options.onMessages(page.messages, 'history');
          if (!page.hasMore || overlaps(page.messages, gap.anchors)) state.gaps = state.gaps.filter(item => item !== gap);
          else gap.cursor = page.nextCursor!;
          state.pageError = '';
          publish();
        } catch (cause) { failed(cause, 'recovery', gap); return; }
      }
      if (!budget) break;
    }
  };
  const run = (kind: NonNullable<HistoryView['busy']>, task: () => Promise<void>) => {
    if (!current()) return Promise.resolve();
    if (busy) return running || Promise.resolve();
    busy = kind;
    publish();
    running = (async () => {
      try { await task(); }
      finally {
        if (!current()) return;
        busy = null;
        running = null;
        publish();
        if (queuedRefresh) {
          const explicit = queuedExplicit;
          queuedRefresh = queuedExplicit = false;
          void refresh(explicit);
        }
      }
    })();
    return running;
  };
  const refresh = (explicit = false): Promise<void> => {
    if (!current()) return Promise.resolve();
    if (busy) {
      // Poll/focus/rejoin bursts share one trailing read, including when an
      // older page is pending. No page reply can replace a newer head cursor.
      queuedRefresh = true;
      queuedExplicit ||= explicit;
      return running || Promise.resolve();
    }
    return run('latest', async () => {
      try {
        const page = await read();
        if (!page) return;
        const created: Gap[] = [];
        const dated = datedRows(page.messages);
        const nullHead = page.hasMore && !dated.length;
        const addGap = (cursor: string, probe: boolean) => {
          const gap = { cursor, anchors: new Set(state.datedHeadIds), blocked: false, probe, sawDated: false };
          state.gaps.push(gap);
          created.push(gap);
        };
        if (nullHead) {
          // A completely unchanged null-only head can conceal new dated rows.
          // Probe behind it, but keep a pending probe's cursor and budget rather
          // than restarting it on every poll. An empty target walks to exhaustion.
          if (!state.gaps.some(gap => gap.probe)) addGap(state.nullBoundaryCursor || page.nextCursor!, true);
        } else if (state.initialized && state.headIds.size && page.hasMore && !overlaps(dated, state.datedHeadIds)) {
          addGap(page.nextCursor!, false);
        }
        // An empty verified head has no overlap anchor. Its first nonempty
        // replacement must expose that response's older frontier, even when a
        // socket has already inserted newer rows into the merged list. Never
        // use this transition to bypass an invalid cursor's explicit refresh.
        const firstHeadAfterEmpty = !state.headIds.size && page.messages.length > 0 && !state.olderBlocked;
        if (!state.initialized || firstHeadAfterEmpty || (explicit && state.olderBlocked)) {
          state.olderCursor = page.nextCursor;
          state.hasOlder = page.hasMore;
          state.olderBlocked = false;
        }
        if (explicit) {
          // Rebase invalid cursors only after an explicit successful refresh.
          // Retain each gap's original anchors, even across several reconnects.
          for (const gap of state.gaps) if (gap.blocked) {
            gap.cursor = page.nextCursor!;
            gap.blocked = false;
            gap.probe = nullHead;
            gap.sawDated = false;
            if (nullHead) state.nullBoundaryCursor = page.nextCursor;
            created.push(gap);
          }
          state.pageError = '';
        }
        state.gaps = state.gaps.filter(gap => gap.blocked || (page.hasMore && !overlaps(page.messages, gap.anchors)));
        state.headIds = new Set(page.messages.map(row => row.id));
        if (!nullHead) {
          state.datedHeadIds = new Set(dated.map(row => row.id));
          state.nullBoundaryCursor = null;
        }
        state.initialized = true;
        state.latestError = '';
        options.onMessages(page.messages, 'latest');
        publish();
        // Existing unresolved gaps do not consume another budget every 5s poll.
        // They remain visible until the user chooses Continue loading.
        await recover(created);
      } catch (cause) { failed(cause, 'latest'); }
    });
  };
  const older = () => run('older', async () => {
    if (!state.initialized || !state.hasOlder || !state.olderCursor || state.olderBlocked) return;
    try {
      const page = await read(state.olderCursor);
      if (!page) return;
      options.onMessages(page.messages, 'history');
      state.olderCursor = page.nextCursor;
      state.hasOlder = page.hasMore;
      state.pageError = '';
    } catch (cause) { failed(cause, 'older'); }
  });
  const continueRecovery = () => run('recovery', () => recover([...state.gaps]));
  return { refresh, older, continueRecovery, dispose: () => { active = false; queuedRefresh = false; } };
}
