/** Read-only history coordination. Cursors always belong to response pages, never merged rows. */
export type HistoryGeneration = number | 'initial';
export type HistoryView = {
  busy: boolean; hasOlder: boolean | null; gaps: number;
  problem: 'load' | 'cursor' | 'metadata' | null;
};
type Request = { kind: 'latest' | 'older' | 'gap'; generation: HistoryGeneration; gap?: Gap; rebase?: boolean };
type Gap = { cursor: string | null; headCursor: string; anchors: Set<string> };
export const HISTORY_CATCHUP_PAGES = 3;
export const emptyHistoryView: HistoryView = { busy: false, hasOlder: null, gaps: 0, problem: null };

export function createChatHistory(options: {
  read: (page: { limit: number; before?: string }, current: () => boolean) => Promise<any>;
  accepted?: (data: any) => boolean;
  current: (generation: HistoryGeneration) => boolean;
  valid: (message: any) => boolean;
  merge: (messages: any[]) => void;
  publish: (view: HistoryView) => void;
  failed: (cause?: unknown) => void;
  recovered: () => void;
}) {
  let older: string | null | undefined;
  const known = new Set<string>();
  const datedKnown = new Set<string>();
  let gaps: Gap[] = [];
  let busy = false, stopped = false, revision = 0, resetOlder = false;
  let pending: Request | null = null, failedRequest: Request | null = null;
  let problem: HistoryView['problem'] = null;
  let budget = 0;
  let lastView = '';
  const current = (generation: HistoryGeneration) => !stopped && options.current(generation);
  const publish = (generation: HistoryGeneration) => {
    if (!current(generation)) return;
    const view = { busy, hasOlder: older === undefined ? null : older !== null, gaps: gaps.length, problem };
    const key = JSON.stringify(view);
    if (key !== lastView) { lastView = key; options.publish(view); }
  };
  // Null timestamps are a sticky newest suffix in the server's ordering. Their
  // presence in two snapshots never proves continuity for dated messages below.
  const overlap = (messages: any[], anchors: Set<string>) => messages.some(row => row.created_at !== null && anchors.has(row.id));
  const sameAnchors = (left: Set<string>, right: Set<string>) => left.size === right.size
    && Array.from(left).every(id => right.has(id));
  const metadataValid = (data: any, before?: string) => typeof data.hasMore === 'boolean'
    && (data.hasMore ? typeof data.nextCursor === 'string' && data.nextCursor.trim().length > 0
      && data.nextCursor !== before && data.messages.length > 0 : data.nextCursor === null);

  const run = async (first: Request) => {
    if (busy || !current(first.generation)) return;
    busy = true;
    let request: Request | null = first;
    try {
      while (request && current(request.generation)) {
        const reading: Request = request;
        request = null;
        const readingRevision = revision;
        let noPriorRows = known.size === 0;
        const anchors = new Set(datedKnown);
        const before = reading.kind === 'older' ? older : reading.kind === 'gap' ? reading.gap?.cursor : undefined;
        if (reading.kind !== 'latest' && !before) break;
        publish(reading.generation);
        try {
          const readCurrent = () => current(reading.generation) && (reading.kind === 'latest' || readingRevision === revision);
          const data = await options.read({ limit: 200, ...(before ? { before } : {}) }, readCurrent);
          // A newer refresh supersedes an older page without allowing its cursor to
          // overwrite newer state. The initial HTTP fallback remains session-scoped.
          if (!current(reading.generation) || (reading.kind !== 'latest' && readingRevision !== revision)) continue;
          if (!Array.isArray(data?.messages) || data.messages.some((row: any) => !options.valid(row))) {
            throw new Error('Invalid conversation response');
          }
          // Private metadata is subject to the same scope/revision/row fences.
          // Legacy or malformed paging can still display authorized rows below,
          // but cannot establish a private membership/version context.
          const changedScope = options.accepted?.(data.success === true && metadataValid(data, before || undefined) ? data : null);
          if (!current(reading.generation)) continue;
          if (changedScope) {
            known.clear(); datedKnown.clear(); anchors.clear(); gaps = []; older = undefined;
            noPriorRows = true; resetOlder = false; problem = null; failedRequest = null;
            if (reading.kind !== 'latest') {
              revision++; pending = { kind: 'latest', generation: 'initial', rebase: true };
              continue;
            }
          }
          // Even a legacy server can show its authorized rows, but it cannot claim
          // history is complete or advance our trusted overlap anchors/cursors.
          options.merge(data.messages);
          if (problem === 'cursor' && reading.kind === 'latest' && !reading.rebase) {
            // Reconnect can still show new rows, but only the explicit refresh
            // control may reset an expired cursor or its original gap anchors.
            options.recovered();
          } else if (!metadataValid(data, before || undefined)) {
            problem = problem === 'cursor' ? 'cursor' : 'metadata'; failedRequest = reading; budget = 0;
            options.recovered();
          } else {
            if (reading.kind === 'latest') {
              // An empty earlier snapshot has no overlap anchor. Its terminal
              // cursor must not strand older rows when the room later fills up.
              if (older === undefined || resetOlder || noPriorRows) {
                older = data.nextCursor; resetOlder = false;
              }
              if (!data.hasMore) { gaps = []; older = null; }
              else {
                // Invalidated gaps retain their original anchors through refresh.
                gaps = gaps.filter(gap => {
                  if (gap.cursor !== null) return true;
                  if (overlap(data.messages, gap.anchors)) return false;
                  gap.cursor = data.nextCursor;
                  gap.headCursor = data.nextCursor;
                  return true;
                });
                const needsDatedScan = anchors.size > 0 || !noPriorRows
                  || data.messages.some((row: any) => row.created_at === null);
                if (needsDatedScan && !overlap(data.messages, anchors)
                  && !gaps.some(gap => gap.headCursor === data.nextCursor && sameAnchors(gap.anchors, anchors))) {
                  // With no dated anchor, scan to exhaustion. This also probes
                  // below an unchanged all-null head on later refreshes. The
                  // ordinary page budget and explicit continuation still apply.
                  gaps.push({ cursor: data.nextCursor, headCursor: data.nextCursor, anchors });
                }
              }
            } else if (reading.kind === 'older') older = data.nextCursor;
            else if (reading.gap) {
              if (!data.hasMore || overlap(data.messages, reading.gap.anchors)) {
                gaps = gaps.filter(gap => gap !== reading.gap);
              } else reading.gap.cursor = data.nextCursor;
              if (!data.hasMore) older = null;
            }
            for (const row of data.messages) {
              known.add(row.id);
              if (row.created_at !== null) datedKnown.add(row.id);
            }
            problem = null; failedRequest = null;
            options.recovered();
          }
        } catch (cause: any) {
          if (!current(reading.generation) || (reading.kind !== 'latest' && readingRevision !== revision)) continue;
          const detail = cause?.response?.data;
          const invalid = detail?.code === 'CHAT_CURSOR_INVALID' && detail?.refreshRequired === true;
          problem = invalid || problem === 'cursor' ? 'cursor' : 'load'; failedRequest = reading; budget = 0;
          if (invalid && reading.kind === 'older') resetOlder = true;
          if (invalid && reading.gap) reading.gap.cursor = null;
          options.failed(cause);
        } finally {
          // Refresh has priority. Only the newest eligible refresh is retained.
          if (pending) { request = pending; pending = null; }
          else if (current(reading.generation) && !problem && budget > 0 && gaps.some(gap => gap.cursor)) {
            request = { kind: 'gap', generation: reading.generation, gap: gaps.find(gap => gap.cursor) };
            budget--;
          }
        }
      }
    } finally {
      busy = false;
      // Release only the loading indicator after a disconnected generation drains.
      // Its rows/errors/cursors are still fenced above; manual HTTP recovery must
      // remain available even when the socket cannot reconnect.
      publish('initial');
    }
  };
  const refresh = (generation: HistoryGeneration = 'initial', rebase = false) => {
    if (!current(generation)) return;
    revision++;
    budget = HISTORY_CATCHUP_PAGES;
    const request: Request = { kind: 'latest', generation, rebase };
    if (busy) pending = request;
    else void run(request);
  };
  return {
    refresh,
    older: () => {
      if (busy || problem || !older || !current('initial')) return;
      budget = 0;
      void run({ kind: 'older', generation: 'initial' });
    },
    continueRecovery: () => {
      if (busy || problem || !current('initial')) return;
      const gap = gaps.find(item => item.cursor);
      if (!gap) return;
      budget = HISTORY_CATCHUP_PAGES - 1;
      void run({ kind: 'gap', generation: 'initial', gap });
    },
    retry: () => {
      if (busy || !current('initial')) return;
      if (problem === 'cursor' || problem === 'metadata' || !failedRequest) { refresh('initial', true); return; }
      const request = { ...failedRequest, generation: 'initial' as const };
      problem = null; budget = 0;
      void run(request);
    },
    invalidate: () => { pending = null; budget = 0; },
    dispose: () => { stopped = true; pending = null; budget = 0; },
  };
}
