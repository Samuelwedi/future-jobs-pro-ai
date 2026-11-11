import { AppState } from 'react-native';
import * as Network from 'expo-network';
import { api } from './api';
import { checkOnlineStatus } from './offlineService';
import { createChatTextOutbox } from './chatTextOutboxEngine';
import type { ChatTextOwner } from './chatTextOutboxStore';

export const chatTextOutbox = createChatTextOutbox({
  openSession: (owner, current) => api.openChatTextSession(owner, current), online: checkOnlineStatus,
});
let binding = 0;
export function startChatTextOutbox(owner: ChatTextOwner, allowed: () => boolean = () => true) {
  if (!allowed()) return () => {};
  const generation = ++binding;
  const current = () => !disposed && generation === binding && allowed();
  let active = AppState.currentState === 'active', disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    const delay = chatTextOutbox.nextWakeDelay();
    if (current() && active && delay !== null) timer = setTimeout(kick, delay);
  };
  const kick = () => { if (current() && active) void chatTextOutbox.kick(); };
  chatTextOutbox.setContext(null, false);
  chatTextOutbox.setContext(owner, active);
  const app = AppState.addEventListener('change', state => {
    if (!current()) return;
    active = state === 'active'; chatTextOutbox.setContext(owner, active); schedule(); kick();
  });
  const network = Network.addNetworkStateListener(state => {
    if (state.isConnected && state.isInternetReachable !== false) kick();
  });
  // No timer when empty, blocked, offline or backgrounded. Pending work alone
  // schedules bounded retries; OS background execution is never promised.
  const unsubscribe = chatTextOutbox.subscribe(schedule);
  kick();
  return () => { if (!disposed && generation === binding) chatTextOutbox.setContext(null, false); disposed = true; app.remove(); network.remove(); unsubscribe(); if (timer) clearTimeout(timer); };
}
