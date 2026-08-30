import React, { useEffect, useRef, useState } from 'react';
import { LucyWebWakeListener } from './LucyWebWakeListener.mjs';

type WakeEvent = { label: 'lucy' | 'hey_lucy'; confidence: number; detectedAt: number };

export function LucyWakeButton({ model, onWake }: { model: object; onWake: (event: WakeEvent) => void }) {
  const listener = useRef<LucyWebWakeListener | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => () => { void listener.current?.stop(); }, []);

  const toggle = async () => {
    setError('');
    try {
      if (enabled) {
        await listener.current?.stop();
        listener.current = null;
        setEnabled(false);
      } else {
        listener.current = new LucyWebWakeListener(model, onWake);
        await listener.current.start();
        setEnabled(true);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Microphone access failed');
      setEnabled(false);
    }
  };

  return (
    <div>
      <button type="button" onClick={toggle} aria-pressed={enabled}>
        {enabled ? 'Disable Hey Lucy' : 'Enable Hey Lucy'}
      </button>
      <span role="status">{enabled ? ' Listening locally' : ' Off'}</span>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
