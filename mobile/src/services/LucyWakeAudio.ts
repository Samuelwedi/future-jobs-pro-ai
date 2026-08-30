import {
  requireOptionalNativeModule,
  type EventSubscription,
} from 'expo-modules-core';

type AudioEvent = {
  pcm16Base64: string;
  sampleRate: number;
};

type LucyWakeAudioNativeModule = {
  start(): Promise<void>;
  stop(): Promise<void>;
  addListener(
    eventName: 'onAudioFrame',
    listener: (event: AudioEvent) => void
  ): EventSubscription;
};

const Native =
  requireOptionalNativeModule<LucyWakeAudioNativeModule>(
    'LucyWakeAudio'
  );

export const isLucyWakeAudioAvailable = Boolean(Native);

export const LucyWakeAudio = {
  isAvailable: isLucyWakeAudioAvailable,

  async start(): Promise<void> {
    if (!Native) {
      throw new Error(
        'Lucy wake-word audio is not included in this app build.'
      );
    }

    await Native.start();
  },

  async stop(): Promise<void> {
    if (!Native) {
      return;
    }

    await Native.stop();
  },

  onAudio(
    listener: (event: AudioEvent) => void
  ): EventSubscription | null {
    if (!Native) {
      return null;
    }

    return Native.addListener('onAudioFrame', listener);
  },
};
