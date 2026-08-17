import React, { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { AutoAwesome, Bolt, ErrorOutline, Lock, Mail, PlayCircleOutline, Shield } from '@mui/icons-material';
import { Box, Button, Container, Divider, Grid, Paper, Stack, TextField, Typography } from '@mui/material';

const API_BASE = (import.meta.env.VITE_API_URL || 'https://future-jobs-pro-ai-production.up.railway.app').replace(/\/$/, '');

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim().toLowerCase(), password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Login failed');
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      navigate('/dashboard');
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  return <Box sx={{ minHeight: '100vh', bgcolor: '#06101D', color: '#FFF', display: 'grid', alignItems: 'center', py: 5 }}><Container maxWidth="lg"><Grid container spacing={{ xs: 4, md: 8 }} alignItems="center">
    <Grid item xs={12} md={6}>
      <Stack direction="row" spacing={1.5} alignItems="center"><Box sx={{ width: 48, height: 48, borderRadius: 3, bgcolor: '#6FE7FF', color: '#06101D', display: 'grid', placeItems: 'center' }}><Bolt /></Box><Box><Typography variant="h6" fontWeight={950}>Future Jobs Pro AI</Typography><Typography sx={{ color: '#6FE7FF', fontSize: 9, fontWeight: 900, letterSpacing: 1.4 }}>FIELD OPERATIONS, INTELLIGENTLY CONNECTED</Typography></Box></Stack>
      <Typography variant="h2" sx={{ fontWeight: 950, letterSpacing: -2.2, lineHeight: 1.04, mt: 5 }}>Run every job from one clear view.</Typography>
      <Typography sx={{ color: '#9DAFC2', fontSize: 17, lineHeight: 1.75, mt: 2, maxWidth: 540 }}>Time, crews, GPS, evidence, payroll preparation and Lucy AI—built for teams that work beyond a desk.</Typography>
      <Stack spacing={1.2} sx={{ mt: 3 }}>{[[<Shield />,'Secure company workspaces'],[<AutoAwesome />,'Lucy-assisted field operations'],[<PlayCircleOutline />,'Explore the product before signing in']].map(([icon,text]) => <Stack key={String(text)} direction="row" spacing={1.2} alignItems="center" sx={{ color: '#C6D4E3' }}><Box sx={{ color: '#6FE7FF' }}>{icon}</Box><Typography>{text}</Typography></Stack>)}</Stack>
    </Grid>
    <Grid item xs={12} md={6}><Paper sx={{ p: { xs: 3, sm: 4.5 }, bgcolor: '#0E1E32', borderRadius: 5, border: '1px solid #29435F', boxShadow: '0 28px 80px rgba(0,0,0,.35)' }}>
      <Typography variant="h4" fontWeight={950}>Welcome back</Typography><Typography sx={{ color: '#91A3B7', mt: .7, mb: 3 }}>Sign in to your secure company workspace.</Typography>
      {error && <Box sx={{ display: 'flex', gap: 1, p: 1.5, mb: 2, borderRadius: 2, bgcolor: 'rgba(244,67,54,.1)', color: '#FF9A92' }}><ErrorOutline fontSize="small" /><Typography fontSize={13}>{error}</Typography></Box>}
      <Box component="form" onSubmit={handleLogin}>
        <TextField fullWidth label="Work email" type="email" value={email} onChange={e => setEmail(e.target.value)} required InputProps={{ startAdornment: <Mail sx={{ color: '#71869C', mr: 1 }} /> }} sx={{ mb: 2 }} />
        <TextField fullWidth label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} required InputProps={{ startAdornment: <Lock sx={{ color: '#71869C', mr: 1 }} /> }} />
        <Button type="submit" fullWidth variant="contained" disabled={loading} sx={{ bgcolor: '#6FE7FF', color: '#06101D', py: 1.45, mt: 2.5, fontWeight: 950, '&:hover': { bgcolor: '#A1F1FF' } }}>{loading ? 'Opening workspace…' : 'Open workspace'}</Button>
      </Box>
      <Divider sx={{ my: 2.5, color: '#60738A', '&::before, &::after': { borderColor: '#29435F' } }}>OR EXPLORE FIRST</Divider>
      <Button component={RouterLink} to="/demo" fullWidth variant="outlined" startIcon={<PlayCircleOutline />} sx={{ py: 1.35, color: '#DFFBFF', borderColor: 'rgba(111,231,255,.35)', bgcolor: 'rgba(111,231,255,.06)' }}>Open interactive demo</Button>
      <Typography sx={{ color: '#60738A', textAlign: 'center', fontSize: 11, mt: 1 }}>No account required · Read-only sample workspace</Typography>
      <Typography sx={{ color: '#8295AA', textAlign: 'center', fontSize: 13, mt: 2.5 }}>New here? <Box component={RouterLink} to="/register" sx={{ color: '#6FE7FF', textDecoration: 'none', fontWeight: 800 }}>Start a free trial</Box></Typography>
    </Paper></Grid>
  </Grid></Container></Box>;
}
