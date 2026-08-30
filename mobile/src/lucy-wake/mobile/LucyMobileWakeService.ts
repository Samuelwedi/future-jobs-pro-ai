import { LucyStreamingDetector } from '../core/lucy-wake-core.mjs';

export type WakeEvent = { label: 'lucy' | 'hey_lucy'; confidence: number; detectedAt: number };
export type AudioFrame = { samples?: number[]; pcm16Base64?: string; sampleRate: number };

export interface NativePcmSource {
  start(options: { sampleRate: number; channels: number; frameSamples: number }): Promise<void>;
  stop(): Promise<void>;
  onAudio(listener: (frame: AudioFrame) => void): { remove(): void } | null;
}

function decodePcm16(base64: string): Float32Array {
  const binary = globalThis.atob(base64);
  const output = new Float32Array(Math.floor(binary.length / 2));
  for (let index = 0; index < output.length; index++) {
    let value = binary.charCodeAt(index * 2) | (binary.charCodeAt(index * 2 + 1) << 8);
    if (value >= 0x8000) value -= 0x10000;
    output[index] = value / 32768;
  }
  return output;
}

export class LucyMobileWakeService {
  private detector: LucyStreamingDetector;
  private subscription?: { remove(): void };

  constructor(private source: NativePcmSource, model: object, private onWake: (event: WakeEvent) => void) {
    this.detector = new LucyStreamingDetector(model, { threshold: 0.82 });
  }

  async start() {
    if (this.subscription) return;
    const subscription = this.source.onAudio(frame => {
      const samples = frame.samples ? Float32Array.from(frame.samples) : decodePcm16(frame.pcm16Base64 || '');
      for (const event of this.detector.push(samples, frame.sampleRate)) this.onWake(event as WakeEvent);
    });
    if (!subscription) throw new Error('Native PCM audio source is unavailable. Rebuild the native app; Expo Go is not supported.');
    this.subscription = subscription;
    try {
      await this.source.start({ sampleRate: 16000, channels: 1, frameSamples: 1600 });
    } catch (cause) {
      this.subscription.remove();
      this.subscription = undefined;
      throw cause;
    }
  }

  async stop() {
    this.subscription?.remove();
    this.subscription = undefined;
    await this.source.stop();
    this.detector.reset();
  }
}
