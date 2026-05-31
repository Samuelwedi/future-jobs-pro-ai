import React from 'react';
import { Box, Container, Typography, Button, Paper } from '@mui/material';
import { Lock } from '@mui/icons-material';

const API_BASE = 'https://future-jobs-pro-ai-production.up.railway.app';

export default function PaymentRequired() {
  const handleAddPayment = async () => {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_BASE}/api/stripe/create-setup-session`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else alert('Failed to start payment setup');
  };

  return (
    <Box sx={{ bgcolor: '#0A0A0A', minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
      <Container maxWidth="sm">
        <Paper sx={{ p: 6, bgcolor: '#1A1A1A', borderRadius: 4, border: '1px solid #333', textAlign: 'center' }}>
          <Lock sx={{ fontSize: 80, color: '#F44336', mb: 3 }} />
          <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold', mb: 2 }}>
            Payment Required
          </Typography>
          <Typography variant="body1" sx={{ color: '#AAA', mb: 4 }}>
            Your 14‑day free trial has ended. Add a payment method to continue using Future Jobs Pro AI.
          </Typography>
          <Button variant="contained" size="large" onClick={handleAddPayment}
            sx={{ bgcolor: '#F44336', color: '#FFF', px: 6, py: 1.5 }}>
            Add Payment Method
          </Button>
        </Paper>
      </Container>
    </Box>
  );
}