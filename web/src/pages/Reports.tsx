import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  FormControl,
  Grid,
  InputLabel,
  LinearProgress,
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
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Assessment,
  AttachMoney,
  CheckCircle,
  CloudDownload,
  Description,
  Groups,
  Insights,
  Refresh,
  Schedule,
  TrendingUp,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../services/api';

type Project = { id: string; name: string; client_name?: string; status?: string };
type WorkforceRow = {
  id: string;
  employee_name: string;
  clock_in: string;
  clock_out?: string | null;
  regular_hours: number | string;
  overtime_hours: number | string;
  total_wage: number | string;
  approval_status: string;
};
type Summary = {
  totalHours: number;
  grossWages: number;
  regularHours: number;
  overtimeHours: number;
  employees: number;
  timeEntries: number;
  completedEntries: number;
  approvedEntries: number;
  mediaFiles: number;
  verifiedMedia: number;
  analyzedPhotos: number;
  averageComplianceScore: number | null;
  compliantPhotos: number;
  voiceNotes: number;
  gpsPoints: number;
  attachments: number;
  completionRate: number;
  approvalRate: number;
  readinessScore: number;
  anomalousEntries: number;
  payrollHours: number;
  hoursVariance: number;
};

const emptySummary: Summary = {
  totalHours: 0, grossWages: 0, regularHours: 0, overtimeHours: 0,
  employees: 0, timeEntries: 0, completedEntries: 0, approvedEntries: 0,
  mediaFiles: 0, verifiedMedia: 0, analyzedPhotos: 0, averageComplianceScore: null,
  compliantPhotos: 0, voiceNotes: 0, gpsPoints: 0,
  attachments: 0, completionRate: 0, approvalRate: 0, readinessScore: 0,
  anomalousEntries: 0, payrollHours: 0, hoursVariance: 0,
};

const card = {
  bgcolor: 'background.paper',
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 3,
  boxShadow: '0 18px 50px rgba(0,0,0,.14)',
};

function monthStart() {
  const date = new Date();
  date.setDate(1);
  return date.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function money(value: number) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(Number(value || 0));
}

function fileNameFrom(response: Response, fallback: string) {
  const disposition = response.headers.get('content-disposition') || '';
  return disposition.match(/filename="?([^";]+)"?/i)?.[1] || fallback;
}

