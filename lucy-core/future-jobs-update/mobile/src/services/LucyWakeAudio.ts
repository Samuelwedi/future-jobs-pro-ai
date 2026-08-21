import { EventSubscription, requireNativeModule } from 'expo-modules-core';

type AudioEvent = { pcm16Base64: string; sampleRate: 16000 };
const Native = requireNativeModule('LucyWakeAudio');

export const LucyWakeAudio = {
  start: (): Promise<void> => Native.start(),
  stop: (): Promise<void> => Native.stop(),
  onAudio: (listener: (event: AudioEvent) => void): EventSubscription => Native.addListener('onAudioFrame', listener),
};
