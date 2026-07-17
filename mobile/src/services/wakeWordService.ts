// mobile/src/services/wakeWordService.ts
import { Platform } from 'react-native';

// Use a type declaration to avoid TS errors if the SDK isn't installed yet
// We'll load the SDK dynamically with a try/catch
let PorcupineManager: any = null;

// Dynamically import the SDK – if not installed, we'll use the simulation
try {
  // This will only work in a development build with native modules
  const porcupineModule = require('@picovoice/porcupine-react-native');
  PorcupineManager = porcupineModule.PorcupineManager;
} catch (error) {
  console.warn('⚠️ Porcupine SDK not installed – using simulation mode');
}

// Paths to your custom keyword files (once you have them)
// Place them in mobile/assets/ and adjust the paths accordingly
const getKeywordPath = (): string => {
  if (Platform.OS === 'ios') {
    // For iOS, the file must be bundled in the app
    return 'assets/lucy_ios.ppn'; // adjust if using react-native-fs
  } else {
    return 'assets/lucy_android.ppn';
  }
};

const getModelPath = (): string => {
  return 'assets/porcupine_params.pv';
};

export class WakeWordService {
  private porcupine: any = null;
  private onWakeWord: () => void;
  private isListening = false;
  private simulationInterval: ReturnType<typeof setInterval> | null = null;

  constructor(onWakeWord: () => void) {
    this.onWakeWord = onWakeWord;
  }

  /**
   * Start listening for the wake word.
   * If the SDK is not available, it falls back to a simulation mode
   * (for Expo Go / testing).
   */
  async start() {
    if (this.isListening) return;

    // If Porcupine SDK is not available, use simulation
    if (!PorcupineManager) {
      console.warn('⚠️ Using simulation mode – wake word is triggered every 30 seconds');
      this.startSimulation();
      return;
    }

    try {
      // Check if custom keyword file exists – we'll try to load it
      // If it fails, fall back to built‑in keywords
      let keywordPaths: string[] = [];
      try {
        // Attempt to load custom "Lucy" keyword
        const keywordPath = getKeywordPath();
        // In a real app, you'd check if the file exists using react-native-fs
        // For now, we'll assume it exists – if it doesn't, the require will throw
        keywordPaths = [keywordPath];
      } catch (error) {
        console.warn('Custom keyword not found, using built‑in keywords');
        keywordPaths = ['jarvis', 'computer']; // built‑in keywords (no file needed)
      }

      // Create the PorcupineManager instance
      this.porcupine = await PorcupineManager.create(
        {
          keywordPaths: keywordPaths,
          modelPath: getModelPath(),
          sensitivities: [0.5], // one per keyword
        },
        (keywordIndex: number) => {
          console.log(`🔔 Wake word detected! Index: ${keywordIndex}`);
          this.onWakeWord();
        }
      );

      this.isListening = true;
      console.log('✅ Wake word service started (Porcupine)');
    } catch (error) {
      console.error('❌ Failed to start wake word service:', error);
      // Fallback to simulation mode
      this.startSimulation();
    }
  }

  /**
   * Stop listening and clean up resources.
   */
  stop() {
    this.isListening = false;
    this.stopSimulation();

    if (this.porcupine) {
      try {
        this.porcupine.stop();
        this.porcupine = null;
        console.log('✅ Wake word service stopped');
      } catch (error) {
        console.error('Error stopping Porcupine:', error);
      }
    }
  }

  /**
   * Simulation mode – triggers the wake word every 30 seconds for testing.
   */
  private startSimulation() {
    this.stopSimulation();
    console.log('🔧 Starting simulation mode (wake word every 30s)');
    this.simulationInterval = setInterval(() => {
      console.log('🔔 SIMULATION: Wake word triggered');
      this.onWakeWord();
    }, 30000);
  }

  private stopSimulation() {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
  }

  /**
   * Manually trigger the wake word (useful for testing or if you want to
   * combine with a button press).
   */
  triggerManually() {
    console.log('🔔 Manual wake word trigger');
    this.onWakeWord();
  }
}