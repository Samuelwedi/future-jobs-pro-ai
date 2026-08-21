import {
  requireOptionalNativeModule,
  type EventSubscription,
} from 'expo-modules-core';

export type LucyWakeAudioEvent = {
  pcm16Base64: string;
  sampleRate: number;
};

export type LucyWakeAudioModule = {
  start(): Promise<void>;
  stop(): Promise<void>;
  addListener(
    eventName: 'onAudioFrame',
    listener: (event: LucyWakeAudioEvent) => void
  ): EventSubscription;
};

export default requireOptionalNativeModule<LucyWakeAudioModule>(
  'LucyWakeAudio'
);