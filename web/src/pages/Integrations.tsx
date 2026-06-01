import React, { useState, useEffect } from 'react';
import {
  Box, Container, Typography, Paper, Grid, Card, CardContent,
  Button, Chip, CircularProgress, Alert,
} from '@mui/material';
import { AccountBalance, Receipt, CheckCircle, Link as LinkIcon } from '@mui/icons-material';

const API_BASE = 'https://future-jobs-pro-ai-production.up.railway.app';

export default function Integrations() {
  const [user, setUser] = useState<any>(null);
  const [loadingQB, setLoadingQB] = useState(false);
  const [loadingStripe, setLoadingStripe] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const stored = localStorage.getItem('user');
      if (stored) setUser(JSON.parse(stored));
    } catch {}
    fetchIntegrationStatus();
  }, []);

  const fetchIntegrationStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/integrations/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {}
  };

  const handleConnectQuickBooks = async () => {
    setLoadingQB(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/integrations/quickbooks/auth?companyId=${user?.companyId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.redirected) {
        window.location.href = res.url;
      } else {
        setError('Failed to start QuickBooks connection');
      }
    } catch {
      setError('Failed to start QuickBooks connection');
    } finally {
      setLoadingQB(false);
    }
  };

  const handleConnectStripe = async () => {
    setLoadingStripe(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/integrations/stripe/auth?companyId=${user?.companyId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.redirected) {
        window.location.href = res.url;
      } else {
        setError('Failed to start Stripe Connect');
      }
    } catch {
      setError('Failed to start Stripe Connect');
    } finally {
      setLoadingStripe(false);
    }
  };

  const qbConnected = status?.quickbooks?.connected;
  const stripeConnected = status?.stripe?.connected;

  return (
    <Box sx={{ bgcolor: '#0A0A0A', minHeight: '100vh', py: 4 }}>
      <Container maxWidth="md">
        <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold', mb: 1 }}>
          🔗 Integrations
        </Typography>
        <Typography variant="body1" sx={{ color: '#888', mb: 4 }}>
          Connect your accounting and payment platforms for automatic sync.
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

        <Grid container spacing={4}>
          {/* QuickBooks Card */}
          <Grid item xs={12} md={6}>
            <Card sx={{ bgcolor: '#1A1A1A', borderRadius: 3, border: '1px solid #333', height: '100%' }}>
              <CardContent sx={{ p: 4, textAlign: 'center' }}>
                <Receipt sx={{ fontSize: 60, color: '#2CA01C', mb: 2 }} />
                <Typography variant="h5" sx={{ color: '#FFF', fontWeight: 'bold', mb: 2 }}>
                  QuickBooks
                </Typography>
                <Typography variant="body2" sx={{ color: '#AAA', mb: 3 }}>
                  Automatically sync invoices, payments, and expenses with your QuickBooks account.
                </Typography>
                {qbConnected ? (
                  <Chip icon={<CheckCircle />} label="Connected" color="success" sx={{ bgcolor: '#4CAF5020', color: '#4CAF50' }} />
                ) : (
                  <Button
                    variant="contained"
                    onClick={handleConnectQuickBooks}
                    disabled={loadingQB}
                    startIcon={<LinkIcon />}
                    sx={{ bgcolor: '#2CA01C', color: '#FFF', px: 4, py: 1.5 }}
                  >
                    {loadingQB ? 'Redirecting...' : 'Connect QuickBooks'}
                  </Button>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Stripe Connect Card */}
          <Grid item xs={12} md={6}>
            <Card sx={{ bgcolor: '#1A1A1A', borderRadius: 3, border: '1px solid #333', height: '100%' }}>
              <CardContent sx={{ p: 4, textAlign: 'center' }}>
                <AccountBalance sx={{ fontSize: 60, color: '#635BFF', mb: 2 }} />
                <Typography variant="h5" sx={{ color: '#FFF', fontWeight: 'bold', mb: 2 }}>
                  Stripe Connect
                </Typography>
                <Typography variant="body2" sx={{ color: '#AAA', mb: 3 }}>
                  Receive payments, manage subscriptions, and sync payment data automatically.
                </Typography>
                {stripeConnected ? (
                  <Chip icon={<CheckCircle />} label="Connected" color="success" sx={{ bgcolor: '#4CAF5020', color: '#4CAF50' }} />
                ) : (
                  <Button
                    variant="contained"
                    onClick={handleConnectStripe}
                    disabled={loadingStripe}
                    startIcon={<LinkIcon />}
                    sx={{ bgcolor: '#635BFF', color: '#FFF', px: 4, py: 1.5 }}
                  >
                    {loadingStripe ? 'Redirecting...' : 'Connect Stripe'}
                  </Button>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}