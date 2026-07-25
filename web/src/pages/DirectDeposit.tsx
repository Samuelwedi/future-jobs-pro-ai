import React, { useState, useEffect } from 'react';
// declare minimal process.env shape so TypeScript doesn't error in the browser build
declare const process: { env?: { REACT_APP_API_BASE?: string } };
import {
  Box, Container, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, CircularProgress, Stack, Alert, TextField,
  Dialog, DialogTitle, DialogContent, Grid, IconButton, Chip, Select, MenuItem,
  FormControl, InputLabel,
} from '@mui/material';
import { Download, Edit, Save, Cancel } from '@mui/icons-material';

const API_BASE = process.env?.REACT_APP_API_BASE || 'https://future-jobs-pro-ai-production.up.railway.app';

interface EmployeeBank {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  bank_routing_number: string;
  bank_account_number: string;
  bank_account_type: string;
  bank_account_holder: string;
}

export default function DirectDepositPage() {
  const token = localStorage.getItem('token') || '';
  const [employees, setEmployees] = useState<EmployeeBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<EmployeeBank>>({});
  const [payrolls, setPayrolls] = useState<any[]>([]);
  const [selectedPayrollId, setSelectedPayrollId] = useState('');

  const darkInputStyle = {
    input: { color: '#FFF' },
    label: { color: '#888' },
    '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } },
  };

  const darkSelectStyle = {
    color: '#FFF',
    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' },
  };

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/direct-deposit/employees`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setEmployees(data.employees || []);
      else setError(data.message || 'Failed to load employees');
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  const fetchPayrolls = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/payroll`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setPayrolls(data.payrolls);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    fetchEmployees();
    fetchPayrolls();
  }, []);

  const startEdit = (emp: EmployeeBank) => {
    setEditingId(emp.id);
    setEditForm({
      bank_routing_number: emp.bank_routing_number || '',
      bank_account_number: emp.bank_account_number || '',
      bank_account_type: emp.bank_account_type || 'checking',
      bank_account_holder: emp.bank_account_holder || `${emp.first_name} ${emp.last_name}`,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveBankDetails = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/direct-deposit/employee/${id}/bank`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (data.success) {
        setEditingId(null);
        setEditForm({});
        fetchEmployees();
      } else {
        alert(data.message || 'Save failed');
      }
    } catch (e) { alert('Error saving bank details'); }
  };

  const generateNacha = async () => {
    if (!selectedPayrollId) {
      alert('Please select a payroll');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/direct-deposit/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ payrollId: selectedPayrollId }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        alert(errorData.message || 'Generation failed');
        return;
      }
      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `nacha_payroll_${selectedPayrollId}.txt`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (e) {
      alert('Error generating NACHA file');
    }
  };

  const hasBankDetails = (emp: EmployeeBank) => {
    return emp.bank_routing_number && emp.bank_account_number;
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4, bgcolor: '#0A0A0A', minHeight: '100vh' }}>
      <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold', mb: 1 }}>
        💰 Direct Deposit
      </Typography>
      <Typography variant="body1" sx={{ color: '#888', mb: 3 }}>
        Manage employee bank details and generate NACHA files for payroll.
      </Typography>

      <Paper sx={{ p: 3, bgcolor: '#1A1A1A', border: '1px solid #333', mb: 3 }}>
        <Typography variant="h6" sx={{ color: '#FFF', mb: 2 }}>Generate NACHA File</Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <FormControl sx={{ minWidth: 250, flex: 1 }}>
            <InputLabel sx={{ color: '#888' }}>Select Payroll</InputLabel>
            <Select
              value={selectedPayrollId}
              onChange={(e) => setSelectedPayrollId(e.target.value)}
              sx={darkSelectStyle}
            >
              <MenuItem value="">Select a payroll</MenuItem>
              {payrolls.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.period_start} – {p.period_end} (${Number(p.total_pay).toFixed(2)})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            variant="contained"
            startIcon={<Download />}
            onClick={generateNacha}
            disabled={!selectedPayrollId}
            sx={{ bgcolor: '#00D4FF', color: '#0A0A0A' }}
          >
            Generate NACHA
          </Button>
        </Box>
        <Typography variant="body2" sx={{ color: '#888', mt: 2 }}>
          This generates a standard NACHA ACH file. Upload it to your bank's online portal to initiate direct deposits.
        </Typography>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <TableContainer component={Paper} sx={{ bgcolor: '#1A1A1A', border: '1px solid #333' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: '#888' }}>Employee</TableCell>
              <TableCell sx={{ color: '#888' }}>Routing Number</TableCell>
              <TableCell sx={{ color: '#888' }}>Account Number</TableCell>
              <TableCell sx={{ color: '#888' }}>Account Type</TableCell>
              <TableCell sx={{ color: '#888' }}>Account Holder</TableCell>
              <TableCell sx={{ color: '#888' }}>Status</TableCell>
              <TableCell sx={{ color: '#888' }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} sx={{ textAlign: 'center', py: 3 }}><CircularProgress sx={{ color: '#00D4FF' }} /></TableCell></TableRow>
            ) : employees.length === 0 ? (
              <TableRow><TableCell colSpan={7} sx={{ color: '#888', textAlign: 'center', py: 3 }}>No employees found.</TableCell></TableRow>
            ) : (
              employees.map((emp) => (
                <TableRow key={emp.id} sx={{ borderBottom: '1px solid #333' }}>
                  <TableCell sx={{ color: '#FFF' }}>{emp.first_name} {emp.last_name}</TableCell>
                  {editingId === emp.id ? (
                    <>
                      <TableCell>
                        <TextField
                          size="small"
                          value={editForm.bank_routing_number || ''}
                          onChange={(e) => setEditForm({ ...editForm, bank_routing_number: e.target.value })}
                          sx={{ input: { color: '#FFF' }, width: 120 }}
                          placeholder="Routing #"
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          value={editForm.bank_account_number || ''}
                          onChange={(e) => setEditForm({ ...editForm, bank_account_number: e.target.value })}
                          sx={{ input: { color: '#FFF' }, width: 140 }}
                          placeholder="Account #"
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={editForm.bank_account_type || 'checking'}
                          onChange={(e) => setEditForm({ ...editForm, bank_account_type: e.target.value })}
                          sx={darkSelectStyle}
                          size="small"
                        >
                          <MenuItem value="checking">Checking</MenuItem>
                          <MenuItem value="savings">Savings</MenuItem>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          value={editForm.bank_account_holder || ''}
                          onChange={(e) => setEditForm({ ...editForm, bank_account_holder: e.target.value })}
                          sx={{ input: { color: '#FFF' }, width: 180 }}
                          placeholder="Account Holder Name"
                        />
                      </TableCell>
                      <TableCell>
                        <Chip label="Editing" size="small" color="warning" />
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1}>
                          <IconButton size="small" onClick={() => saveBankDetails(emp.id)} color="success">
                            <Save fontSize="small" />
                          </IconButton>
                          <IconButton size="small" onClick={cancelEdit} color="error">
                            <Cancel fontSize="small" />
                          </IconButton>
                        </Stack>
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell sx={{ color: '#FFF' }}>{emp.bank_routing_number || '—'}</TableCell>
                      <TableCell sx={{ color: '#FFF' }}>
                        {emp.bank_account_number ? '****' + emp.bank_account_number.slice(-4) : '—'}
                      </TableCell>
                      <TableCell sx={{ color: '#FFF' }}>{emp.bank_account_type || '—'}</TableCell>
                      <TableCell sx={{ color: '#FFF' }}>{emp.bank_account_holder || '—'}</TableCell>
                      <TableCell>
                        <Chip
                          label={hasBankDetails(emp) ? 'Ready' : 'Missing Info'}
                          size="small"
                          color={hasBankDetails(emp) ? 'success' : 'error'}
                        />
                      </TableCell>
                      <TableCell>
                        <IconButton size="small" onClick={() => startEdit(emp)} color="primary">
                          <Edit fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Container>
  );
}