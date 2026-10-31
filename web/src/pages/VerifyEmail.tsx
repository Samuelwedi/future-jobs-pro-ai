import React, { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Box, Button, Container, Paper, Typography } from '@mui/material';
import { API_BASE } from '../services/api';

export default function VerifyEmail() {
  const [token] = useState(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
    return value;
  });
  useEffect(() => { window.history.replaceState(null, '', window.location.pathname); }, []);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const verify = async () => {
    setBusy(true); setError('');
    try {
      const response = await fetch(`${API_BASE}/api/auth/verify-email`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({token}) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Email could not be verified.');
      setDone(true);
    } catch (cause: any) { setError(cause.message || 'Email could not be verified.'); }
    finally { setBusy(false); }
  };
  return <Box sx={{minHeight:'100vh',bgcolor:'#06101D',display:'grid',placeItems:'center'}}><Container maxWidth="sm"><Paper sx={{p:4}}>
    <Typography variant="h4">{done ? 'Email verified' : 'Verify your email'}</Typography>
    <Typography sx={{my:2}}>{done ? 'Your email address is confirmed. You can return to the app.' : 'Confirm that this is your email address. This link expires in one hour.'}</Typography>
    {error && <Alert severity="error">{error}</Alert>}
    {!token && !done && <Alert severity="warning">The verification link is incomplete. Request a new email from Settings in the app.</Alert>}
    {!done && <Button variant="contained" disabled={!token || busy} onClick={verify}>{busy ? 'Verifying…' : 'Verify email'}</Button>}
    <Button component={RouterLink} to="/settings">Return to Settings</Button>
  </Paper></Container></Box>;
}
