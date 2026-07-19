import React, { useState, useEffect } from 'react';
import {
  Container, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, Dialog, DialogTitle, DialogContent,
  TextField, Box, Chip, IconButton, CircularProgress,
  Stack,
} from '@mui/material';
import { Add, Delete, CheckCircle, Send } from '@mui/icons-material';

const API_BASE = 'https://future-jobs-pro-ai-production.up.railway.app';

interface Payroll {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  total_hours: number;
  total_pay: number;
  employee_count: number;
  notes: string;
  created_at: string;
}

export default function PayrollPage() {
  const token = localStorage.getItem('token') || '';
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  const fetchPayrolls = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/payroll`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setPayrolls(data.payrolls);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchPayrolls(); }, []);

  const generatePayroll = async () => {
    if (!periodStart || !periodEnd) {
      alert('Please select both start and end dates');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/payroll/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ periodStart, periodEnd }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`Payroll generated! ${data.message}`);
        setDialogOpen(false);
        fetchPayrolls();
      } else {
        alert(data.message || 'Generation failed');
      }
    } catch (e) { alert('Error generating payroll'); }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await fetch(`${API_BASE}/api/payroll/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      fetchPayrolls();
    } catch (e) { alert('Update failed'); }
  };

  const deletePayroll = async (id: string) => {
    if (!window.confirm('Delete this payroll?')) return;
    try {
      await fetch(`${API_BASE}/api/payroll/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchPayrolls();
    } catch (e) { alert('Delete failed'); }
  };

  const getStatusChip = (status: string) => {
    const colors: Record<string, any> = {
      draft: { color: 'default', label: 'Draft' },
      approved: { color: 'primary', label: 'Approved' },
      paid: { color: 'success', label: 'Paid' },
    };
    return <Chip label={colors[status]?.label || status} color={colors[status]?.color || 'default'} size="small" />;
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>;

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ color: '#FFF' }}>💰 Payroll</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => setDialogOpen(true)} sx={{ bgcolor: '#00D4FF', color: '#0A0A0A' }}>
          Generate Payroll
        </Button>
      </Box>

      <TableContainer component={Paper} sx={{ bgcolor: '#1A1A1A', border: '1px solid #333' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: '#FFF' }}>Period</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Employees</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Total Hours</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Total Pay</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Status</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {payrolls.map((p) => (
              <TableRow key={p.id} sx={{ borderBottom: '1px solid #333' }}>
                <TableCell sx={{ color: '#FFF' }}>{p.period_start} → {p.period_end}</TableCell>
                <TableCell sx={{ color: '#FFF' }}>{p.employee_count}</TableCell>
                <TableCell sx={{ color: '#FFF' }}>{p.total_hours.toFixed(2)}h</TableCell>
                <TableCell sx={{ color: '#FFF' }}>${p.total_pay.toFixed(2)}</TableCell>
                <TableCell>{getStatusChip(p.status)}</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={1}>
                    {p.status === 'draft' && (
                      <>
                        <IconButton size="small" onClick={() => updateStatus(p.id, 'approved')} color="primary" title="Approve">
                          <CheckCircle fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => deletePayroll(p.id)} color="error" title="Delete">
                          <Delete fontSize="small" />
                        </IconButton>
                      </>
                    )}
                    {p.status === 'approved' && (
                      <IconButton size="small" onClick={() => updateStatus(p.id, 'paid')} color="success" title="Mark Paid">
                        <Send fontSize="small" />
                      </IconButton>
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
            {payrolls.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} sx={{ color: '#888', textAlign: 'center', py: 3 }}>
                  No payroll records yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Generate Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: '#1A1A1A', color: '#FFF' }}>Generate Payroll</DialogTitle>
        <DialogContent sx={{ bgcolor: '#1A1A1A' }}>
          <TextField
            label="Period Start"
            type="date"
            fullWidth
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ mt: 2, input: { color: '#FFF' }, label: { color: '#888' } }}
          />
          <TextField
            label="Period End"
            type="date"
            fullWidth
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ mt: 2, input: { color: '#FFF' }, label: { color: '#888' } }}
          />
          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={generatePayroll} sx={{ bgcolor: '#00D4FF', color: '#0A0A0A' }}>
              Generate
            </Button>
          </Box>
        </DialogContent>
      </Dialog>
    </Container>
  );
}