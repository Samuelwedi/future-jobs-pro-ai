import React, { useState, useEffect } from 'react';
import {
  Box, Container, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, Chip, CircularProgress, Stack, Tabs, Tab,
  Alert, Grid, Card, CardContent, Avatar,
} from '@mui/material';
import {
  Person, Receipt, AccessTime, BeachAccess, Download,
} from '@mui/icons-material';

import { API_BASE } from '../services/api';

// ─── Types ────────────────────────────────────────────────────────
interface PayStub {
  id: string;
  payroll_id: string;
  employee_id: string;
  pdf_url: string;
  generated_at: string;
  period_start: string;
  period_end: string;
}

interface TimeEntry {
  id: string;
  project_name: string;
  clock_in: string;
  clock_out: string | null;
  hours: string;
  regularHours: string;
  overtimeHours: string;
}

interface PTORequest {
  id: string;
  start_date: string;
  end_date: string;
  type: string;
  status: string;
  created_at: string;
}

interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  current_rate: number;
}

// ─── Main Component ──────────────────────────────────────────────
export default function EmployeePortal() {
  const token = localStorage.getItem('token') || '';
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ── Profile ──
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // ── Pay Stubs ──
  const [payStubs, setPayStubs] = useState<PayStub[]>([]);

  // ── Time Entries ──
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);

  // ── PTO ──
  const [ptoRequests, setPtoRequests] = useState<PTORequest[]>([]);

  // ── Fetch Functions ──
  const fetchProfile = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        // Get current rate
        const rateRes = await fetch(`${API_BASE}/api/payroll/employees/compensation`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const rateData = await rateRes.json();
        let currentRate = 0;
        if (rateData.success && rateData.employees) {
          const me = rateData.employees.find((e: any) => e.id === data.user.id);
          if (me) currentRate = me.current_rate || 0;
        }
        setProfile({ ...data.user, current_rate: currentRate });
      }
    } catch (e) { console.error(e); }
  };

  const fetchPayStubs = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/pay-stubs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setPayStubs(data.payStubs);
    } catch (e) { console.error(e); }
  };

  const fetchTimeEntries = async () => {
    try {
      const end = new Date().toISOString().split('T')[0];
      const start = new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
      const res = await fetch(`${API_BASE}/api/time-entries?userId=${profile?.id}&start=${start}&end=${end}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setTimeEntries(data.entries || []);
    } catch (e) { console.error(e); }
  };

  const fetchPTO = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/pto`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setPtoRequests(data.requests || []);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await fetchProfile();
      await fetchPayStubs();
      await fetchPTO();
      setLoading(false);
    };
    loadData();
  }, []);

  // When profile loads, fetch time entries
  useEffect(() => {
    if (profile?.id) {
      fetchTimeEntries();
    }
  }, [profile]);

  // ── Handlers ──
  const downloadPayStub = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/pay-stubs/${id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `paystub_${id}.pdf`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (e) {
      alert('Failed to download pay stub');
    }
  };

  // ── Render Helpers ──
  const getStatusChip = (status: string) => {
    const map: Record<string, any> = {
      pending: { color: 'warning', label: 'Pending' },
      approved: { color: 'success', label: 'Approved' },
      rejected: { color: 'error', label: 'Rejected' },
    };
    return <Chip label={map[status]?.label || status} color={map[status]?.color || 'default'} size="small" />;
  };

  // ── Tabs ────────────────────────────────────────────────────────
  const renderProfile = () => (
    <Box>
      <Typography variant="h5" sx={{ color: '#FFF', mb: 2 }}>My Profile</Typography>
      <Paper sx={{ p: 3, bgcolor: '#1A1A1A', border: '1px solid #333' }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Typography variant="body2" sx={{ color: '#888' }}>Name</Typography>
            <Typography variant="h6" sx={{ color: '#FFF' }}>{profile?.first_name} {profile?.last_name}</Typography>
          </Grid>
          <Grid item xs={12} md={6}>
            <Typography variant="body2" sx={{ color: '#888' }}>Email</Typography>
            <Typography variant="h6" sx={{ color: '#FFF' }}>{profile?.email}</Typography>
          </Grid>
          <Grid item xs={12} md={6}>
            <Typography variant="body2" sx={{ color: '#888' }}>Role</Typography>
            <Typography variant="h6" sx={{ color: '#FFF' }}>{profile?.role || 'Employee'}</Typography>
          </Grid>
          <Grid item xs={12} md={6}>
            <Typography variant="body2" sx={{ color: '#888' }}>Current Hourly Rate</Typography>
            <Typography variant="h6" sx={{ color: '#00D4FF' }}>${profile?.current_rate?.toFixed(2) || '0.00'}/hr</Typography>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );

  const renderPayStubs = () => (
    <Box>
      <Typography variant="h5" sx={{ color: '#FFF', mb: 2 }}>Pay Stubs</Typography>
      <TableContainer component={Paper} sx={{ bgcolor: '#1A1A1A', border: '1px solid #333' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: '#FFF' }}>Period</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Generated</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {payStubs.map((stub) => (
              <TableRow key={stub.id} sx={{ borderBottom: '1px solid #333' }}>
                <TableCell sx={{ color: '#FFF' }}>
                  {stub.period_start} – {stub.period_end}
                </TableCell>
                <TableCell sx={{ color: '#FFF' }}>
                  {new Date(stub.generated_at).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Button
                    size="small"
                    startIcon={<Download />}
                    onClick={() => downloadPayStub(stub.id)}
                    sx={{ color: '#00D4FF' }}
                  >
                    PDF
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {payStubs.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} sx={{ color: '#888', textAlign: 'center', py: 3 }}>
                  No pay stubs available.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );

  const renderTimeEntries = () => (
    <Box>
      <Typography variant="h5" sx={{ color: '#FFF', mb: 2 }}>Recent Time Entries (Last 30 Days)</Typography>
      <TableContainer component={Paper} sx={{ bgcolor: '#1A1A1A', border: '1px solid #333' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: '#FFF' }}>Date</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Project</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Clock In</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Clock Out</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Hours</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Overtime</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {timeEntries.map((entry) => (
              <TableRow key={entry.id} sx={{ borderBottom: '1px solid #333' }}>
                <TableCell sx={{ color: '#FFF' }}>{new Date(entry.clock_in).toLocaleDateString()}</TableCell>
                <TableCell sx={{ color: '#FFF' }}>{entry.project_name || '—'}</TableCell>
                <TableCell sx={{ color: '#FFF' }}>{new Date(entry.clock_in).toLocaleTimeString()}</TableCell>
                <TableCell sx={{ color: '#FFF' }}>
                  {entry.clock_out ? new Date(entry.clock_out).toLocaleTimeString() : 'Active'}
                </TableCell>
                <TableCell sx={{ color: '#FFF' }}>{entry.hours || '0.00'}</TableCell>
                <TableCell sx={{ color: '#FFF' }}>{entry.overtimeHours || '0.00'}</TableCell>
              </TableRow>
            ))}
            {timeEntries.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} sx={{ color: '#888', textAlign: 'center', py: 3 }}>
                  No time entries in the last 30 days.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );

  const renderPTO = () => (
    <Box>
      <Typography variant="h5" sx={{ color: '#FFF', mb: 2 }}>PTO Requests</Typography>
      <TableContainer component={Paper} sx={{ bgcolor: '#1A1A1A', border: '1px solid #333' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: '#FFF' }}>Type</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Start</TableCell>
              <TableCell sx={{ color: '#FFF' }}>End</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Status</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Submitted</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {ptoRequests.map((req) => (
              <TableRow key={req.id} sx={{ borderBottom: '1px solid #333' }}>
                <TableCell sx={{ color: '#FFF' }}>{req.type || 'Vacation'}</TableCell>
                <TableCell sx={{ color: '#FFF' }}>{req.start_date}</TableCell>
                <TableCell sx={{ color: '#FFF' }}>{req.end_date}</TableCell>
                <TableCell>{getStatusChip(req.status)}</TableCell>
                <TableCell sx={{ color: '#FFF' }}>{new Date(req.created_at).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
            {ptoRequests.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} sx={{ color: '#888', textAlign: 'center', py: 3 }}>
                  No PTO requests found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );

  // ─── Main Render ────────────────────────────────────────────────
  if (loading) {
    return (
      <Container maxWidth="xl" sx={{ py: 4, bgcolor: '#0A0A0A', minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <CircularProgress sx={{ color: '#00D4FF' }} />
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4, bgcolor: '#0A0A0A', minHeight: '100vh' }}>
      <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold', mb: 1 }}>
        👤 Employee Portal
      </Typography>
      <Typography variant="body1" sx={{ color: '#888', mb: 3 }}>
        Your profile, pay stubs, time entries, and PTO requests.
      </Typography>

      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{ mb: 3, borderBottom: '1px solid #333' }}
        textColor="primary"
        indicatorColor="primary"
      >
        <Tab label="Profile" icon={<Person />} iconPosition="start" />
        <Tab label="Pay Stubs" icon={<Receipt />} iconPosition="start" />
        <Tab label="Time Entries" icon={<AccessTime />} iconPosition="start" />
        <Tab label="PTO" icon={<BeachAccess />} iconPosition="start" />
      </Tabs>

      {activeTab === 0 && renderProfile()}
      {activeTab === 1 && renderPayStubs()}
      {activeTab === 2 && renderTimeEntries()}
      {activeTab === 3 && renderPTO()}
    </Container>
  );
}
