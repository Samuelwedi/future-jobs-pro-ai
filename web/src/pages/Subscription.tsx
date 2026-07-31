import React, { useState, useEffect } from 'react';
import {
  Box, Container, Typography, Paper, Grid, Card, CardContent,
  Button, Chip, CircularProgress, Alert,
} from '@mui/material';
import { Check, Close } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

const API_BASE = 'https://future-jobs-pro-ai-production.up.railway.app';

interface Plan {
  id: string;
  name: string;
  price: number;
  interval: 'month' | 'year';
  features: string[];
}

export default function Subscription() {
  const navigate = useNavigate();
  const token = localStorage.getItem('token') || '';
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/stripe/plans`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setPlans(data.plans || []);
      } else {
        setError('Could not load plans');
      }
    } catch (e) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (priceId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/stripe/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        alert('Failed to start checkout');
      }
    } catch (e) {
      alert('Error starting checkout');
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh' }}>
        <CircularProgress sx={{ color: '#00D4FF' }} />
      </Box>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold', textAlign: 'center', mb: 2 }}>
        Choose Your Plan
      </Typography>
      <Typography variant="body1" sx={{ color: '#888', textAlign: 'center', mb: 4 }}>
        Start with a free trial, then pick the plan that fits your business.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <Grid container spacing={4} justifyContent="center">
        {plans.map((plan) => (
          <Grid item xs={12} sm={6} md={4} key={plan.id}>
            <Card sx={{
              bgcolor: '#1A1A1A',
              border: '1px solid #333',
              borderRadius: 2,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              transition: '0.2s',
              '&:hover': { borderColor: '#00D4FF', transform: 'translateY(-4px)' },
            }}>
              <CardContent sx={{ flexGrow: 1, textAlign: 'center' }}>
                <Typography variant="h5" sx={{ color: '#FFF', fontWeight: 'bold' }}>
                  {plan.name}
                </Typography>
                <Typography variant="h3" sx={{ color: '#00D4FF', fontWeight: 'bold', my: 2 }}>
                  ${plan.price}
                  <Typography variant="caption" sx={{ color: '#888', fontSize: 14 }}>
                    /{plan.interval}
                  </Typography>
                </Typography>
                <Box sx={{ my: 2 }}>
                  {plan.features.map((feature, i) => (
                    <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, color: '#CCC' }}>
                      <Check sx={{ color: '#4CAF50', fontSize: 18 }} />
                      <Typography variant="body2">{feature}</Typography>
                    </Box>
                  ))}
                </Box>
                <Button
                  variant="contained"
                  fullWidth
                  onClick={() => handleSubscribe(plan.id)}
                  sx={{ bgcolor: '#00D4FF', color: '#0A0A0A', mt: 2 }}
                >
                  Subscribe
                </Button>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Box sx={{ textAlign: 'center', mt: 4 }}>
        <Typography variant="body2" sx={{ color: '#888' }}>
          All plans include a 30‑day free trial. No commitment, cancel anytime.
        </Typography>
        <Button
          variant="text"
          sx={{ color: '#00D4FF', mt: 2 }}
          onClick={() => navigate('/dashboard')}
        >
          Continue with Free Trial
        </Button>
      </Box>
    </Container>
  );
}