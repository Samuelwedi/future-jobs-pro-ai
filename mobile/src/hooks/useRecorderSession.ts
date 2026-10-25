import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { AudioModule, type RecorderState, type RecordingOptions } from 'expo-audio';
import { RecorderSession } from '../services/RecorderSession';

export function useRecorderSession(options: RecordingOptions, poll = false) {
  const sessionRef = useRef<RecorderSession | null>(null);
  if (!sessionRef.current) {
    // Match SDK 55's platform options without constructing a native object in render.
    const platformOptions = {
      extension: options.extension, sampleRate: options.sampleRate,
      numberOfChannels: options.numberOfChannels, bitRate: options.bitRate,
      isMeteringEnabled: options.isMeteringEnabled ?? false,
      ...(Platform.OS === 'ios' ? options.ios : Platform.OS === 'android' ? options.android : options.web),
    };
    sessionRef.current = new RecorderSession(() => new AudioModule.AudioRecorder(platformOptions));
  }
  const session = sessionRef.current;
  const [state, setState] = useState<RecorderState | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    session.activate();
    const timer = poll ? setInterval(() => {
      try {
        const next = session.status();
        setState(next);
        if (next) setError(false);
      }
      catch { setState(null); setError(true); }
    }, 200) : null;
    return () => {
      if (timer) clearInterval(timer);
      session.dispose();
    };
  }, [session, poll]);
  return { session, state, error };
}
