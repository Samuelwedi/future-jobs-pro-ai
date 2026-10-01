import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { ArrowBack, MailOutline } from '@mui/icons-material';
import { Alert, Box, Button, Container, Link, Paper, TextField, Typography } from '@mui/material';
import { API_BASE } from '../services/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setError(''); setMessage('');
    try {
      const response = await fetch(`${API_BASE}/api/auth/forgot-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim().toLowerCase() }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.message || 'Unable to request a reset link');
      setMessage(data.message || 'If that email exists, a reset link has been sent.');
    } catch (cause: any) { setError(cause.message || 'Unable to request a reset link'); }
    finally { setLoading(false); }
  };

  return <Box sx={{ minHeight: '100vh', bgcolor: '#06101D', display: 'grid', placeItems: 'center', py: 4 }}><Container maxWidth="xs"><Paper sx={{ p: 4, bgcolor: '#0E1E32', border: '1px solid #29435F', borderRadius: 4 }}>
    <Box sx={{ width: 52, height: 52, borderRadius: 3, bgcolor: 'rgba(111,231,255,.12)', color: '#6FE7FF', display: 'grid', placeItems: 'center', mb: 2 }}><MailOutline /></Box>
    <Typography variant="h4" color="white" fontWeight={950}>Reset your password</Typography>
    <Typography sx={{ color: '#91A3B7', mt: 1, mb: 3 }}>Enter your work email and we’ll send a secure link that expires in one hour.</Typography>
    {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}{error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    <Box component="form" onSubmit={submit}><TextField fullWidth type="email" label="Work email" value={email} onChange={event => setEmail(event.target.value)} required /><Button type="submit" fullWidth variant="contained" disabled={loading} sx={{ mt: 2, py: 1.4, bgcolor: '#6FE7FF', color: '#06101D', fontWeight: 900 }}>{loading ? 'Sending…' : 'Send reset link'}</Button></Box>
    <Link component={RouterLink} to="/login" sx={{ mt: 2.5, color: '#9FDFF0', display: 'inline-flex', alignItems: 'center', gap: .7, textDecoration: 'none' }}><ArrowBack fontSize="small" />Back to sign in</Link>
  </Paper></Container></Box>;
}
