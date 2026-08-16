import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress,
  Container, Divider, Grid, Typography,
} from '@mui/material';
import { Check } from '@mui/icons-material';
import { API_BASE } from '../services/api';

interface Plan {
  key: string;
  name: string;
  amount: number;
  currency: string;
  interval: string;
  features: string[];
  trialDays: number;
}

export default function Pricing() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_BASE}/api/stripe/plans`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || 'Plans are unavailable');
        setPlans(body.plans || []);
      })
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  const beginCheckout = async (plan: Plan) => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/register');
      return;
    }
    setWorking(plan.key);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/api/stripe/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan: plan.key }),
      });
      const body = await response.json();
      if (!response.ok || !body.checkoutUrl) throw new Error(body.message || 'Checkout could not start');
      window.location.assign(body.checkoutUrl);
    } catch (reason: any) {
      setError(reason.message || 'Checkout could not start');
      setWorking(null);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', py: 8, bgcolor: '#080b12', color: '#fff' }}>
      <Container maxWidth="lg">
        <Chip label="Secure Stripe billing" sx={{ bgcolor: 'rgba(0,212,255,.14)', color: '#7ee8ff', mb: 2 }} />
        <Typography variant="h3" fontWeight={800}>Plans built for field operations</Typography>
        <Typography sx={{ color: '#b7c1d6', mt: 1, mb: 5 }}>
          One company subscription covers your web workspace. Owners can manage invoices,
          payment methods, upgrades, and cancellation from the secure billing portal.
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
        {loading ? <CircularProgress /> : (
          <Grid container spacing={3}>
            {plans.map((plan) => {
              const popular = plan.key === 'professional';
              return (
                <Grid item xs={12} md={4} key={plan.key}>
                  <Card sx={{ height: '100%', bgcolor: '#121827', color: '#fff', border: popular ? '2px solid #00d4ff' : '1px solid #2a3448', borderRadius: 4 }}>
                    <CardContent sx={{ p: 4 }}>
                      {popular && <Chip label="Most popular" size="small" sx={{ bgcolor: '#00d4ff', fontWeight: 800, mb: 2 }} />}
                      <Typography variant="h5" fontWeight={800}>{plan.name}</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'baseline', my: 2 }}>
                        <Typography variant="h3" fontWeight={800}>
                          {new Intl.NumberFormat(undefined, { style: 'currency', currency: plan.currency.toUpperCase(), maximumFractionDigits: 0 }).format(plan.amount / 100)}
                        </Typography>
                        <Typography sx={{ color: '#a8b4ca', ml: 1 }}>/{plan.interval}</Typography>
                      </Box>
                      <Typography sx={{ color: '#7ee8ff' }}>{plan.trialDays > 0 ? `${plan.trialDays}-day trial for eligible companies` : 'Subscription starts today'}</Typography>
                      <Divider sx={{ my: 3, borderColor: '#2a3448' }} />
                      {plan.features.map((feature) => (
                        <Box key={feature} sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
                          <Check sx={{ color: '#51d88a' }} />
                          <Typography sx={{ color: '#dce5f5' }}>{feature}</Typography>
                        </Box>
                      ))}
                      <Button fullWidth variant="contained" disabled={Boolean(working)} onClick={() => beginCheckout(plan)}
                        sx={{ mt: 3, py: 1.4, bgcolor: popular ? '#00d4ff' : '#365cff', color: '#06101a', fontWeight: 800 }}>
                        {working === plan.key ? 'Opening secure checkout…' : 'Choose plan'}
                      </Button>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        )}
        <Typography sx={{ color: '#8996ad', textAlign: 'center', mt: 5 }}>
          Prices are loaded directly from Stripe. Taxes may be added based on the billing address.
        </Typography>
      </Container>
    </Box>
  );
}
