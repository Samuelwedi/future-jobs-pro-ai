import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import {
  AccountBalance,
  CheckCircleOutline,
  Launch,
  Payments,
  Refresh,
  Security,
  Settings,
  Visibility,
} from '@mui/icons-material';
import { API_BASE } from '../services/api';

type BatchStatus =
  | 'awaiting_approval'
  | 'approved'
  | 'submitting'
  | 'submitted'
  | 'processing'
  | 'settled'
  | 'failed'
  | 'cancelled';

type ChipColor = 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning';

interface PayoutExecutionCapability {
  available: boolean;
  configured: boolean;
  adapterId: string | null;
  hostedTokenizedEnrollment: boolean;
  reason: string | null;
}

interface AccountingSyncCapability {
  available: boolean;
  configured: boolean;
  provider: 'quickbooks' | null;
  reason: string | null;
}

interface PayoutCapability {
  country: string;
  countryName: string;
  currency: string;
  available: boolean;
  reason: string | null;
  payoutExecution: PayoutExecutionCapability;
  accountingSync: AccountingSyncCapability;
}

interface PayoutSettings {
  country: string;
  currency: string;
  adapterId: string | null;
  updatedAt: string;
}

interface PayoutAccount {
  employeeId: string;
  employeeName: string;
  email: string | null;
  country: string;
  currency: string;
  status: string;
  destination: {
    configured: boolean;
    last4: string | null;
    label: string | null;
  };
}

interface PayoutPayroll {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  country: string;
  currency: string;
  employeeCount: number;
  totalMinor: number;
  totalFormatted: string;
  eligible: boolean;
  reason: string | null;
}

interface PayoutBatch {
  id: string;
  payrollId: string;
  country: string;
  currency: string;
  status: BatchStatus;
  employeeCount: number;
  totalMinor: number;
  totalFormatted: string;
  createdBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  providerReference: string | null;
  failureCode: string | null;
  createdAt: string;
  updatedAt: string;
  actions: {
    canApprove: boolean;
    canExecute: boolean;
  };
}

interface PayoutEvent {
  id: string;
  type: string;
  actorId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

interface CapabilitiesResponse {
  success: true;
  executionEnabled: boolean;
  capabilities: PayoutCapability[];
}

interface SettingsResponse {
  success: true;
  settings: PayoutSettings | null;
  requiresConfiguration: boolean;
}

interface UpdateSettingsResponse {
  success: true;
  settings: PayoutSettings;
}

interface AccountsResponse {
  success: true;
  accounts: PayoutAccount[];
}

interface PayrollsResponse {
  success: true;
  payrolls: PayoutPayroll[];
}

interface BatchesResponse {
  success: true;
  batches: PayoutBatch[];
}

interface BatchResponse {
  success: true;
  replayed?: boolean;
  batch: PayoutBatch;
}

interface BatchDetailsResponse extends BatchResponse {
  events: PayoutEvent[];
}

interface EnrollmentResponse {
  success: true;
  session: {
    url: string;
    expiresAt: string;
  };
}

interface ApiErrorBody {
  success?: false;
  code?: string;
  message?: string;
}

const panelStyle = {
  bgcolor: '#1A1A1A',
  border: '1px solid #333',
};

const darkSelectStyle = {
  color: '#FFF',
  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#444' },
  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#666' },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#00D4FF' },
  '& .MuiSvgIcon-root': { color: '#AAA' },
};

const darkInputStyle = {
  '& .MuiInputLabel-root': { color: '#999' },
  '& .MuiInputBase-input': { color: '#FFF' },
  '& .MuiOutlinedInput-root': {
    '& fieldset': { borderColor: '#444' },
    '&:hover fieldset': { borderColor: '#666' },
    '&.Mui-focused fieldset': { borderColor: '#00D4FF' },
  },
};

async function payoutRequest<T extends { success: true }>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}/api/payouts${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => null) as T | ApiErrorBody | null;
  if (!response.ok || !body || body.success !== true) {
    const failure = body as ApiErrorBody | null;
    const message = failure?.message || `Payout service returned ${response.status}`;
    throw new Error(failure?.code ? `${message} (${failure.code})` : message);
  }
  return body as T;
}

function makeIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `payout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function labelForStatus(status: string): string {
  return status
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function colorForBatchStatus(status: BatchStatus): ChipColor {
  switch (status) {
    case 'settled': return 'success';
    case 'failed': return 'error';
    case 'cancelled': return 'default';
    case 'awaiting_approval': return 'warning';
    case 'approved': return 'info';
    case 'submitting':
    case 'submitted':
    case 'processing': return 'primary';
    default: return 'default';
  }
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString();
}

function safeEnrollmentUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export default function DirectDepositPage() {
  const token = localStorage.getItem('token') || '';
  const actionKeys = useRef<Record<string, string>>({});
  const requestedPayrollId = useRef(new URLSearchParams(window.location.search).get('payrollId') || '');
  const requestedPayrollApplied = useRef(false);
  const [loading, setLoading] = useState(true);
  const [dataReady, setDataReady] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [executionEnabled, setExecutionEnabled] = useState(false);
  const [capabilities, setCapabilities] = useState<PayoutCapability[]>([]);
  const [settings, setSettings] = useState<PayoutSettings | null>(null);
  const [requiresConfiguration, setRequiresConfiguration] = useState(true);
  const [accounts, setAccounts] = useState<PayoutAccount[]>([]);
  const [payrolls, setPayrolls] = useState<PayoutPayroll[]>([]);
  const [batches, setBatches] = useState<PayoutBatch[]>([]);
  const [selectedPayrollId, setSelectedPayrollId] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPair, setSettingsPair] = useState('');
  const [approvalBatch, setApprovalBatch] = useState<PayoutBatch | null>(null);
  const [executionBatch, setExecutionBatch] = useState<PayoutBatch | null>(null);
  const [executionConfirmation, setExecutionConfirmation] = useState('');
  const [detailsBatch, setDetailsBatch] = useState<PayoutBatch | null>(null);
  const [detailsEvents, setDetailsEvents] = useState<PayoutEvent[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [enrollment, setEnrollment] = useState<{ employeeName: string; url: string; expiresAt: string } | null>(null);

  const loadPayouts = useCallback(async () => {
    setLoading(true);
    setDataReady(false);
    setError('');
    try {
      const [capabilityBody, settingsBody, accountsBody, payrollsBody, batchesBody] = await Promise.all([
        payoutRequest<CapabilitiesResponse>(token, '/capabilities'),
        payoutRequest<SettingsResponse>(token, '/settings'),
        payoutRequest<AccountsResponse>(token, '/accounts'),
        payoutRequest<PayrollsResponse>(token, '/payrolls'),
        payoutRequest<BatchesResponse>(token, '/batches'),
      ]);
      if (
        typeof capabilityBody.executionEnabled !== 'boolean'
        || !Array.isArray(capabilityBody.capabilities)
        || !Array.isArray(accountsBody.accounts)
        || !Array.isArray(payrollsBody.payrolls)
        || !Array.isArray(batchesBody.batches)
      ) {
        throw new Error('Payout service returned an incomplete response. Actions remain disabled.');
      }
      setExecutionEnabled(capabilityBody.executionEnabled);
      setCapabilities(capabilityBody.capabilities);
      setSettings(settingsBody.settings);
      setRequiresConfiguration(settingsBody.requiresConfiguration);
      setAccounts(accountsBody.accounts);
      setPayrolls(payrollsBody.payrolls);
      setBatches(batchesBody.batches);
      setDataReady(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load payout controls.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadPayouts();
  }, [loadPayouts]);

  useEffect(() => {
    if (!dataReady || requestedPayrollApplied.current || !requestedPayrollId.current) return;
    if (payrolls.some((payroll) => payroll.id === requestedPayrollId.current)) {
      setSelectedPayrollId(requestedPayrollId.current);
      requestedPayrollApplied.current = true;
    }
  }, [dataReady, payrolls]);

  const selectedPayroll = useMemo(
    () => payrolls.find((payroll) => payroll.id === selectedPayrollId) || null,
    [payrolls, selectedPayrollId],
  );

  const configuredCapabilities = useMemo(
    () => capabilities.filter((capability) => (
      capability.available
      && capability.payoutExecution.available
      && capability.payoutExecution.configured
      && Boolean(capability.payoutExecution.adapterId)
    )),
    [capabilities],
  );

  const configuredDestinations = accounts.filter((account) => account.destination.configured).length;
  const awaitingApproval = batches.filter((batch) => batch.status === 'awaiting_approval').length;
  const inFlight = batches.filter((batch) => ['submitting', 'submitted', 'processing'].includes(batch.status)).length;

  const findCapability = (country: string, currency: string) => capabilities.find(
    (capability) => capability.country === country && capability.currency === currency,
  );

  const createBlocker = useMemo(() => {
    if (!dataReady) return 'Payout data must load successfully before a batch can be created.';
    if (!settings || requiresConfiguration) return 'Choose a configured country and currency first.';
    if (!executionEnabled) return 'Payout execution is disabled for this deployment.';
    if (!selectedPayroll) return 'Select a payroll.';
    if (!selectedPayroll.eligible) return selectedPayroll.reason || 'This payroll is not eligible for payout.';
    if (selectedPayroll.country !== settings.country || selectedPayroll.currency !== settings.currency) {
      return `This payroll is ${selectedPayroll.country}/${selectedPayroll.currency}, but payout settings are ${settings.country}/${settings.currency}.`;
    }
    const capability = findCapability(selectedPayroll.country, selectedPayroll.currency);
    if (!capability?.available || !capability.payoutExecution.available) {
      return capability?.payoutExecution.reason || capability?.reason || 'No payout rail is available for this payroll.';
    }
    if (!capability.payoutExecution.configured || !capability.payoutExecution.adapterId) {
      return capability.payoutExecution.reason || 'The payout rail is not configured.';
    }
    return '';
  }, [dataReady, executionEnabled, requiresConfiguration, selectedPayroll, settings, capabilities]);

  const runAction = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Payout action failed.');
    } finally {
      setBusy('');
    }
  };

  const createBatch = async () => {
    if (!selectedPayroll || createBlocker) return;
    const operation = `create:${selectedPayroll.id}:${selectedPayroll.country}:${selectedPayroll.currency}`;
    const idempotencyKey = actionKeys.current[operation] || makeIdempotencyKey();
    actionKeys.current[operation] = idempotencyKey;
    await runAction('create', async () => {
      const body = await payoutRequest<BatchResponse>(token, '/batches', {
        method: 'POST',
        body: JSON.stringify({
          payrollId: selectedPayroll.id,
          country: selectedPayroll.country,
          currency: selectedPayroll.currency,
          idempotencyKey,
        }),
      });
      delete actionKeys.current[operation];
      setNotice(body.replayed
        ? `The existing approval batch ${body.batch.id} was returned; no duplicate was created.`
        : `Batch ${body.batch.id} was created and is awaiting approval. No funds have moved.`);
      setSelectedPayrollId('');
      await loadPayouts();
    });
  };

  const approveSelectedBatch = async () => {
    if (!approvalBatch || !approvalBatch.actions.canApprove || approvalBatch.status !== 'awaiting_approval') return;
    const batch = approvalBatch;
    const operation = `approve:${batch.id}`;
    const idempotencyKey = actionKeys.current[operation] || makeIdempotencyKey();
    actionKeys.current[operation] = idempotencyKey;
    await runAction(operation, async () => {
      const body = await payoutRequest<BatchResponse>(token, `/batches/${encodeURIComponent(batch.id)}/approve`, {
        method: 'POST',
        body: JSON.stringify({ idempotencyKey }),
      });
      delete actionKeys.current[operation];
      setApprovalBatch(null);
      setNotice(body.replayed
        ? `Approval for batch ${batch.id} was already recorded.`
        : `Batch ${batch.id} is approved. Funds have not moved; execution is still required.`);
      await loadPayouts();
    });
  };

  const executeSelectedBatch = async () => {
    if (!executionBatch || !executionBatch.actions.canExecute || executionBatch.status !== 'approved') return;
    const expected = `EXECUTE ${executionBatch.id}`;
    if (executionConfirmation !== expected) return;
    const batch = executionBatch;
    const operation = `execute:${batch.id}`;
    const idempotencyKey = actionKeys.current[operation] || makeIdempotencyKey();
    actionKeys.current[operation] = idempotencyKey;
    await runAction(operation, async () => {
      const body = await payoutRequest<BatchResponse>(token, `/batches/${encodeURIComponent(batch.id)}/execute`, {
        method: 'POST',
        body: JSON.stringify({ confirmation: expected, idempotencyKey }),
      });
      delete actionKeys.current[operation];
      setExecutionBatch(null);
      setExecutionConfirmation('');
      const failedMessage = body.batch.status === 'failed'
        ? `The payout rail rejected batch ${batch.id}`
          + `${body.batch.failureCode ? ` (${body.batch.failureCode})` : ''}. No success was recorded.`
        : '';
      if (body.batch.status === 'settled') {
        setNotice(`Batch ${batch.id} is confirmed settled by the payout rail.`);
      } else if (!failedMessage && body.replayed) {
        setNotice(`Execution for batch ${batch.id} was already accepted; no duplicate submission was made.`);
      } else if (!failedMessage) {
        setNotice(
          `Batch ${batch.id} is ${labelForStatus(body.batch.status).toLowerCase()}. `
          + 'Track it below until the payout rail confirms settlement or failure.',
        );
      }
      await loadPayouts();
      if (failedMessage) setError(failedMessage);
    });
  };

  const openSettings = () => {
    setSettingsPair(settings ? `${settings.country}|${settings.currency}` : '');
    setSettingsOpen(true);
  };

  const saveSettings = async () => {
    const capability = configuredCapabilities.find((item) => `${item.country}|${item.currency}` === settingsPair);
    if (!capability?.payoutExecution.adapterId) return;
    await runAction('settings', async () => {
      await payoutRequest<UpdateSettingsResponse>(token, '/settings', {
        method: 'PUT',
        body: JSON.stringify({
          country: capability.country,
          currency: capability.currency,
          adapterId: capability.payoutExecution.adapterId,
        }),
      });
      setSettingsOpen(false);
      setNotice(`Payout settings updated to ${capability.country}/${capability.currency}.`);
      await loadPayouts();
    });
  };

  const startEnrollment = async (account: PayoutAccount) => {
    const capability = findCapability(account.country, account.currency);
    const canEnroll = Boolean(
      dataReady
      && executionEnabled
      && settings?.country === account.country
      && settings.currency === account.currency
      && capability?.payoutExecution.available
      && capability.payoutExecution.configured
      && capability.payoutExecution.hostedTokenizedEnrollment,
    );
    if (!canEnroll) return;
    await runAction(`enroll:${account.employeeId}`, async () => {
      const body = await payoutRequest<EnrollmentResponse>(token, '/accounts/enrollment-session', {
        method: 'POST',
        body: JSON.stringify({ employeeId: account.employeeId }),
      });
      const url = safeEnrollmentUrl(body.session.url);
      if (!url) throw new Error('The payout service returned an unsafe enrollment link.');
      setEnrollment({ employeeName: account.employeeName, url, expiresAt: body.session.expiresAt });
    });
  };

  const openBatchDetails = async (batch: PayoutBatch) => {
    setDetailsBatch(batch);
    setDetailsEvents([]);
    setDetailsLoading(true);
    setError('');
    try {
      const body = await payoutRequest<BatchDetailsResponse>(token, `/batches/${encodeURIComponent(batch.id)}`);
      setDetailsBatch(body.batch);
      setDetailsEvents(Array.isArray(body.events) ? body.events : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load payout history.');
    } finally {
      setDetailsLoading(false);
    }
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4, bgcolor: '#0A0A0A', minHeight: '100vh' }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold', mb: 1 }}>
            <Payments sx={{ verticalAlign: 'middle', mr: 1, color: '#00D4FF' }} />
            Employee Payouts
          </Typography>
          <Typography variant="body1" sx={{ color: '#AAA', maxWidth: 780 }}>
            Prepare, approve, submit, and track payroll payouts inside the app. Money only moves after a
            configured payout rail, a separate approval, and an explicit execution confirmation.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <Button
            variant="outlined"
            startIcon={<Settings />}
            onClick={openSettings}
            disabled={loading || !dataReady}
            sx={{ color: '#FFF', borderColor: '#555' }}
          >
            Payout settings
          </Button>
          <Button
            variant="outlined"
            startIcon={loading ? <CircularProgress size={16} /> : <Refresh />}
            onClick={() => void loadPayouts()}
            disabled={loading || Boolean(busy)}
            sx={{ color: '#00D4FF', borderColor: '#00D4FF' }}
          >
            Refresh
          </Button>
        </Stack>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          <AlertTitle>Payout action stopped</AlertTitle>
          {error}
          {!dataReady && ' Payment actions remain disabled until all payout data loads successfully.'}
        </Alert>
      )}
      {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}
      {!loading && dataReady && !executionEnabled && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <AlertTitle>Payout execution unavailable</AlertTitle>
          This deployment has payout execution turned off. You can review status, but no batch can be created,
          approved, or submitted until an administrator enables a certified payout adapter.
        </Alert>
      )}
      {!loading && dataReady && (requiresConfiguration || !settings) && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <AlertTitle>Country and currency are not configured</AlertTitle>
          Select Payout settings to choose a country/currency pair backed by a configured payout rail. The app
          does not assume a default jurisdiction.
        </Alert>
      )}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Configured rails', value: configuredCapabilities.length, icon: <AccountBalance /> },
          { label: 'Masked destinations ready', value: `${configuredDestinations}/${accounts.length}`, icon: <Security /> },
          { label: 'Awaiting approval', value: awaitingApproval, icon: <CheckCircleOutline /> },
          { label: 'In progress', value: inFlight, icon: <Payments /> },
        ].map((item) => (
          <Grid item xs={12} sm={6} lg={3} key={item.label}>
            <Paper sx={{ ...panelStyle, p: 2.5, height: '100%' }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="body2" sx={{ color: '#999' }}>{item.label}</Typography>
                  <Typography variant="h5" sx={{ color: '#FFF', fontWeight: 700 }}>{loading ? '—' : item.value}</Typography>
                </Box>
                <Box sx={{ color: '#00D4FF' }}>{item.icon}</Box>
              </Stack>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Paper sx={{ ...panelStyle, p: 3, mb: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
          <Box>
            <Typography variant="h6" sx={{ color: '#FFF' }}>Create an approval batch</Typography>
            <Typography variant="body2" sx={{ color: '#999' }}>
              Creating a batch does not send money. A different authorized user must approve it before execution.
            </Typography>
          </Box>
          {settings && (
            <Chip label={`Configured: ${settings.country} / ${settings.currency}`} color="info" variant="outlined" />
          )}
        </Stack>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'flex-start' }}>
          <FormControl sx={{ minWidth: 280, flex: 1 }} disabled={!dataReady || loading}>
            <InputLabel sx={{ color: '#999' }}>Eligible payroll</InputLabel>
            <Select
              value={selectedPayrollId}
              label="Eligible payroll"
              onChange={(event) => setSelectedPayrollId(event.target.value)}
              sx={darkSelectStyle}
            >
              <MenuItem value=""><em>Select a payroll</em></MenuItem>
              {payrolls.map((payroll) => (
                <MenuItem key={payroll.id} value={payroll.id}>
                  {payroll.periodStart} – {payroll.periodEnd} · {payroll.totalFormatted} · {payroll.country}/{payroll.currency}
                  {!payroll.eligible ? ' · Not eligible' : ''}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            variant="contained"
            startIcon={busy === 'create' ? <CircularProgress size={18} /> : <Security />}
            onClick={() => void createBatch()}
            disabled={Boolean(createBlocker) || Boolean(busy)}
            sx={{ bgcolor: '#00D4FF', color: '#0A0A0A', minHeight: 54, px: 3, '&:hover': { bgcolor: '#00B8DD' } }}
          >
            Create approval batch
          </Button>
        </Stack>
        {createBlocker && (
          <Typography variant="body2" sx={{ color: selectedPayroll ? '#FFB74D' : '#888', mt: 1.5 }}>{createBlocker}</Typography>
        )}
      </Paper>

      <Paper sx={{ ...panelStyle, mb: 3, overflow: 'hidden' }}>
        <Box sx={{ p: 3, pb: 2 }}>
          <Typography variant="h6" sx={{ color: '#FFF' }}>Country availability</Typography>
          <Typography variant="body2" sx={{ color: '#999' }}>
            “Supported” describes app architecture. “Configured” means this deployment has an active payout adapter.
            QuickBooks, when connected, is accounting sync only and does not move funds.
          </Typography>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ color: '#999' }}>Country / currency</TableCell>
                <TableCell sx={{ color: '#999' }}>Payout rail</TableCell>
                <TableCell sx={{ color: '#999' }}>Secure employee setup</TableCell>
                <TableCell sx={{ color: '#999' }}>Accounting sync</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={4} align="center" sx={{ py: 4 }}><CircularProgress sx={{ color: '#00D4FF' }} /></TableCell></TableRow>
              ) : capabilities.length === 0 ? (
                <TableRow><TableCell colSpan={4} align="center" sx={{ py: 4, color: '#999' }}>No country capabilities are published by this deployment.</TableCell></TableRow>
              ) : capabilities.map((capability) => {
                const executionConfigured = capability.available && capability.payoutExecution.available && capability.payoutExecution.configured;
                const accountingConfigured = capability.accountingSync.available && capability.accountingSync.configured;
                return (
                  <TableRow key={`${capability.country}-${capability.currency}`} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                    <TableCell>
                      <Typography sx={{ color: '#FFF' }}>{capability.countryName}</Typography>
                      <Typography variant="caption" sx={{ color: '#999' }}>{capability.country} · {capability.currency}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={executionConfigured ? 'Configured' : capability.payoutExecution.available ? 'Setup required' : 'Unavailable'}
                        color={executionConfigured ? 'success' : capability.payoutExecution.available ? 'warning' : 'default'}
                      />
                      {(capability.payoutExecution.reason || capability.reason) && (
                        <Typography variant="caption" display="block" sx={{ color: '#999', mt: 0.5 }}>
                          {capability.payoutExecution.reason || capability.reason}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={executionConfigured && capability.payoutExecution.hostedTokenizedEnrollment ? 'Hosted setup available' : 'Not available'}
                        color={executionConfigured && capability.payoutExecution.hostedTokenizedEnrollment ? 'info' : 'default'}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={accountingConfigured ? 'QuickBooks connected' : capability.accountingSync.available ? 'Not configured' : 'Unavailable'}
                        color={accountingConfigured ? 'success' : 'default'}
                      />
                      {capability.accountingSync.reason && (
                        <Typography variant="caption" display="block" sx={{ color: '#999', mt: 0.5 }}>
                          {capability.accountingSync.reason}
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Paper sx={{ ...panelStyle, mb: 3, overflow: 'hidden' }}>
        <Box sx={{ p: 3, pb: 2 }}>
          <Typography variant="h6" sx={{ color: '#FFF' }}>Employee payout destinations</Typography>
          <Typography variant="body2" sx={{ color: '#999' }}>
            Only masked destination metadata is displayed here. Raw routing and account numbers are not collected on this page.
          </Typography>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ color: '#999' }}>Employee</TableCell>
                <TableCell sx={{ color: '#999' }}>Country / currency</TableCell>
                <TableCell sx={{ color: '#999' }}>Destination</TableCell>
                <TableCell sx={{ color: '#999' }}>Status</TableCell>
                <TableCell align="right" sx={{ color: '#999' }}>Secure setup</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4 }}><CircularProgress sx={{ color: '#00D4FF' }} /></TableCell></TableRow>
              ) : accounts.length === 0 ? (
                <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4, color: '#999' }}>No employee payout accounts were returned.</TableCell></TableRow>
              ) : accounts.map((account) => {
                const capability = findCapability(account.country, account.currency);
                const canEnroll = Boolean(
                  dataReady
                  && executionEnabled
                  && settings?.country === account.country
                  && settings.currency === account.currency
                  && capability?.payoutExecution.available
                  && capability.payoutExecution.configured
                  && capability.payoutExecution.hostedTokenizedEnrollment,
                );
                return (
                  <TableRow key={account.employeeId} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                    <TableCell>
                      <Typography sx={{ color: '#FFF' }}>{account.employeeName}</Typography>
                      <Typography variant="caption" sx={{ color: '#999' }}>{account.email}</Typography>
                    </TableCell>
                    <TableCell sx={{ color: '#DDD' }}>{account.country} / {account.currency}</TableCell>
                    <TableCell sx={{ color: '#DDD' }}>
                      {account.destination.configured
                        ? `${account.destination.label || 'Account'}${account.destination.last4 ? ` ···· ${account.destination.last4}` : ' · masked'}`
                        : 'Not configured'}
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label={labelForStatus(account.status)} color={account.destination.configured ? 'success' : 'warning'} variant="outlined" />
                    </TableCell>
                    <TableCell align="right">
                      {canEnroll ? (
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={busy === `enroll:${account.employeeId}` ? <CircularProgress size={14} /> : <Launch />}
                          disabled={Boolean(busy)}
                          onClick={() => void startEnrollment(account)}
                          sx={{ color: '#00D4FF', borderColor: '#00D4FF' }}
                        >
                          {account.destination.configured ? 'Update securely' : 'Set up securely'}
                        </Button>
                      ) : (
                        <Typography variant="caption" sx={{ color: '#777' }}>Hosted setup unavailable</Typography>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Paper sx={{ ...panelStyle, overflow: 'hidden' }}>
        <Box sx={{ p: 3, pb: 2 }}>
          <Typography variant="h6" sx={{ color: '#FFF' }}>Payout batches</Typography>
          <Typography variant="body2" sx={{ color: '#999' }}>
            Approval and execution permissions are calculated by the server for the signed-in user.
          </Typography>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ color: '#999' }}>Batch</TableCell>
                <TableCell sx={{ color: '#999' }}>Payroll</TableCell>
                <TableCell sx={{ color: '#999' }}>Amount</TableCell>
                <TableCell sx={{ color: '#999' }}>Status</TableCell>
                <TableCell sx={{ color: '#999' }}>Updated</TableCell>
                <TableCell align="right" sx={{ color: '#999' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4 }}><CircularProgress sx={{ color: '#00D4FF' }} /></TableCell></TableRow>
              ) : batches.length === 0 ? (
                <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4, color: '#999' }}>No payout batches yet.</TableCell></TableRow>
              ) : batches.map((batch) => {
                const capability = findCapability(batch.country, batch.currency);
                const railReady = Boolean(capability?.payoutExecution.available && capability.payoutExecution.configured);
                const canMutate = dataReady && executionEnabled && railReady && !busy;
                return (
                  <TableRow key={batch.id} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                    <TableCell>
                      <Typography sx={{ color: '#FFF', fontFamily: 'monospace' }}>{batch.id}</Typography>
                      <Typography variant="caption" sx={{ color: '#999' }}>{batch.employeeCount} employees · {batch.country}/{batch.currency}</Typography>
                    </TableCell>
                    <TableCell sx={{ color: '#DDD', fontFamily: 'monospace' }}>{batch.payrollId}</TableCell>
                    <TableCell sx={{ color: '#FFF', fontWeight: 600 }}>{batch.totalFormatted}</TableCell>
                    <TableCell><Chip size="small" label={labelForStatus(batch.status)} color={colorForBatchStatus(batch.status)} /></TableCell>
                    <TableCell sx={{ color: '#BBB' }}>{formatDate(batch.updatedAt)}</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button size="small" startIcon={<Visibility />} onClick={() => void openBatchDetails(batch)} sx={{ color: '#BBB' }}>Details</Button>
                        {batch.status === 'awaiting_approval' && (
                          <Button
                            size="small"
                            variant="outlined"
                            disabled={!canMutate || !batch.actions.canApprove}
                            onClick={() => setApprovalBatch(batch)}
                            sx={{ color: '#FFB74D', borderColor: '#FFB74D' }}
                          >
                            Approve
                          </Button>
                        )}
                        {batch.status === 'approved' && (
                          <Button
                            size="small"
                            variant="contained"
                            disabled={!canMutate || !batch.actions.canExecute}
                            onClick={() => { setExecutionBatch(batch); setExecutionConfirmation(''); }}
                            sx={{ bgcolor: '#00D4FF', color: '#0A0A0A' }}
                          >
                            Execute
                          </Button>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={settingsOpen} onClose={() => !busy && setSettingsOpen(false)} fullWidth maxWidth="sm" PaperProps={{ sx: panelStyle }}>
        <DialogTitle sx={{ color: '#FFF' }}>Payout country and currency</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            Only country/currency pairs with a configured payout adapter can be saved. No default is assumed.
          </Alert>
          <FormControl fullWidth>
            <InputLabel sx={{ color: '#999' }}>Country and currency</InputLabel>
            <Select value={settingsPair} label="Country and currency" onChange={(event) => setSettingsPair(event.target.value)} sx={darkSelectStyle}>
              {configuredCapabilities.map((capability) => (
                <MenuItem key={`${capability.country}-${capability.currency}`} value={`${capability.country}|${capability.currency}`}>
                  {capability.countryName} · {capability.currency}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {configuredCapabilities.length === 0 && (
            <Typography variant="body2" sx={{ color: '#FFB74D', mt: 2 }}>
              No payout adapter is configured. Ask a deployment administrator to configure and certify one first.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettingsOpen(false)} disabled={Boolean(busy)} sx={{ color: '#AAA' }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => void saveSettings()}
            disabled={!settingsPair || Boolean(busy)}
            sx={{ bgcolor: '#00D4FF', color: '#0A0A0A' }}
          >
            {busy === 'settings' ? <CircularProgress size={20} /> : 'Save settings'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(approvalBatch)} onClose={() => !busy && setApprovalBatch(null)} fullWidth maxWidth="sm" PaperProps={{ sx: panelStyle }}>
        <DialogTitle sx={{ color: '#FFF' }}>Approve payout batch?</DialogTitle>
        <DialogContent>
          {approvalBatch && (
            <Stack spacing={2}>
              <Alert severity="warning">
                The user who created this batch cannot approve it. Approval records your authorization but does not move funds.
              </Alert>
              <Typography sx={{ color: '#DDD' }}>
                Batch <Box component="span" sx={{ fontFamily: 'monospace' }}>{approvalBatch.id}</Box> contains{' '}
                {approvalBatch.employeeCount} payouts totaling {approvalBatch.totalFormatted}.
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setApprovalBatch(null)} disabled={Boolean(busy)} sx={{ color: '#AAA' }}>Cancel</Button>
          <Button variant="contained" color="warning" onClick={() => void approveSelectedBatch()} disabled={Boolean(busy) || !approvalBatch?.actions.canApprove}>
            {busy.startsWith('approve:') ? <CircularProgress size={20} /> : 'Approve batch'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(executionBatch)} onClose={() => !busy && setExecutionBatch(null)} fullWidth maxWidth="sm" PaperProps={{ sx: panelStyle }}>
        <DialogTitle sx={{ color: '#FFF' }}>Execute payout batch</DialogTitle>
        <DialogContent>
          {executionBatch && (
            <Stack spacing={2}>
              <Alert severity="error">
                This submits {executionBatch.totalFormatted} for {executionBatch.employeeCount} employees to the configured payout rail.
                Submission may not be reversible.
              </Alert>
              <Typography sx={{ color: '#DDD' }}>
                Type <Box component="strong" sx={{ fontFamily: 'monospace', color: '#FFF' }}>EXECUTE {executionBatch.id}</Box> to confirm.
              </Typography>
              <TextField
                autoFocus
                fullWidth
                label="Execution confirmation"
                value={executionConfirmation}
                onChange={(event) => setExecutionConfirmation(event.target.value)}
                autoComplete="off"
                sx={darkInputStyle}
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setExecutionBatch(null); setExecutionConfirmation(''); }} disabled={Boolean(busy)} sx={{ color: '#AAA' }}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => void executeSelectedBatch()}
            disabled={Boolean(busy) || !executionBatch || executionConfirmation !== `EXECUTE ${executionBatch.id}` || !executionBatch.actions.canExecute}
          >
            {busy.startsWith('execute:') ? <CircularProgress size={20} /> : 'Submit payouts'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(detailsBatch)} onClose={() => setDetailsBatch(null)} fullWidth maxWidth="md" PaperProps={{ sx: panelStyle }}>
        <DialogTitle sx={{ color: '#FFF' }}>Payout batch history</DialogTitle>
        <DialogContent>
          {detailsLoading ? (
            <Box sx={{ textAlign: 'center', py: 5 }}><CircularProgress sx={{ color: '#00D4FF' }} /></Box>
          ) : detailsBatch && (
            <Stack spacing={2}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}><Typography variant="caption" sx={{ color: '#888' }}>Batch</Typography><Typography sx={{ color: '#FFF', fontFamily: 'monospace' }}>{detailsBatch.id}</Typography></Grid>
                <Grid item xs={12} sm={6}><Typography variant="caption" sx={{ color: '#888' }}>Status</Typography><Box><Chip size="small" label={labelForStatus(detailsBatch.status)} color={colorForBatchStatus(detailsBatch.status)} /></Box></Grid>
                <Grid item xs={12} sm={6}><Typography variant="caption" sx={{ color: '#888' }}>Total</Typography><Typography sx={{ color: '#FFF' }}>{detailsBatch.totalFormatted} · {detailsBatch.employeeCount} employees</Typography></Grid>
                <Grid item xs={12} sm={6}><Typography variant="caption" sx={{ color: '#888' }}>Approved</Typography><Typography sx={{ color: '#FFF' }}>{formatDate(detailsBatch.approvedAt)}</Typography></Grid>
                <Grid item xs={12} sm={6}><Typography variant="caption" sx={{ color: '#888' }}>Created</Typography><Typography sx={{ color: '#FFF' }}>{formatDate(detailsBatch.createdAt)}</Typography></Grid>
                <Grid item xs={12} sm={6}><Typography variant="caption" sx={{ color: '#888' }}>Updated</Typography><Typography sx={{ color: '#FFF' }}>{formatDate(detailsBatch.updatedAt)}</Typography></Grid>
              </Grid>
              <Divider sx={{ borderColor: '#333' }} />
              <Typography variant="subtitle1" sx={{ color: '#FFF' }}>Audit events</Typography>
              {detailsEvents.length === 0 ? (
                <Typography variant="body2" sx={{ color: '#999' }}>No audit events were returned.</Typography>
              ) : detailsEvents.map((event) => (
                <Box key={event.id} sx={{ borderLeft: '2px solid #00D4FF', pl: 2, py: 0.5 }}>
                  <Typography sx={{ color: '#FFF' }}>{labelForStatus(event.type)}</Typography>
                  <Typography variant="caption" sx={{ color: '#999' }}>{formatDate(event.createdAt)}</Typography>
                </Box>
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions><Button onClick={() => setDetailsBatch(null)} sx={{ color: '#00D4FF' }}>Close</Button></DialogActions>
      </Dialog>

      <Dialog open={Boolean(enrollment)} onClose={() => setEnrollment(null)} fullWidth maxWidth="sm" PaperProps={{ sx: panelStyle }}>
        <DialogTitle sx={{ color: '#FFF' }}>Continue secure account setup</DialogTitle>
        <DialogContent>
          {enrollment && (
            <Stack spacing={2}>
              <Alert severity="info">
                {enrollment.employeeName} will enter bank details in the configured provider’s hosted flow, not on this page.
              </Alert>
              <Typography variant="body2" sx={{ color: '#AAA' }}>This one-time link expires {formatDate(enrollment.expiresAt)}.</Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEnrollment(null)} sx={{ color: '#AAA' }}>Cancel</Button>
          {enrollment && (
            <Button
              component="a"
              href={enrollment.url}
              target="_blank"
              rel="noopener noreferrer"
              variant="contained"
              endIcon={<Launch />}
              onClick={() => setEnrollment(null)}
              sx={{ bgcolor: '#00D4FF', color: '#0A0A0A' }}
            >
              Open secure setup
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Container>
  );
}
