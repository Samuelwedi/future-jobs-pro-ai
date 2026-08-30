import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Container, Paper, Stack, Typography } from '@mui/material';
import { Backspace, Login, Logout, Pin } from '@mui/icons-material';
import { useSearchParams } from 'react-router-dom';
import { API_BASE } from '../services/api';

type Project = { id: string; name: string };
type Setup = { company: { name: string; kiosk_enabled: boolean }; projects: Project[] };

export default function KioskClock() {
  const [params] = useSearchParams();
  const companyId = params.get('companyId') || '';
  const [setup, setSetup] = useState<Setup | null>(null);
  const [projectId, setProjectId] = useState('');
  const [pin, setPin] = useState('');
  const [mode, setMode] = useState<'clock-in' | 'clock-out'>('clock-in');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const dots = useMemo(() => Array.from({ length: 6 }, (_, index) => index < pin.length), [pin]);

  useEffect(() => {
    if (!companyId) { setError('This kiosk link is incomplete.'); setLoading(false); return; }
    fetch(`${API_BASE}/api/kiosk-public/setup/${encodeURIComponent(companyId)}`)
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || 'Kiosk was not found');
        setSetup(body);
        setProjectId(body.projects?.[0]?.id || '');
      })
      .catch(cause => setError(cause.message))
      .finally(() => setLoading(false));
  }, [companyId]);

  const location = () => new Promise<{ latitude?: number; longitude?: number }>(resolve => {
    if (!navigator.geolocation) return resolve({});
    navigator.geolocation.getCurrentPosition(
      position => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => resolve({}),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 },
    );
  });

  const submit = async () => {
    if (pin.length < 4) return setError('Enter your 4 to 6 digit PIN.');
    if (mode === 'clock-in' && !projectId) return setError('Select a project before clocking in.');
    setWorking(true); setError(''); setMessage('');
    try {
      const coordinates = await location();
      const response = await fetch(`${API_BASE}/api/kiosk-public/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, projectId, pin, ...coordinates }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Kiosk action failed');
      setMessage(body.message);
      setPin('');
    } catch (cause: any) {
      setError(cause.message || 'Kiosk action failed');
      setPin('');
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <Box sx={{ minHeight: '100vh', bgcolor: '#07111F', display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#07111F', py: { xs: 2, md: 5 } }}>
      <Container maxWidth="sm">
        <Paper sx={{ bgcolor: '#101E2D', border: '1px solid #294157', borderRadius: 5, p: { xs: 2, md: 4 }, textAlign: 'center' }}>
          <Box sx={{ width: 64, height: 64, borderRadius: 3, bgcolor: '#164E63', display: 'grid', placeItems: 'center', mx: 'auto', mb: 2 }}><Pin sx={{ color: '#67E8F9', fontSize: 34 }} /></Box>
          <Typography variant="h4" color="white" fontWeight={900}>{setup?.company?.name || 'Future Jobs Kiosk'}</Typography>
          <Typography color="#8FA0B5" mt={1}>Secure crew clock</Typography>

          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
          {message && <Alert severity="success" sx={{ mt: 2 }}>{message}</Alert>}
          {setup && !setup.company.kiosk_enabled && <Alert severity="warning" sx={{ mt: 2 }}>This company’s kiosk is currently disabled.</Alert>}

          {setup?.company.kiosk_enabled && <>
            <Stack direction="row" spacing={1.5} mt={3}>
              <Button fullWidth variant={mode === 'clock-in' ? 'contained' : 'outlined'} color="success" startIcon={<Login />} onClick={() => { setMode('clock-in'); setMessage(''); }}>Clock in</Button>
              <Button fullWidth variant={mode === 'clock-out' ? 'contained' : 'outlined'} color="error" startIcon={<Logout />} onClick={() => { setMode('clock-out'); setMessage(''); }}>Clock out</Button>
            </Stack>

            {mode === 'clock-in' && <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', py: 2.5 }}>
              {setup.projects.map(project => <Chip key={project.id} label={project.name} clickable onClick={() => setProjectId(project.id)} sx={{ flexShrink: 0, color: '#E2E8F0', bgcolor: projectId === project.id ? '#155E75' : '#17283A', border: projectId === project.id ? '1px solid #22D3EE' : '1px solid #334B61' }} />)}
            </Box>}

            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1.5, my: 2.5 }}>{dots.map((filled, index) => <Box key={index} sx={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid', borderColor: filled ? '#22D3EE' : '#64748B', bgcolor: filled ? '#22D3EE' : 'transparent' }} />)}</Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.2, maxWidth: 330, mx: 'auto' }}>
              {['1','2','3','4','5','6','7','8','9'].map(digit => <Button key={digit} onClick={() => pin.length < 6 && setPin(value => value + digit)} sx={{ minHeight: 62, bgcolor: '#17283A', color: '#FFF', fontSize: 22, fontWeight: 800 }}>{digit}</Button>)}
              <Button onClick={() => setPin(value => value.slice(0, -1))} sx={{ minHeight: 62, bgcolor: '#17283A', color: '#FFF' }}><Backspace /></Button>
              <Button onClick={() => pin.length < 6 && setPin(value => value + '0')} sx={{ minHeight: 62, bgcolor: '#17283A', color: '#FFF', fontSize: 22, fontWeight: 800 }}>0</Button>
              <Button disabled={working} onClick={submit} sx={{ minHeight: 62, bgcolor: '#22D3EE', color: '#06131B', '&:hover': { bgcolor: '#67E8F9' } }}>{working ? <CircularProgress size={24} /> : mode === 'clock-in' ? <Login /> : <Logout />}</Button>
            </Box>
          </>}
        </Paper>
      </Container>
    </Box>
  );
}