export default function Reports() {
  const navigate = useNavigate();
  const token = localStorage.getItem('token') || '';
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(today);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [workforce, setWorkforce] = useState<WorkforceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<'pdf' | 'csv' | null>(null);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const selected = projects.find((project) => project.id === selectedProject);

  const loadProjects = useCallback(async () => {
    const response = await fetch(`${API_BASE}/api/projects`, { headers });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || 'Projects could not be loaded');
    const rows = Array.isArray(body) ? body : body.projects || [];
    setProjects(rows);
    setSelectedProject((current) => current || rows[0]?.id || '');
  }, [headers]);

  const loadSummary = useCallback(async (signal?: AbortSignal) => {
    if (!selectedProject || !startDate || !endDate) return;
    if (startDate > endDate) {
      setError('Start date must be before or equal to end date.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ projectId: selectedProject, startDate, endDate });
      const response = await fetch(`${API_BASE}/api/reports/summary?${query}`, { headers, signal, cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Report data could not be loaded');
      setSummary({ ...emptySummary, ...body.summary });
      setWorkforce(body.workforce || []);
      setUpdatedAt(new Date());
    } catch (caught: any) {
      if (caught.name !== 'AbortError') setError(caught.message || 'Report data could not be loaded');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [endDate, headers, selectedProject, startDate]);

  useEffect(() => {
    setLoading(true);
    loadProjects().catch((caught) => {
      setError(caught.message || 'Projects could not be loaded');
      setLoading(false);
    });
  }, [loadProjects]);

  useEffect(() => {
    if (!selectedProject) return undefined;
    const controller = new AbortController();
    void loadSummary(controller.signal);
    return () => controller.abort();
  }, [loadSummary, selectedProject]);

  const download = async (kind: 'pdf' | 'csv') => {
    if (!selectedProject) return;
    setDownloading(kind);
    setError('');
    try {
      const query = new URLSearchParams({ projectId: selectedProject, startDate, endDate });
      const url = kind === 'pdf'
        ? `${API_BASE}/api/reports/comprehensive`
        : `${API_BASE}/api/reports/timesheet.csv?${query}`;
      const response = await fetch(url, {
        method: kind === 'pdf' ? 'POST' : 'GET',
        headers: kind === 'pdf' ? { ...headers, 'Content-Type': 'application/json' } : headers,
        ...(kind === 'pdf' ? { body: JSON.stringify({ projectId: selectedProject, startDate, endDate }) } : {}),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || `Report download failed with HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = fileNameFrom(response, kind === 'pdf' ? 'project-report.pdf' : 'timesheet.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (caught: any) {
      setError(caught.message || 'The report could not be downloaded');
    } finally {
      setDownloading(null);
    }
  };

  const signal = summary.readinessScore >= 85
    ? { title: 'Ready for management review', text: 'Time completion and approvals are strong for this reporting period.', color: 'success' as const }
    : summary.timeEntries === 0
      ? { title: 'No activity in this period', text: 'Adjust the date range or confirm that employees used this project when clocking in.', color: 'info' as const }
      : { title: 'Review recommended', text: `${summary.completedEntries - summary.approvedEntries} completed time entr${summary.completedEntries - summary.approvedEntries === 1 ? 'y is' : 'ies are'} awaiting approval.`, color: 'warning' as const };

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 2.5, md: 4 } }}>
      <Paper sx={{ ...card, overflow: 'hidden', mb: 3 }}>
        <Box sx={{ p: { xs: 2.5, md: 4 }, background: 'linear-gradient(135deg, rgba(0,205,234,.16), rgba(24,92,122,.04) 58%, transparent)' }}>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2}>
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <Insights sx={{ color: '#00CDEA' }} />
                <Typography variant="overline" sx={{ color: '#00CDEA', letterSpacing: 1.5, fontWeight: 900 }}>Operations intelligence</Typography>
              </Stack>
              <Typography variant="h3" sx={{ fontWeight: 900, fontSize: { xs: 30, md: 43 }, letterSpacing: '-.035em' }}>Report Command Center</Typography>
              <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 760 }}>
                Turn project, workforce, payroll-facing, and field activity into a clear management report. Evidence packages remain independently managed in Evidence Center.
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Tooltip title="Reload report data">
                <Button variant="outlined" startIcon={<Refresh />} onClick={() => void loadSummary()} disabled={loading || !selectedProject}>Refresh</Button>
              </Tooltip>
              <Button variant="contained" startIcon={<CloudDownload />} onClick={() => void download('pdf')} disabled={!selectedProject || downloading !== null}>
                {downloading === 'pdf' ? 'Building PDF…' : 'Download executive PDF'}
              </Button>
            </Stack>
          </Stack>
        </Box>
      </Paper>

      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 3 }}>{error}</Alert>}

      {!loading && summary.anomalousEntries > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <Typography fontWeight={900}>Time-entry review required</Typography>
          <Typography variant="body2">
            {summary.anomalousEntries} entr{summary.anomalousEntries === 1 ? 'y has' : 'ies have'} a negative duration, a shift longer than 24 hours, or more than 16 overtime hours. Correct these records before payroll or client reporting.
          </Typography>
        </Alert>
      )}

      <Paper sx={{ ...card, p: 2.5, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={5}>
            <FormControl fullWidth>
              <InputLabel>Project</InputLabel>
              <Select value={selectedProject} label="Project" onChange={(event) => setSelectedProject(String(event.target.value))}>
                {projects.map((project) => <MenuItem value={project.id} key={project.id}>{project.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={2.5}>
            <TextField fullWidth type="date" label="Start date" value={startDate} onChange={(event) => setStartDate(event.target.value)} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={12} sm={6} md={2.5}>
            <TextField fullWidth type="date" label="End date" value={endDate} onChange={(event) => setEndDate(event.target.value)} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={12} md={2}>
            <Button fullWidth size="large" variant="outlined" onClick={() => void loadSummary()} disabled={!selectedProject || loading} sx={{ minHeight: 56 }}>Apply period</Button>
          </Grid>
        </Grid>
        {updatedAt && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.25 }}>Updated {updatedAt.toLocaleTimeString()} • {selected?.name}</Typography>}
      </Paper>

      {loading ? <LinearProgress sx={{ mb: 3, borderRadius: 3 }} /> : null}

      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {[
          { label: 'Recorded hours', value: summary.totalHours.toFixed(1), detail: `${summary.regularHours.toFixed(1)} regular • ${summary.overtimeHours.toFixed(1)} overtime`, icon: <Schedule />, color: '#00CDEA' },
          { label: 'Gross recorded wages', value: money(summary.grossWages), detail: 'Payroll-facing project labour', icon: <AttachMoney />, color: '#31C48D' },
          { label: 'Team participation', value: summary.employees, detail: `${summary.timeEntries} recorded time entries`, icon: <Groups />, color: '#A78BFA' },
          { label: 'Approval rate', value: `${summary.approvalRate}%`, detail: `${summary.approvedEntries} approved completed entries`, icon: <CheckCircle />, color: '#FFB020' },
        ].map((metric) => (
          <Grid item xs={12} sm={6} lg={3} key={metric.label}>
            <Paper sx={{ ...card, p: 2.5, height: '100%' }}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                <Box>
                  <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 1 }}>{metric.label}</Typography>
                  <Typography variant="h4" sx={{ fontWeight: 900, color: metric.color, my: .4 }}>{metric.value}</Typography>
                  <Typography variant="caption" color="text.secondary">{metric.detail}</Typography>
                </Box>
                <Box sx={{ color: metric.color, opacity: .9 }}>{metric.icon}</Box>
              </Stack>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} lg={8}>
          <Paper sx={{ ...card, p: 3, height: '100%' }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 2.5 }}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 900 }}>Workforce performance</Typography>
                <Typography variant="body2" color="text.secondary">A payroll-facing view of time recorded against this project.</Typography>
              </Box>
              <Button startIcon={<Description />} variant="outlined" onClick={() => void download('csv')} disabled={!selectedProject || downloading !== null}>
                {downloading === 'csv' ? 'Preparing CSV…' : 'Export CSV'}
              </Button>
            </Stack>
            <TableContainer sx={{ maxHeight: 430 }}>
              <Table stickyHeader size="small">
                <TableHead><TableRow>
                  <TableCell>Employee</TableCell><TableCell>Date</TableCell><TableCell align="right">Regular</TableCell><TableCell align="right">Overtime</TableCell><TableCell align="right">Gross</TableCell><TableCell>Status</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {workforce.length ? workforce.map((entry) => (
                    <TableRow key={entry.id} hover>
                      <TableCell sx={{ fontWeight: 700 }}>{entry.employee_name || 'Unknown employee'}</TableCell>
                      <TableCell>{new Date(entry.clock_in).toLocaleDateString('en-CA')}</TableCell>
                      <TableCell align="right">{Number(entry.regular_hours || 0).toFixed(2)}h</TableCell>
                      <TableCell align="right">{Number(entry.overtime_hours || 0).toFixed(2)}h</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800 }}>{money(Number(entry.total_wage || 0))}</TableCell>
                      <TableCell><Chip size="small" label={entry.approval_status || 'draft'} color={entry.approval_status === 'approved' ? 'success' : 'default'} /></TableCell>
                    </TableRow>
                  )) : <TableRow><TableCell colSpan={6} align="center" sx={{ py: 6, color: 'text.secondary' }}>No workforce activity for this project and period.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        <Grid item xs={12} lg={4}>
          <Stack spacing={3} sx={{ height: '100%' }}>
            <Paper sx={{ ...card, p: 3 }}>
              <Stack direction="row" spacing={2.5} alignItems="center">
                <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                  <CircularProgress variant="determinate" value={summary.readinessScore} size={86} thickness={5} sx={{ color: summary.readinessScore >= 85 ? '#31C48D' : '#FFB020' }} />
                  <Box sx={{ inset: 0, position: 'absolute', display: 'grid', placeItems: 'center' }}><Typography fontWeight={900}>{summary.readinessScore}%</Typography></Box>
                </Box>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 900 }}>Report readiness</Typography>
                  <Typography variant="body2" color="text.secondary">Completion, approval, project context, and supporting documents.</Typography>
                </Box>
              </Stack>
            </Paper>

            <Alert severity={signal.color} icon={<TrendingUp />} sx={{ ...card, alignItems: 'flex-start' }}>
              <Typography fontWeight={900}>{signal.title}</Typography>
              <Typography variant="body2">{signal.text}</Typography>
            </Alert>

            <Paper sx={{ ...card, p: 3, flexGrow: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 900, mb: 2 }}>Operational inventory</Typography>
              {[
                ['Media records', summary.mediaFiles],
                ['Verified media', summary.verifiedMedia],
                ['AI-analyzed photos', summary.analyzedPhotos],
                ['Average photo compliance', summary.averageComplianceScore === null ? '—' : `${summary.averageComplianceScore}%`],
                ['Compliant photos', summary.compliantPhotos],
                ['Voice notes', summary.voiceNotes],
                ['GPS observations', summary.gpsPoints],
                ['Supporting files', summary.attachments],
              ].map(([label, value]) => (
                <Stack key={String(label)} direction="row" justifyContent="space-between" sx={{ py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Typography color="text.secondary">{label}</Typography><Typography fontWeight={900}>{value}</Typography>
                </Stack>
              ))}
            </Paper>
          </Stack>
        </Grid>
      </Grid>

      <Paper sx={{ ...card, p: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} spacing={2}>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center"><Assessment color="primary" /><Typography variant="h6" sx={{ fontWeight: 900 }}>Specialist workspaces</Typography></Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>Use the dedicated pages for corrections, approvals, payroll processing, and audit-ready evidence.</Typography>
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button variant="outlined" onClick={() => navigate('/timesheet')}>Open Timesheet</Button>
            <Button variant="outlined" onClick={() => navigate('/payroll')}>Open Payroll</Button>
            <Button variant="outlined" onClick={() => navigate('/evidence')}>Open Evidence Center</Button>
          </Stack>
        </Stack>
      </Paper>
    </Container>
  );
}
