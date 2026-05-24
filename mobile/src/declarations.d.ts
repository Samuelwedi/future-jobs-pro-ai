declare module 'react-native-voice' {
  export interface SpeechResultsEvent {
    value?: string[];
  }
  export interface SpeechErrorEvent {
    error?: string;
  }
  const Voice: {
    onSpeechResults: (e: SpeechResultsEvent) => void;
    onSpeechError: (e: SpeechErrorEvent) => void;
    start: (locale: string) => Promise<void>;
    stop: () => Promise<void>;
    destroy: () => Promise<void>;
    removeAllListeners: () => void;
  };
  export default Voice;
}