import { useCallback, useEffect, useState, type ReactElement } from 'react';
import {
  AccountBalance,
  CheckCircle,
  Link as LinkIcon,
  Receipt,
  Sync,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Grid,
  Typography,
} from '@mui/material';

const API_BASE = ((import.meta.env as any).VITE_API_URL ||
  'https://future-jobs-pro-ai-production.up.railway.app').replace(/\/$/, '');

type Provider = 'quickbooks' | 'stripe';
type ProviderStatus = { connected: boolean; accountId?: string; updatedAt?: string };
type IntegrationStatus = {
  quickbooks: ProviderStatus;
  stripe: ProviderStatus;
};

const initialStatus: IntegrationStatus = {
  quickbooks: { connected: false },
  stripe: { connected: false },
};

async function apiRequest(path: string, options: RequestInit = {}): Promise<any> {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('Please sign in again before connecting an integration.');

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Request failed (${response.status})`);
  return data;
}

export default function Integrations() {
  const [status, setStatus] = useState<IntegrationStatus>(initialStatus);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest('/api/integrations/status');
      setStatus({
        quickbooks: data.quickbooks || initialStatus.quickbooks,
        stripe: data.stripe || initialStatus.stripe,
      });
    } catch (requestError: any) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const result = query.get('result');
    const provider = query.get('provider');
    if (result === 'connected') setNotice(`${provider || 'Integration'} connected successfully.`);
    if (result === 'error') setError(query.get('message') || 'The connection could not be completed.');
    if (result) window.history.replaceState({}, '', window.location.pathname);
    void refreshStatus();
  }, [refreshStatus]);

  const connect = async (provider: Provider) => {
    setWorking(`connect-${provider}`);
    setError('');
    try {
      const data = await apiRequest(`/api/integrations/${provider}/auth`);
      if (!data.url) throw new Error('The server did not return an authorization URL.');
      window.location.assign(data.url);
    } catch (requestError: any) {
      setError(requestError.message);
      setWorking(null);
    }
  };

  const disconnect = async (provider: Provider) => {
    if (!window.confirm(`Disconnect ${provider === 'stripe' ? 'Stripe' : 'QuickBooks'}?`)) return;
    setWorking(`disconnect-${provider}`);
    setError('');
    try {
      await apiRequest(`/api/integrations/${provider}/disconnect`, { method: 'POST' });
      setNotice(`${provider === 'stripe' ? 'Stripe' : 'QuickBooks'} disconnected.`);
      await refreshStatus();
    } catch (requestError: any) {
      setError(requestError.message);
    } finally {
      setWorking(null);
    }
  };

  const syncPayments = async () => {
    setWorking('sync');
    setError('');
    try {
      const data = await apiRequest('/api/integrations/sync/stripe-to-quickbooks', { method: 'POST' });
      const result = data.result;
      setNotice(`Sync complete: ${result.created} created, ${result.skipped} already synced, ${result.failed} failed.`);
    } catch (requestError: any) {
      setError(requestError.message);
    } finally {
      setWorking(null);
    }
  };

  const integrationCard = (
    provider: Provider,
    title: string,
    description: string,
    color: string,
    icon: ReactElement,
  ) => {
    const connected = status[provider].connected;
    return (
      <Grid item xs={12} md={6}>
        <Card sx={{ bgcolor: '#1A1A1A', borderRadius: 3, border: '1px solid #333', height: '100%' }}>
          <CardContent sx={{ p: 4, textAlign: 'center' }}>
            {icon}
            <Typography variant="h5" sx={{ color: '#FFF', fontWeight: 'bold', mb: 2 }}>{title}</Typography>
            <Typography variant="body2" sx={{ color: '#AAA', mb: 3 }}>{description}</Typography>
            {connected ? (
              <Box>
                <Chip icon={<CheckCircle />} label="Connected" color="success" sx={{ mb: 2 }} />
                <Box>
                  <Button
                    color="error"
                    variant="outlined"
                    disabled={working !== null}
                    onClick={() => void disconnect(provider)}
                  >
                    {working === `disconnect-${provider}` ? 'Disconnectingâ€¦' : 'Disconnect'}
                  </Button>
                </Box>
              </Box>
            ) : (
              <Button
                variant="contained"
                disabled={working !== null}
                onClick={() => void connect(provider)}
                startIcon={working === `connect-${provider}` ? <CircularProgress size={18} /> : <LinkIcon />}
                sx={{ bgcolor: color, color: '#FFF', px: 4, py: 1.5 }}
              >
                {working === `connect-${provider}` ? 'Opening sign-inâ€¦' : `Connect ${title}`}
              </Button>
            )}
          </CardContent>
        </Card>
      </Grid>
    );
  };

  return (
    <Box sx={{ bgcolor: '#0A0A0A', minHeight: '100vh', py: 4 }}>
      <Container maxWidth="md">
        <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold', mb: 1 }}>Integrations</Typography>
        <Typography variant="body1" sx={{ color: '#888', mb: 4 }}>
          Authorize your own QuickBooks and Stripe accounts, then synchronize successful Stripe payments into QuickBooks.
        </Typography>
        {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 3 }}>{error}</Alert>}
        {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 3 }}>{notice}</Alert>}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
        ) : (
          <>
            <Grid container spacing={4}>
              {integrationCard(
                'quickbooks',
                'QuickBooks',
                'Authorize your QuickBooks Online company to receive synchronized customers and sales receipts.',
                '#2CA01C',
                <Receipt sx={{ fontSize: 60, color: '#2CA01C', mb: 2 }} />,
              )}
              {integrationCard(
                'stripe',
                'Stripe',
                'Authorize your Stripe account without sharing your Stripe password or API keys.',
                '#635BFF',
                <AccountBalance sx={{ fontSize: 60, color: '#635BFF', mb: 2 }} />,
              )}
            </Grid>
            <Card sx={{ bgcolor: '#1A1A1A', border: '1px solid #333', borderRadius: 3, mt: 4 }}>
              <CardContent sx={{ p: 4 }}>
                <Typography variant="h6" sx={{ color: '#FFF', mb: 1 }}>Stripe â†’ QuickBooks</Typography>
                <Typography variant="body2" sx={{ color: '#AAA', mb: 3 }}>
                  Import the 25 most recent successful Stripe payments. Existing mappings prevent duplicate receipts.
                </Typography>
                <Button
                  variant="contained"
                  startIcon={working === 'sync' ? <CircularProgress size={18} /> : <Sync />}
                  disabled={!status.stripe.connected || !status.quickbooks.connected || working !== null}
                  onClick={() => void syncPayments()}
                >
                  {working === 'sync' ? 'Synchronizingâ€¦' : 'Sync now'}
                </Button>
              </CardContent>
            </Card>
          </>
        )}
      </Container>
    </Box>
  );
}
