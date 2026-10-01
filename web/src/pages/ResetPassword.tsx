import React, { useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircleOutline, LockReset, Visibility, VisibilityOff } from '@mui/icons-material';
import { Alert, Box, Button, Container, IconButton, InputAdornment, Link, Paper, TextField, Typography } from '@mui/material';
import { API_BASE } from '../services/api';

export default function ResetPassword() {
  const [params] = useSearchParams(); const navigate = useNavigate();
  const token = useMemo(() => params.get('token') || '', [params]);
  const [password, setPassword] = useState(''); const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false); const [showConfirmPassword, setShowConfirmPassword] = useState(false); const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [done, setDone] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    if (!token) return setError('This reset link is incomplete. Request a new link.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirmPassword) return setError('Passwords do not match.');
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/auth/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, newPassword: password }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.message || 'Unable to reset password');
      setDone(true); setTimeout(() => navigate('/login'), 1800);
    } catch (cause: any) { setError(cause.message || 'Unable to reset password'); }
    finally { setLoading(false); }
  };

  return <Box sx={{ minHeight: '100vh', bgcolor: '#06101D', display: 'grid', placeItems: 'center', py: 4 }}><Container maxWidth="xs"><Paper sx={{ p: 4, bgcolor: '#0E1E32', border: '1px solid #29435F', borderRadius: 4 }}>
    <Box sx={{ width: 52, height: 52, borderRadius: 3, bgcolor: 'rgba(111,231,255,.12)', color: '#6FE7FF', display: 'grid', placeItems: 'center', mb: 2 }}>{done ? <CheckCircleOutline /> : <LockReset />}</Box>
    <Typography variant="h4" color="white" fontWeight={950}>{done ? 'Password updated' : 'Choose a new password'}</Typography>
    <Typography sx={{ color: '#91A3B7', mt: 1, mb: 3 }}>{done ? 'Your password is secure. Redirecting you to sign in...' : 'Use at least eight characters and keep it unique to Future Jobs Pro AI.'}</Typography>
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {!done && <Box component="form" onSubmit={submit}><TextField fullWidth label="New password" type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} required InputProps={{ endAdornment: <InputAdornment position="end"><IconButton aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <VisibilityOff /> : <Visibility />}</IconButton></InputAdornment> }} sx={{ mb: 2 }} /><TextField fullWidth label="Confirm new password" type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required InputProps={{ endAdornment: <InputAdornment position="end"><IconButton aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'} onClick={() => setShowConfirmPassword(value => !value)}>{showConfirmPassword ? <VisibilityOff /> : <Visibility />}</IconButton></InputAdornment> }} /><Button type="submit" fullWidth variant="contained" disabled={loading || !token} sx={{ mt: 2, py: 1.4, bgcolor: '#6FE7FF', color: '#06101D', fontWeight: 900 }}>{loading ? 'Updating...' : 'Update password'}</Button></Box>}
    {!token && <Alert severity="warning" sx={{ mt: 2 }}>No reset token was found in this link.</Alert>}
    <Link component={RouterLink} to="/forgot-password" sx={{ mt: 2.5, color: '#9FDFF0', display: 'inline-block', textDecoration: 'none' }}>Request a new reset link</Link>
  </Paper></Container></Box>;
}
