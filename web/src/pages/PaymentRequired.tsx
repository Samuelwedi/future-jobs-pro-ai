import React, { useState } from 'react';
import { Alert, Box, Button, Container, Paper, Stack, Typography } from '@mui/material';
import { Lock } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../services/api';

export default function PaymentRequired() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  const manageBilling = async () => {
    setWorking(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/api/stripe/billing-portal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: '{}',
      });
      const body = await response.json();
      if (!response.ok || !body.url) throw new Error(body.message || 'Billing portal is unavailable');
      window.location.assign(body.url);
    } catch (reason: any) {
      setError(reason.message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: '#080b12' }}>
      <Container maxWidth="sm">
        <Paper sx={{ p: 5, textAlign: 'center', borderRadius: 4 }}>
          <Lock sx={{ fontSize: 64, color: 'warning.main' }} />
          <Typography variant="h4" fontWeight={800} sx={{ mt: 2 }}>Subscription action required</Typography>
          <Typography sx={{ color: 'text.secondary', my: 2 }}>
            Choose a plan to restore access, or open the secure Stripe portal if your company already has a subscription.
          </Typography>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Stack spacing={2}>
            <Button variant="contained" size="large" onClick={() => navigate('/pricing')}>View plans</Button>
            <Button variant="outlined" disabled={working} onClick={manageBilling}>{working ? 'Opening…' : 'Manage existing billing'}</Button>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}
