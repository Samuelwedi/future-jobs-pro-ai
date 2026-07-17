// mobile/src/services/wakeWordService.ts
export class WakeWordService {
  private onWakeWord: () => void;
  constructor(onWakeWord: () => void) {
    this.onWakeWord = onWakeWord;
  }
  async start() {
    console.log('WakeWordService started (placeholder)');
    // Simulate wake word for testing:
    // this.onWakeWord();
  }
  stop() {}
}