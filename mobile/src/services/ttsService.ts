// mobile/src/services/ttsService.ts
import { Audio } from 'expo-av';

export class TTSService {
  private ws: WebSocket | null = null;
  private sound: Audio.Sound | null = null;

  speak(text: string, onStart?: () => void, onEnd?: () => void) {
    // Placeholder – use Expo Speech for testing
    console.log('TTS would speak:', text);
    // import Speech from 'expo-speech';
    // Speech.speak(text);
  }
}