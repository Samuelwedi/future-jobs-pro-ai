import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Container, Typography, Button, Grid, Card, CardContent, Chip, Divider,
} from '@mui/material';
import { Check } from '@mui/icons-material';

const API_BASE = 'https://future-jobs-pro-ai-production.up.railway.app';

const plans = [
  { id: 'price_basic_monthly', name: 'Basic', price: 49, interval: 'month', features: ['Up to 5 employees', 'Time tracking', 'GPS location', 'Basic reports'] },
  { id: 'price_pro_monthly', name: 'Professional', price: 99, interval: 'month', features: ['Up to 20 employees', 'AI photo compliance', 'Voice notes', 'Advanced reports'], popular: true },
  { id: 'price_enterprise_monthly', name: 'Enterprise', price: 199, interval: 'month', features: ['Unlimited employees', 'Dispute evidence reports', 'Priority support', 'Custom integrations'] },
];

export default function Pricing() {
  const [loading, setLoading] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubscribe = async (priceId: string) => {
    setLoading(priceId);
    try {
      const token = localStorage.getItem('token');
      if (!token) { navigate('/register'); return; }
      const res = await fetch(`${API_BASE}/api/stripe/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ priceId, successUrl: window.location.origin + '/dashboard', cancelUrl: window.location.origin + '/pricing' }),
      });
      const data = await res.json();
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
      else alert(data.message || 'Failed to start checkout');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(null);
    }
  };

  return (
    <Box sx={{ bgcolor: '#0A0A0A', minHeight: '100vh', py: 8 }}>
      <Container maxWidth="lg">
        <Typography variant="h3" align="center" sx={{ color: '#FFF', fontWeight: 'bold', mb: 2 }}>Choose Your Plan</Typography>
        <Typography variant="h6" align="center" sx={{ color: '#888', mb: 6 }}>14‑day free trial on all plans. No credit card required.</Typography>
        <Grid container spacing={4} justifyContent="center">
          {plans.map((plan) => (
            <Grid item xs={12} md={4} key={plan.id}>
              <Card sx={{ bgcolor: '#1A1A1A', borderRadius: 4, border: plan.popular ? '2px solid #00D4FF' : '1px solid #333', position: 'relative' }}>
                {plan.popular && <Chip label="Most Popular" sx={{ position: 'absolute', top: -12, right: 20, bgcolor: '#00D4FF', color: '#0A0A0A', fontWeight: 'bold' }} />}
                <CardContent sx={{ p: 4 }}>
                  <Typography variant="h5" sx={{ color: '#FFF', fontWeight: 'bold', mb: 2 }}>{plan.name}</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'baseline', mb: 3 }}>
                    <Typography variant="h3" sx={{ color: '#FFF', fontWeight: 'bold' }}>${plan.price}</Typography>
                    <Typography variant="body2" sx={{ color: '#888', ml: 1 }}>/{plan.interval}</Typography>
                  </Box>
                  <Divider sx={{ my: 2, bgcolor: '#333' }} />
                  <Box sx={{ mb: 3 }}>
                    {plan.features.map((feat, i) => (
                      <Box key={i} sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <Check sx={{ color: '#4CAF50', mr: 1, fontSize: 18 }} />
                        <Typography variant="body2" sx={{ color: '#CCC' }}>{feat}</Typography>
                      </Box>
                    ))}
                  </Box>
                  <Button fullWidth variant={plan.popular ? 'contained' : 'outlined'}
                    onClick={() => handleSubscribe(plan.id)} disabled={loading === plan.id}
                    sx={{ bgcolor: plan.popular ? '#00D4FF' : 'transparent', color: plan.popular ? '#0A0A0A' : '#00D4FF', borderColor: '#00D4FF', py: 1.5 }}>
                    {loading === plan.id ? 'Processing...' : 'Start Free Trial'}
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
        <Box sx={{ mt: 6, textAlign: 'center' }}>
          <Typography variant="body2" sx={{ color: '#888' }}>
            Need a custom plan? Contact sales: <a href="mailto:sales@futurejobsproai.com" style={{ color: '#00D4FF' }}>sales@futurejobsproai.com</a>
          </Typography>
        </Box>
      </Container>
    </Box>
  );
}