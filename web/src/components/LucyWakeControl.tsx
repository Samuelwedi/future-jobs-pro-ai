import React, { useEffect, useRef, useState } from 'react';
import { Button, Chip, Stack, Typography } from '@mui/material';
import { Hearing, HearingDisabled } from '@mui/icons-material';
import model from '../lucy-wake/core/lucy-bootstrap-model.json';
import { LucyWebWakeListener } from '../lucy-wake/web/LucyWebWakeListener.mjs';

type WakeStatus = 'off' | 'starting' | 'listening' | 'detected' | 'error';

export function LucyWakeControl({ onWake, suspended = false }: { onWake: () => void; suspended?: boolean }) {
  const [enabled, setEnabled] = useState(
    () => localStorage.getItem('lucyWakeEnabled') === 'true',
  );
  const [status, setStatus] = useState<WakeStatus>('off');
  const [error, setError] = useState('');
  const listenerRef = useRef<LucyWebWakeListener | null>(null);
  const onWakeRef = useRef(onWake);

  onWakeRef.current = onWake;

  useEffect(() => {
    if (!enabled || suspended) {
      setStatus('off');
      setError('');
      void listenerRef.current?.stop();
      listenerRef.current = null;
      return;
    }

    let disposed = false;

    const listener = new LucyWebWakeListener(model, () => {
      if (disposed) return;
      setStatus('detected');
      onWakeRef.current();
    });

    listenerRef.current = listener;
    setStatus('starting');
    setError('');

    void listener.start()
      .then(() => {
        if (!disposed) setStatus('listening');
      })
      .catch(async (cause: unknown) => {
        await listener.stop().catch(() => undefined);
        if (disposed) return;

        const message =
          cause instanceof Error
            ? cause.message
            : 'Lucy could not access the microphone.';

        setError(message);
        setStatus('error');
        setEnabled(false);
        localStorage.setItem('lucyWakeEnabled', 'false');
      });

    return () => {
      disposed = true;
      if (listenerRef.current === listener) listenerRef.current = null;
      void listener.stop();
    };
  }, [enabled, suspended]);

  const toggle = () => {
    const next = !enabled;
    localStorage.setItem('lucyWakeEnabled', String(next));
    setEnabled(next);
  };

  return (
    <Stack spacing={1} alignItems="center">
      <Stack direction="row" spacing={1} alignItems="center">
        <Button
          startIcon={enabled ? <Hearing /> : <HearingDisabled />}
          onClick={toggle}
          disabled={status === 'starting' || suspended}
          variant="outlined"
        >
          {status === 'starting'
            ? 'Starting Hey Lucy'
            : enabled
              ? 'Disable Hey Lucy'
              : 'Enable Hey Lucy'}
        </Button>

        <Chip
          size="small"
          label={status}
          color={
            status === 'listening'
              ? 'success'
              : status === 'error'
                ? 'error'
                : 'default'
          }
        />
      </Stack>

      {error && (
        <Typography role="alert" variant="caption" color="error">
          {error}
        </Typography>
      )}
    </Stack>
  );
}
