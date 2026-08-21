import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Chip, Stack } from '@mui/material';
import { Hearing, HearingDisabled } from '@mui/icons-material';
import { LucyWakeClient, LucyWakeStatus } from '../services/lucyWakeClient';

export function LucyWakeControl({ onWake }: { onWake: () => void }) {
  const [enabled, setEnabled] = useState(() => localStorage.getItem('lucyWakeEnabled') === 'true');
  const [status, setStatus] = useState<LucyWakeStatus>('off');
  const onWakeRef = useRef(onWake);
  onWakeRef.current = onWake;
  const client = useMemo(() => new LucyWakeClient({
    url: ((import.meta.env as any).VITE_LUCY_WAKE_URL as string | undefined) || '',
    token: () => localStorage.getItem('token'),
    onWake: () => onWakeRef.current(),
    onStatus: setStatus,
  }), []);

  useEffect(() => {
    if (enabled && document.visibilityState === 'visible') client.start().catch(() => setStatus('error'));
    else client.stop();
    const visibility = () => document.visibilityState === 'visible' && enabled ? client.start() : client.stop();
    document.addEventListener('visibilitychange', visibility);
    return () => { document.removeEventListener('visibilitychange', visibility); client.stop(); };
  }, [client, enabled]);

  const toggle = () => setEnabled(value => {
    localStorage.setItem('lucyWakeEnabled', String(!value));
    return !value;
  });

  return <Stack direction="row" spacing={1} alignItems="center">
    <Button startIcon={enabled ? <Hearing /> : <HearingDisabled />} onClick={toggle} variant="outlined">
      {enabled ? 'Disable Hey Lucy' : 'Enable Hey Lucy'}
    </Button>
    <Chip size="small" label={status} color={status === 'listening' ? 'success' : status === 'error' ? 'error' : 'default'} />
  </Stack>;
}
