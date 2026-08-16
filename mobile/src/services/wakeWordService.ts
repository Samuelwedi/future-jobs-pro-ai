import { Platform } from 'react-native';

let PorcupineManager: any = null;
try {
  PorcupineManager = require('@picovoice/porcupine-react-native').PorcupineManager;
} catch {
  // Native wake-word modules are unavailable in Expo Go and web builds.
}

const keywordPath = () =>
  Platform.OS === 'ios' ? 'assets/lucy_ios.ppn' : 'assets/lucy_android.ppn';

export class WakeWordService {
  private manager: any = null;
  private listening = false;

  constructor(private readonly onWakeWord: () => void) {}

  static isSupported(): boolean {
    return Platform.OS !== 'web' && Boolean(PorcupineManager);
  }

  async start(): Promise<void> {
    if (this.listening) return;
    if (!PorcupineManager) {
      throw new Error('Wake word requires a signed development or store build.');
    }
    const accessKey = process.env.EXPO_PUBLIC_PICOVOICE_ACCESS_KEY?.trim();
    if (!accessKey) throw new Error('Picovoice access key is not configured.');

    this.manager = await PorcupineManager.fromKeywordPaths(
      accessKey,
      [keywordPath()],
      () => this.onWakeWord(),
      undefined,
      [0.55],
    );
    await this.manager.start();
    this.listening = true;
  }

  async stop(): Promise<void> {
    if (!this.manager) return;
    try {
      if (this.listening) await this.manager.stop();
      await this.manager.delete?.();
    } finally {
      this.manager = null;
      this.listening = false;
    }
  }

  triggerManually(): void {
    this.onWakeWord();
  }
}
