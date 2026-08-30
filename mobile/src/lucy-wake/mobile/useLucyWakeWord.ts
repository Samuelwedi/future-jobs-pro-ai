import { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { LucyMobileWakeService, NativePcmSource, WakeEvent } from './LucyMobileWakeService';

export function useLucyWakeWord(options: {
  enabled: boolean;
  source: NativePcmSource;
  model: object;
  onWake: (event: WakeEvent) => void;
}) {
  const callback = useRef(options.onWake);
  const [status, setStatus] = useState<'off' | 'starting' | 'listening' | 'error'>('off');
  const [error, setError] = useState<string | null>(null);
  callback.current = options.onWake;

  useEffect(() => {
    if (!options.enabled) {
      setStatus('off');
      return;
    }
    let cancelled = false;
    let running = false;
    let starting = false;
    const service = new LucyMobileWakeService(options.source, options.model, event => callback.current(event));
    setError(null);

    const followAppState = async (appState: AppStateStatus) => {
      if (cancelled) return;
      if (appState === 'active') {
        if (running || starting) return;
        starting = true;
        setStatus('starting');
        try {
          await service.start();
          starting = false;
          if (cancelled || AppState.currentState !== 'active') {
            await service.stop();
            running = false;
            if (!cancelled) setStatus('off');
            return;
          }
          running = true;
          if (!cancelled) setStatus('listening');
        } catch (cause) {
          starting = false;
          if (!cancelled) {
            setError(cause instanceof Error ? cause.message : 'Wake-word startup failed');
            setStatus('error');
          }
        }
      } else {
        if (running) await service.stop();
        running = false;
        if (!cancelled) setStatus('off');
      }
    };

    const appStateSubscription = AppState.addEventListener('change', state => { void followAppState(state); });
    void followAppState(AppState.currentState);
    return () => {
      cancelled = true;
      appStateSubscription.remove();
      void service.stop();
    };
  }, [options.enabled, options.source, options.model]);

  return { status, error };
}
