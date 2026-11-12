import { useEffect, useRef, useState } from 'react';
import { AppState, View, ViewToken } from 'react-native';
import * as Network from 'expo-network';
import { api } from '../services/api';
import { createPrivateViews, fullyVisible, privateViewRevision, readViewCounts, subscribePrivateViewCounts, ViewCount, ViewedMessage, viewAccessDenied } from '../utils/chatViews';

type Session = Awaited<ReturnType<typeof api.openChatSession>>;
type Rect = { x: number; y: number; width: number; height: number };
const measure = (view: View): Promise<Rect> => new Promise(resolve => view.measureInWindow((x, y, width, height) => resolve({ x, y, width, height })));

/** Native geometry is sampled only for FlatList-reported viewable rows. Neither
 * fetching, rendering, socket arrival nor scrollToEnd establishes visibility.
 * Full bubble containment must persist 1s. Oversized bubbles stay unmarked.
 */
export function useChatViews(options: {
  owner: { id: string; companyId: string; role: string }; roomId: string;
  current: () => boolean; session: () => Session | null; rows: any[];
  denied: () => void; refreshHistory: (messages: ViewedMessage[]) => void;
}) {
  const latest = useRef(options); latest.current = options;
  const viewport = useRef<View>(null);
  const rowViews = useRef(new Map<string, View>());
  const visible = useRef(new Set<string>());
  const covers = useRef(new Set<string>());
  const phase = useRef({ active: AppState.currentState === 'active', focused: true, online: false, covered: false, layout: false, epoch: 0, stopped: false });
  const countRequest = useRef(0);
  const membership = useRef<string | null>(null);
  const lastMembership = useRef<string | null>(null);
  const [count, setCount] = useState<ViewCount | null>(null);
  const [supported, setSupported] = useState(false);
  const current = () => !phase.current.stopped && latest.current.current() && !!latest.current.session()?.isCurrent();
  const eligible = () => current() && phase.current.active && phase.current.focused && phase.current.online && !phase.current.covered && phase.current.layout;
  const clearVisibility = () => { phase.current.epoch++; visible.current.clear(); controller.current?.reset(); };
  const deny = () => {
    if (!current()) return;
    clearVisibility(); phase.current.stopped = true; countRequest.current++; membership.current = null; lastMembership.current = null;
    setCount(null); setSupported(false); latest.current.denied();
  };
  const loadCount = async () => {
    if (!current() || !membership.current) return;
    const request = ++countRequest.current, revision = privateViewRevision(), expectedMembership = membership.current;
    const valid = () => current() && countRequest.current === request && privateViewRevision() === revision && membership.current === expectedMembership;
    setCount(null);
    try {
      const result = await api.getChatViewCounts(latest.current.owner, valid);
      if (!valid() || !result.isSessionCurrent()) return;
      const rooms = readViewCounts(result.data, latest.current.owner);
      const room = rooms.find(row => row.roomId === latest.current.roomId && row.membershipInstanceId === expectedMembership);
      setCount(room || null);
    } catch (error) { if (valid()) { setCount(null); if (viewAccessDenied(error)) deny(); } }
  };
  const controller = useRef<ReturnType<typeof createPrivateViews> | null>(null);
  if (!controller.current) controller.current = createPrivateViews({
    owner: options.owner, roomId: options.roomId, current: eligible,
    acknowledge: (scope, messages, valid) => latest.current.session()!.acknowledgeViews(scope, messages,
      () => valid() && messages.every(message => latest.current.rows.some(row => row.id === message.id && row.view_version === message.viewVersion))),
    changed: () => {}, // Completion invalidation below refreshes both known and uncertain results.
    unavailable: () => { clearVisibility(); setCount(null); },
    denied: deny,
    stale: messages => { clearVisibility(); membership.current = null; setCount(null); setSupported(false); latest.current.refreshHistory(messages.map(row => ({ ...row }))); },
  });
  useEffect(() => {
    let alive = true, measuring = false, networkRevision = 0;
    const unsubscribeCounts = subscribePrivateViewCounts(() => {
      if (alive && current()) { setCount(null); void loadCount(); }
    });
    const network = (state: Network.NetworkState) => {
      if (!alive) return;
      const online = state.isConnected === true && state.isInternetReachable !== false;
      if (online !== phase.current.online) clearVisibility();
      phase.current.online = online;
    };
    const change = AppState.addEventListener('change', state => {
      clearVisibility(); phase.current.active = state === 'active';
    });
    const blur = AppState.addEventListener('blur', () => { clearVisibility(); phase.current.focused = false; });
    const focus = AppState.addEventListener('focus', () => { clearVisibility(); phase.current.focused = true; });
    const connection = Network.addNetworkStateListener(state => { networkRevision++; network(state); });
    const revision = networkRevision;
    void Network.getNetworkStateAsync().then(state => { if (revision === networkRevision) network(state); }).catch(() => {});
    const timer = setInterval(async () => {
      if (!eligible()) { clearVisibility(); return; }
      if (measuring || !viewport.current || !visible.current.size) return;
      const epoch = phase.current.epoch;
      measuring = true;
      try {
        const bounds = await measure(viewport.current);
        const rows = latest.current.rows.filter(row => visible.current.has(row.id)).slice(0, 100);
        const measured = await Promise.all(rows.map(async row => {
          const view = rowViews.current.get(row.id);
          return view && fullyVisible(await measure(view), bounds) ? row : null;
        }));
        if (!alive || !eligible() || epoch !== phase.current.epoch) return;
        let monotonic = NaN;
        try { if (typeof performance !== 'undefined' && typeof performance.now === 'function') monotonic = performance.now(); } catch { /* unavailable clocks fail closed */ }
        if (controller.current?.observe(measured.filter(Boolean), monotonic) === false) clearVisibility();
      } finally { measuring = false; }
    }, 200);
    return () => {
      alive = false; phase.current.stopped = true; clearVisibility(); countRequest.current++;
      unsubscribeCounts(); controller.current?.dispose(); clearInterval(timer); change.remove(); blur.remove(); focus.remove(); connection.remove();
    };
  }, []);
  return {
    viewport, count, supported,
    viewabilityConfig: useRef({ itemVisiblePercentThreshold: 100, minimumViewTime: 0 }).current,
    onViewableItemsChanged: useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (!eligible()) { clearVisibility(); return; }
      phase.current.epoch++;
      visible.current = new Set(viewableItems.filter(token => token.isViewable).map(token => String(token.item.id)));
      // Reset dwell on any native visibility transition; this is conservative
      // during fast scrolling and avoids acknowledging a departed batch.
      controller.current?.reset();
    }).current,
    rowRef: (id: string, view: View | null) => { if (view) rowViews.current.set(id, view); else rowViews.current.delete(id); },
    layout: () => { phase.current.layout = true; phase.current.epoch++; controller.current?.reset(); },
    scroll: () => { phase.current.epoch++; controller.current?.reset(); },
    covered: (covered: boolean, key = 'chooser') => {
      if (covered) covers.current.add(key); else covers.current.delete(key);
      clearVisibility(); phase.current.covered = covers.current.size > 0;
    },
    history(data: any) {
      if (!current()) return;
      const context = controller.current?.context(data?.viewContext);
      const previous = lastMembership.current, previousEligible = membership.current;
      membership.current = context?.membershipInstanceId || null;
      if (context) lastMembership.current = context.membershipInstanceId;
      setSupported(!!context);
      if (!context) { clearVisibility(); setCount(null); }
      else if (previousEligible !== membership.current) { clearVisibility(); void loadCount(); }
      return !!previous && !!context && previous !== context.membershipInstanceId;
    },
    failed(error: any) { if (current() && viewAccessDenied(error)) deny(); },
  };
}
