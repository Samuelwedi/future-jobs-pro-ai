import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Container, Paper, Stack, Typography } from '@mui/material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { API_BASE } from '../services/api';

interface SubscriptionState {
  plan: string;
  status: string;
  provider: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasStripeSubscription: boolean;
}

export default function Subscription() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const token = localStorage.getItem('token') || '';

  const loadStatus = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/stripe/status`, {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Could not load billing status');
      setSubscription(body.subscription);
    } catch (reason: any) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStatus(); }, []);

  const post = async (path: string) => {
    setWorking(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: '{}',
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Billing request failed');
      if (body.url) window.location.assign(body.url);
      else await loadStatus();
    } catch (reason: any) {
      setError(reason.message);
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}><CircularProgress /></Box>;

  const date = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : 'Not available';

  return (
    <Container maxWidth="md" sx={{ py: 5 }}>
      <Typography variant="h4" fontWeight={800}>Company subscription</Typography>
      <Typography sx={{ color: 'text.secondary', mt: 1, mb: 3 }}>Secure billing for your Future Jobs Pro AI workspace.</Typography>
      {params.get('checkout') === 'success' && <Alert severity="success" sx={{ mb: 3 }}>Checkout completed. Stripe is confirming your subscription; refresh if the status has not updated yet.</Alert>}
      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
      <Paper sx={{ p: 4, borderRadius: 4 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}>
          <Box>
            <Typography variant="overline">Current plan</Typography>
            <Typography variant="h4" sx={{ textTransform: 'capitalize' }}>{subscription?.plan || 'No plan'}</Typography>
          </Box>
          <Chip label={subscription?.status || 'inactive'} color={['active', 'trialing'].includes(subscription?.status || '') ? 'success' : 'warning'} />
        </Stack>
        <Stack spacing={1} sx={{ my: 3 }}>
          <Typography>Provider: {subscription?.provider || 'Not connected'}</Typography>
          <Typography>{subscription?.cancelAtPeriodEnd ? 'Access ends' : 'Current period ends'}: {date}</Typography>
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          {!subscription?.hasStripeSubscription && <Button variant="contained" onClick={() => navigate('/pricing')}>Choose a plan</Button>}
          {subscription?.hasStripeSubscription && <Button variant="contained" disabled={working} onClick={() => post('/api/stripe/billing-portal')}>Manage billing</Button>}
          {subscription?.hasStripeSubscription && !subscription.cancelAtPeriodEnd && <Button color="warning" disabled={working} onClick={() => post('/api/stripe/cancel-subscription')}>Cancel at period end</Button>}
          {subscription?.cancelAtPeriodEnd && <Button color="success" disabled={working} onClick={() => post('/api/stripe/resume-subscription')}>Keep subscription</Button>}
        </Stack>
      </Paper>
    </Container>
  );
}
