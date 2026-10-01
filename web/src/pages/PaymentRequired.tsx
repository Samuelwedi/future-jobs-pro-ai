import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Container, Paper, Stack, Typography } from '@mui/material';
import { Lock } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import BillingPermissions, {useBillingAccess} from '../components/BillingPermissions';
import { API_BASE } from '../services/api';

export default function PaymentRequired() {
  const navigate = useNavigate();
  const {access,error:accessError}=useBillingAccess();
  useEffect(()=>{if(access?.entitled)navigate('/',{replace:true});},[access,navigate]);
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
          <Typography variant="h4" fontWeight={800} sx={{ mt: 2 }}>{access?.canManageBilling ? 'Company subscription action required' : 'Company access'} </Typography>
          <Typography sx={{ color: 'text.secondary', my: 2 }}>
            {!access ? 'Checking your company access...' : access.canManageBilling ? 'Manage the subscription for your entire company.' : 'Your company manages this subscription. You do not need to buy an individual plan. Contact your boss to restore company access.'}
          </Typography>
          {accessError && <Alert severity="error">{accessError}</Alert>}
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {access?.canManageBilling && !access.complimentary && <Stack spacing={2}>
            <Button variant="contained" size="large" onClick={() => navigate('/pricing')}>View plans</Button>
            <Button variant="outlined" disabled={working} onClick={manageBilling}>{working ? 'Opening…' : 'Manage existing billing'}</Button>
          </Stack>}
          <BillingPermissions />
          <Button onClick={()=>{localStorage.removeItem('token');navigate('/login');}}>Sign in with another account</Button>
        </Paper>
      </Container>
    </Box>
  );
}
