import { DeviceEventEmitter } from 'react-native';
import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import { LucyWakeAudio } from './LucyWakeAudio';
import { LucyMobileWakeService } from '../lucy-wake/mobile/LucyMobileWakeService';
import model from '../lucy-wake/core/lucy-bootstrap-model.json';

type WakeStatus = 'off' | 'starting' | 'listening' | 'detected' | 'error';

export class WakeWordService {
  private service?: LucyMobileWakeService;
  private starting?: Promise<void>;
  private lastWakeAt = 0;

  constructor(private readonly onWakeWord: () => void) {}

  private status(status: WakeStatus, message?: string) {
    DeviceEventEmitter.emit('lucyWakeWordStatusChanged', { status, message });
  }

  async start(): Promise<void> {
    if (this.service) return;
    if (this.starting) return this.starting;
    this.starting = this.startLocalDetector();
    try {
      await this.starting;
    } finally {
      this.starting = undefined;
    }
  }

  private async startLocalDetector(): Promise<void> {
    this.status('starting');
    if (!LucyWakeAudio.isAvailable) {
      const message = 'The Lucy iOS/Android microphone module is missing from this build.';
      this.status('error', message);
      throw new Error(message);
    }

    let permission = await getRecordingPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) {
      permission = await requestRecordingPermissionsAsync();
      // Give iOS a moment to publish the new AVAudioSession permission state
      // before the native capture module checks it.
      if (permission.granted) await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!permission.granted) {
      const message = 'Microphone permission is required for Hey Lucy.';
      this.status('error', message);
      throw new Error(message);
    }

    const service = new LucyMobileWakeService(LucyWakeAudio, model, () => {
      const now = Date.now();
      if (now - this.lastWakeAt < 2500) return;
      this.lastWakeAt = now;
      this.status('detected');
      this.onWakeWord();
      setTimeout(() => {
        if (this.service) this.status('listening');
      }, 1200);
    });

    try {
      await service.start();
      this.service = service;
      this.status('listening');
    } catch (cause) {
      await service.stop().catch(() => undefined);
      const message = cause instanceof Error ? cause.message : 'Hey Lucy could not start.';
      this.status('error', message);
      throw cause;
    }
  }

  async stop(): Promise<void> {
    const service = this.service;
    this.service = undefined;
    if (service) await service.stop().catch(() => undefined);
    this.status('off');
  }
}
