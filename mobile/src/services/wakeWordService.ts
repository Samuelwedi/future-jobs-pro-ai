import { AppState, DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LucyWakeAudio } from './LucyWakeAudio';

type WakeStatus = 'off' | 'connecting' | 'listening' | 'detected' | 'error';

export class WakeWordService {
  private socket?: WebSocket;
  private audioSubscription?: { remove(): void };
  private appSubscription?: { remove(): void };
  private lastDetectionAt = 0;

  constructor(private readonly onWakeWord: () => void) {}

  private status(status: WakeStatus, message?: string) {
    DeviceEventEmitter.emit('lucyWakeWordStatusChanged', { status, message });
  }

  async start() {
    if (this.socket) return;
    const endpoint = process.env.EXPO_PUBLIC_LUCY_WAKE_URL?.trim();
    if (!endpoint) throw new Error('EXPO_PUBLIC_LUCY_WAKE_URL is not configured');
    const token = await AsyncStorage.getItem('token');
    const url = `${endpoint}${endpoint.includes('?') ? '&' : '?'}token=${encodeURIComponent(token || '')}`;
    this.status('connecting');
    this.socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      const socket = this.socket!;
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error('Lucy wake service connection failed'));
    });
    this.socket.onmessage = event => {
      const message = JSON.parse(String(event.data));
      if (message.type !== 'wake') return;
      const now = Date.now();
      if (now - this.lastDetectionAt < 2500) return;
      this.lastDetectionAt = now;
      this.status('detected');
      this.onWakeWord();
    };
    this.audioSubscription = LucyWakeAudio.onAudio(frame => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: 'audio', ...frame }));
      }
    });
    await LucyWakeAudio.start();
    this.appSubscription = AppState.addEventListener('change', state => {
      if (state !== 'active') this.stop();
    });
    this.status('listening');
  }

  async stop() {
    this.audioSubscription?.remove();
    this.appSubscription?.remove();
    this.audioSubscription = undefined;
    this.appSubscription = undefined;
    await LucyWakeAudio.stop().catch(() => undefined);
    this.socket?.close();
    this.socket = undefined;
    this.status('off');
  }
}
