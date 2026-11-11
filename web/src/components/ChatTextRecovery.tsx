import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Box } from '@mui/material';
import { captureAuthSession, getAuthRevision } from '../services/authSession';
import { chatOwnerKey, readChatOwner } from '../services/chatSession';
import { createOwnerTextRecovery } from '../services/chatTextQueue';
import { type TextRows } from '../services/chatTextOutbox';

// One app-shell foreground runner, not one per open conversation. Leaving room A
// for the inbox/room B does not retract its already persisted Send intent.
export default function ChatTextRecovery() {
  const [rows, setRows] = useState<TextRows>({ records: [], invalid: 0 });
  const [error, setError] = useState('');
  useEffect(() => {
    let runner: ReturnType<typeof createOwnerTextRecovery> | null = null;
    let identity = '';
    let epoch = 0;
    let pageActive = true;
    const visible = () => pageActive && document.visibilityState !== 'hidden' && document.hasFocus();
    const stop = () => { epoch++; runner?.dispose(); runner = null; identity = ''; };
    const update = () => {
      const owner = readChatOwner();
      const nextIdentity = JSON.stringify([chatOwnerKey(owner), getAuthRevision()]);
      if (!owner || !visible()) { stop(); if (!owner) { setRows({ records: [], invalid: 0 }); setError(''); } return; }
      if (identity !== nextIdentity || !runner) {
        stop(); identity = nextIdentity;
        const capturedEpoch = epoch;
        const auth = captureAuthSession();
        const current = () => visible() && epoch === capturedEpoch && auth.isCurrent() && chatOwnerKey(readChatOwner()) === chatOwnerKey(owner);
        setRows({ records: [], invalid: 0 }); setError('');
        runner = createOwnerTextRecovery({ owner, current,
          onRows: next => { setRows(next); window.dispatchEvent(new Event('chat-text-updated')); },
          onSaved: (receipt, localCommitted) => window.dispatchEvent(new CustomEvent('chat-text-saved', { detail: { receipt, localCommitted } })),
          onError: setError,
        });
      }
      void runner.tick();
    };
    const hide = () => { pageActive = false; stop(); };
    const show = () => { pageActive = true; stop(); update(); };
    const visibility = () => { if (document.visibilityState === 'hidden') stop(); else update(); };
    const events = ['auth-session-changed', 'auth-user-updated', 'focus', 'online', 'chat-text-enqueued'];
    events.forEach(event => window.addEventListener(event, update));
    window.addEventListener('blur', stop);
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', show);
    document.addEventListener('visibilitychange', visibility);
    const timer = window.setInterval(update, 3000);
    update();
    return () => {
      stop(); window.clearInterval(timer);
      events.forEach(event => window.removeEventListener(event, update));
      window.removeEventListener('blur', stop); window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', show);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  const pending = rows.records.filter(row => row.state !== 'saved');
  if (!pending.length && !rows.invalid && !error) return null;
  const rooms = [...new Set(pending.map(row => row.roomId))];
  return <Box sx={{ position: 'relative', zIndex: 1300 }}><Alert severity={error || rows.invalid || pending.some(row => row.state === 'needs-review') ? 'warning' : 'info'}>
    {error || `${pending.length} message${pending.length === 1 ? '' : 's'} kept on this browser, awaiting save confirmation.`}
    {' '}Recovery runs while this page is active. {rows.invalid > 0 && 'Some local records need review and were left untouched.'}
    {rooms.slice(0, 5).map((room, index) => <Link key={room} to={`/chat/${encodeURIComponent(room)}`} style={{ marginLeft: 12 }}>Review conversation {index + 1}</Link>)}
  </Alert></Box>;
}
