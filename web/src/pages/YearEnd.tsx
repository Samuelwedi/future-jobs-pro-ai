import React, { useState, useEffect } from 'react';
import {
  Box, Container, Typography, Paper, Grid, Button, CircularProgress,
  Alert, Chip, Stack, Divider, Select, MenuItem,
  FormControl, InputLabel, TextField,
} from '@mui/material';
import {
  Receipt, Save, Visibility,
} from '@mui/icons-material';

const API_BASE = ((import.meta as any).env.VITE_API_BASE as string) || 'https://future-jobs-pro-ai-production.up.railway.app';

interface Employee {
  id: number;
  first_name: string;
  last_name: string;
  employment_type: string;
  province: string;
}

interface SlipPreview {
  employeeId: number;
  taxYear: number;
  t4Manifest?: any;
  t4aManifest?: any;
  rl1Manifest?: any;
  employerMetrics?: any;
}

export default function YearEnd() {
  const token = localStorage.getItem('token') || '';
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<number | null>(null);
  const [availableForms, setAvailableForms] = useState<string[]>([]);
  const [selectedForm, setSelectedForm] = useState<string>('T4');
  const [taxYear, setTaxYear] = useState<number>(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<SlipPreview | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const darkInputStyle = {
    input: { color: '#FFF' },
    label: { color: '#888' },
    '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } },
  };

  const darkSelectStyle = {
    color: '#FFF',
    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' },
  };

  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/users/company`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.success) {
          // Ensure we map all users, not just Lucy
          setEmployees(data.users.map((u: any) => ({
            id: parseInt(u.id) || 0,
            first_name: u.first_name,
            last_name: u.last_name,
            employment_type: u.employment_type || 'EMPLOYEE',
            province: u.province || '',
          })));
        }
      } catch (e) {
        console.error('Error fetching employees:', e);
      }
    };
    fetchEmployees();
  }, [token]);

  const fetchAvailableForms = async (employeeId: number) => {
    try {
      const res = await fetch(`${API_BASE}/api/year-end/employee/${employeeId}/forms`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setAvailableForms(data.availableForms || []);
        if (data.availableForms.length > 0) {
          setSelectedForm(data.availableForms[0]);
        }
      }
    } catch (e) {
      console.error('Error fetching forms:', e);
    }
  };

  const handleEmployeeChange = (employeeId: number) => {
    setSelectedEmployee(employeeId);
    setPreview(null);
    setSaved(false);
    fetchAvailableForms(employeeId);
  };

  const handlePreview = async () => {
    if (!selectedEmployee || !selectedForm) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/year-end/preview?employeeId=${selectedEmployee}&taxYear=${taxYear}&formType=${selectedForm}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Preview failed');
      setPreview(data.preview);
      setSaved(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedEmployee || !selectedForm) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/year-end/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          employeeId: selectedEmployee,
          taxYear,
          formType: selectedForm,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setSaved(true);
      alert(`${selectedForm} slip finalized and saved!`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const renderManifest = () => {
    if (!preview) return null;

    let manifest: Record<string, string> = {};
    let title = '';

    if (preview.t4Manifest) {
      manifest = preview.t4Manifest;
      title = 'T4 – Statement of Remuneration Paid';
    } else if (preview.t4aManifest) {
      manifest = preview.t4aManifest;
      title = 'T4A – Statement of Pension & Other Income';
    } else if (preview.rl1Manifest) {
      manifest = preview.rl1Manifest;
      title = 'RL-1 – Relevé 1 (Québec)';
    }

    const labelMap: Record<string, string> = {
      box14_employment_income: 'Box 14 – Employment Income',
      box16_cpp_withheld: 'Box 16 – Employee CPP',
      box18_ei_withheld: 'Box 18 – Employee EI',
      box22_income_tax_withheld: 'Box 22 – Income Tax',
      box24_insurable_earnings: 'Box 24 – EI Insurable Earnings',
      box26_pensionable_earnings: 'Box 26 – CPP Pensionable Earnings',
      box44_union_dues: 'Box 44 – Union Dues',
      box46_charitable_donations: 'Box 46 – Charitable Donations',
      box52_pension_adjustment: 'Box 52 – Pension Adjustment',
      box020_self_employed_fees: 'Box 020 – Self‑Employed Fees',
      box022_income_tax_withheld: 'Box 022 – Income Tax Withheld',
      box_a_employment_income: 'Box A – Employment Income',
      box_b_qpp_contribution: 'Box B – QPP Contribution',
      box_c_qpip_premium: 'Box C – QPIP Premium',
      box_e_quebec_tax_withheld: 'Box E – Quebec Tax Withheld',
      box_g_pensionable_earnings: 'Box G – Pensionable Earnings',
      box_i_insurable_earnings: 'Box I – Insurable Earnings',
    };

    return (
      <Box>
        <Typography variant="h6" sx={{ color: '#00D4FF', mb: 2 }}>{title}</Typography>
        <Grid container spacing={2}>
          {Object.entries(manifest).map(([key, value]) => (
            <Grid item xs={12} md={6} key={key}>
              <Paper sx={{ p: 2, bgcolor: '#0A0A0A', border: '1px solid #333' }}>
                <Typography variant="caption" sx={{ color: '#888' }}>
                  {labelMap[key] || key.replace(/_/g, ' ').toUpperCase()}
                </Typography>
                <Typography variant="h6" sx={{ color: '#FFF' }}>${value}</Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>

        {preview.employerMetrics && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" sx={{ color: '#888', mb: 1 }}>
              Employer Contributions
            </Typography>
            <Grid container spacing={2}>
              {Object.entries(preview.employerMetrics).map(([key, value]) => (
                <Grid item xs={12} md={6} key={key}>
                  <Paper sx={{ p: 2, bgcolor: '#0A0A0A', border: '1px solid #333' }}>
                    <Typography variant="caption" sx={{ color: '#888' }}>
                      {key.replace(/_/g, ' ').toUpperCase()}
                    </Typography>
                    <Typography variant="h6" sx={{ color: '#4CAF50' }}>${String(value)}</Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Box>
        )}

        {saved && (
          <Alert severity="success" sx={{ mt: 2 }}>
            ✅ This slip has been finalized and locked in the ledger.
          </Alert>
        )}
      </Box>
    );
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4, bgcolor: '#0A0A0A', minHeight: '100vh' }}>
      <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold', mb: 1 }}>
        📄 Year‑End Tax Forms
      </Typography>
      <Typography variant="body1" sx={{ color: '#888', mb: 4 }}>
        Generate, preview, and finalize T4, T4A, and RL‑1 slips for employees and contractors.
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, bgcolor: '#1A1A1A', border: '1px solid #333' }}>
            <Typography variant="h6" sx={{ color: '#FFF', mb: 2 }}>Select Employee</Typography>

            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel sx={{ color: '#888' }}>Employee</InputLabel>
              <Select
                value={selectedEmployee !== null ? selectedEmployee : ''}
                onChange={(e) => handleEmployeeChange(Number(e.target.value))}
                sx={darkSelectStyle}
              >
                {employees.map((emp) => (
                  <MenuItem key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name}
                    <Chip
                      size="small"
                      label={emp.employment_type === 'CONTRACTOR' ? 'Contractor' : 'Employee'}
                      sx={{ ml: 1, bgcolor: emp.employment_type === 'CONTRACTOR' ? '#FF980020' : '#00D4FF20', color: emp.employment_type === 'CONTRACTOR' ? '#FF9800' : '#00D4FF' }}
                    />
                    {emp.province === 'QC' && (
                      <Chip size="small" label="QC" sx={{ ml: 1, bgcolor: '#4CAF5020', color: '#4CAF50' }} />
                    )}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {availableForms.length > 0 && (
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel sx={{ color: '#888' }}>Form Type</InputLabel>
                <Select
                  value={selectedForm}
                  onChange={(e) => setSelectedForm(e.target.value)}
                  sx={darkSelectStyle}
                >
                  {availableForms.map((form) => (
                    <MenuItem key={form} value={form}>
                      {form === 'T4' && 'T4 – Employee'}
                      {form === 'T4A' && 'T4A – Contractor'}
                      {form === 'RL1' && 'RL-1 – Québec'}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            <TextField
              label="Tax Year"
              type="number"
              fullWidth
              value={taxYear}
              onChange={(e) => setTaxYear(Number(e.target.value))}
              sx={{ mb: 2, ...darkInputStyle }}
            />

            <Stack direction="row" spacing={2}>
              <Button
                variant="contained"
                startIcon={<Visibility />}
                onClick={handlePreview}
                disabled={!selectedEmployee || selectedEmployee <= 0 || loading}
                sx={{
                  backgroundColor: '#FFFFFF',
                  color: '#000000',
                  border: '2px solid #333333',
                  '&:hover': { backgroundColor: '#F0F0F0' },
                  flex: 1
                }}
              >
                Preview
              </Button>
              <Button
                variant="contained"
                startIcon={<Save />}
                onClick={handleSave}
                disabled={!preview || saved || loading}
                sx={{
                  backgroundColor: '#FFFFFF',
                  color: '#000000',
                  border: '2px solid #333333',
                  '&:hover': { backgroundColor: '#F0F0F0' },
                  flex: 1
                }}
              >
                Finalize
              </Button>
            </Stack>

            {loading && <CircularProgress sx={{ color: '#00D4FF', mt: 2 }} />}
            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
          </Paper>
        </Grid>

        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3, bgcolor: '#1A1A1A', border: '1px solid #333', minHeight: 400 }}>
            {preview ? (
              renderManifest()
            ) : (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400, color: '#888' }}>
                <Box sx={{ textAlign: 'center' }}>
                  <Receipt sx={{ fontSize: 64, color: '#333' }} />
                  <Typography variant="h6" sx={{ mt: 2 }}>Select an employee and click Preview</Typography>
                  <Typography variant="body2">Tax forms will appear here</Typography>
                </Box>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
}