// ============================================
// OFFLINE QUEUE SERVICE (supports POST, PUT, PATCH, DELETE)
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as Network from 'expo-network';
import { api } from './api';

const QUEUE_KEY = 'offline-queue';

let isOnline = true;

export async function checkOnlineStatus(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    isOnline = state.isConnected ?? false;
    return isOnline;
  } catch {
    return true; // assume online if can't check
  }
}

export function getOnlineStatus(): boolean {
  return isOnline;
}

// Returns a cleanup function to stop polling
export function listenToNetworkChanges(callback: (online: boolean) => void): () => void {
  const interval = setInterval(async () => {
    const online = await checkOnlineStatus();
    callback(online);
  }, 10000);

  return () => clearInterval(interval);
}

export async function queueAction(action: {
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  data?: any;
  fileUri?: string;
  fieldName?: string;
}) {
  const queue = await getQueue();
  queue.push({ ...action, timestamp: Date.now() });
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

async function getQueue(): Promise<any[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function processQueue(): Promise<void> {
  const queue = await getQueue();
  if (queue.length === 0) return;

  console.log(`🔄 Processing ${queue.length} offline actions...`);

  for (const action of queue) {
    try {
      if (action.fileUri) {
        await api.uploadFileWithData(
          action.url,
          action.fileUri,
          action.data || {},
          action.fieldName || 'file'
        );
      } else if (action.method === 'PUT') {
        await api.put(action.url, action.data);
      } else if (action.method === 'PATCH') {
        await api.patch(action.url, action.data);
      } else if (action.method === 'DELETE') {
        // api.delete not implemented yet, but we'll handle it later
        console.warn('DELETE not yet supported in offline queue');
      } else {
        await api.post(action.url, action.data);
      }
    } catch (error) {
      console.error('Failed to process offline action:', error);
      return; // stop on first failure, retry later
    }
  }

  await AsyncStorage.removeItem(QUEUE_KEY);
  console.log('✅ Offline queue processed');
}

export async function getPendingCount(): Promise<number> {
  const queue = await getQueue();
  return queue.length;
}
