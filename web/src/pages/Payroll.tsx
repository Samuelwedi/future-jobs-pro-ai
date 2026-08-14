import React, { useState, useEffect } from 'react';
import {
  Box, Container, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, Dialog, DialogTitle, DialogContent,
  TextField, Chip, IconButton, CircularProgress, Stack, Tabs, Tab,
  Alert, Grid, Card, CardContent, Select, MenuItem, FormControl, InputLabel,
  Switch, FormControlLabel, Divider, InputAdornment,
  Menu, ListItemIcon, ListItemText, Checkbox, ListItemText as MuiListItemText,
} from '@mui/material';
import {
  Add, Delete, CheckCircle, Send, Edit, Refresh, AttachMoney,
  TrendingUp, TrendingDown, People, Schedule, Settings,
  Download, PictureAsPdf, Description, TableChart,
  FilePresent, Visibility, FilterList, Close, PlayArrow,
} from '@mui/icons-material';
import { API_BASE } from '../services/api';
// ─── Types ────────────────────────────────────────────────────────
interface Payroll {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  total_hours: number | string;
  total_pay: number | string;
  employee_count: number | string;
  notes: string;
  created_at: string;
}

interface PayrollItem {
  id: string;
  employee_id: string;
  employee_name: string;
  hours: number | string;
  hourly_rate: number | string;
  pay: number | string;
  adjustments: number | string;
  final_pay: number | string;
  notes: string;
  cpp_deduction: number | string;
  ei_deduction: number | string;
  tax_deduction: number | string;
  vacation_hours: number | string;
  banked_hours: number | string;
}

interface EmployeeCompensation {
  id: string;
  first_name: string;
  last_name: string;
  current_rate: number | string;
  history: { effective_date: string; hourly_rate: number | string }[];
}

interface CompanySettings {
  payroll_schedule: 'weekly' | 'biweekly' | 'monthly' | null;
  payroll_day: number;
  payroll_time: string;
  default_hourly_rate: number;
  overtime_multiplier: number;
  tax_rate: number;
}

interface EmployeeSimple {
  id: number;
  first_name: string;
  last_name: string;
}

interface RunPayrollResult {
  netPayout: string;
  breakdown: {
    employeeWithholdings: Record<string, string>;
    employerContributions: Record<string, string>;
  };
}

// ─── Main Component ──────────────────────────────────────────────
export default function PayrollPage() {
  const token = localStorage.getItem('token') || '';
  const [activeTab, setActiveTab] = useState(0);

  // ── Existing State ──
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [selectedPayroll, setSelectedPayroll] = useState<Payroll | null>(null);
  const [payrollItems, setPayrollItems] = useState<PayrollItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [employeeRateOverrides, setEmployeeRateOverrides] = useState<Record<string, number | null>>({});
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);

  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('all');

  const [exportAnchorEl, setExportAnchorEl] = useState<null | HTMLElement>(null);
  const exportOpen = Boolean(exportAnchorEl);

  const [compEmployees, setCompEmployees] = useState<EmployeeCompensation[]>([]);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [raiseType, setRaiseType] = useState<'percentage' | 'fixed'>('percentage');
  const [raiseValue, setRaiseValue] = useState(5);
  const [effectiveDate, setEffectiveDate] = useState('');
  const [compLoading, setCompLoading] = useState(false);

  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);

  const [scenarioType, setScenarioType] = useState<'raise_percent' | 'raise_fixed' | 'hire_count'>('raise_percent');
  const [scenarioValue, setScenarioValue] = useState(5);
  const [scenarioResult, setScenarioResult] = useState<any>(null);
  const [whatIfLoading, setWhatIfLoading] = useState(false);

  // ── Run Payroll State ──
  const [runEmployees, setRunEmployees] = useState<EmployeeSimple[]>([]);
  const [runEmployeeId, setRunEmployeeId] = useState<number>(0);
  const [runGrossPay, setRunGrossPay] = useState<number>(3000);
  const [runTaxYear, setRunTaxYear] = useState<number>(2026);
  const [runLoading, setRunLoading] = useState(false);
  const [runResult, setRunResult] = useState<RunPayrollResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  // ── Fetch Functions ──
  const fetchPayrolls = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/payroll`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setPayrolls(data.payrolls);
      else setError(data.message || 'Failed to load payrolls');
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  const fetchPayrollDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/payroll/${id}?_=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setPayrollItems(data.items || []);
        setSelectedPayroll(data.payroll);
        setDetailDialogOpen(true);
      }
    } catch (e) { console.error(e); }
    setDetailLoading(false);
  };

  const fetchEmployees = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/users/company`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        const users = data.users || [];
        setEmployees(users.map((u: any) => ({ id: u.id, name: `${u.first_name} ${u.last_name}` })));
        setRunEmployees(users.map((u: any) => ({ id: parseInt(u.id) || 0, first_name: u.first_name, last_name: u.last_name })));
      }
    } catch (e) { console.error(e); }
  };

  const fetchCompEmployees = async () => {
    setCompLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/payroll/employees/compensation`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setCompEmployees(data.employees);
    } catch (e) { console.error(e); }
    setCompLoading(false);
  };

  const fetchSettings = async () => {
    setSettingsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/payroll/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setSettings(data.settings);
    } catch (e) { console.error(e); }
    setSettingsLoading(false);
  };

  useEffect(() => {
    fetchPayrolls();
    fetchEmployees();
    fetchCompEmployees();
    fetchSettings();
  }, []);

  // ── Handlers ──
  const handleGenerate = async () => {
    if (!periodStart || !periodEnd) {
      alert('Please select both start and end dates');
      return;
    }

    const targetEmployees = selectedEmployeeIds.length > 0
      ? employees.filter(e => selectedEmployeeIds.includes(e.id))
      : employees;

    const employeeRates = targetEmployees
      .map(emp => {
        const override = employeeRateOverrides[emp.id];
        if (override !== null && override !== undefined && override > 0) {
          return { employeeId: emp.id, hourlyRate: override };
        }
        const comp = compEmployees.find(c => c.id === emp.id);
        const currentRate = comp?.current_rate || 0;
        return { employeeId: emp.id, hourlyRate: Number(currentRate) };
      })
      .filter(r => r.hourlyRate > 0);

    if (employeeRates.length === 0) {
      alert('No employees selected with valid rates.');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/payroll/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ periodStart, periodEnd, employeeRates }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`✅ ${data.message}`);
        setDialogOpen(false);
        setEmployeeRateOverrides({});
        setSelectedEmployeeIds([]);
        fetchPayrolls();
      } else {
        alert(data.message || 'Generation failed');
      }
    } catch (e) { alert('Error generating payroll'); }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      await fetch(`${API_BASE}/api/payroll/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      fetchPayrolls();
    } catch (e) { alert('Update failed'); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this payroll?')) return;
    try {
      await fetch(`${API_BASE}/api/payroll/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchPayrolls();
    } catch (e) { alert('Delete failed'); }
  };

  const handleExport = async (format: 'pdf' | 'excel' | 'csv' | 'word') => {
    try {
      const employeeParam = selectedEmployeeId !== 'all' ? `&employeeId=${selectedEmployeeId}` : '';
      const url = `${API_BASE}/api/payroll/export?format=${format}&start=${periodStart || 'all'}&end=${periodEnd || 'all'}${employeeParam}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      const extension = format === 'pdf' ? 'pdf' : format === 'excel' ? 'xlsx' : format === 'word' ? 'docx' : 'csv';
      link.download = `payroll_${new Date().toISOString().split('T')[0]}.${extension}`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (e) {
      alert('Export failed. Please try again.');
    }
    setExportAnchorEl(null);
  };

  const handleExportPayStub = async (itemId: string, employeeName: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/payroll/paystub/${itemId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Pay stub generation failed');
      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `paystub_${employeeName.replace(/\s/g, '_')}.pdf`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (e) {
      alert('Could not download pay stub');
    }
  };

  const getStatusChip = (status: string) => {
    const map: Record<string, any> = {
      draft: { color: 'default', label: 'Draft' },
      approved: { color: 'primary', label: 'Approved' },
      paid: { color: 'success', label: 'Paid' },
    };
    return <Chip label={map[status]?.label || status} color={map[status]?.color || 'default'} size="small" />;
  };

  const handleRowClick = async (payroll: Payroll) => {
    await fetchPayrollDetail(payroll.id);
  };

  // ── Run Payroll Handler ──
  const handleRunPayroll = async (e: React.FormEvent) => {
    e.preventDefault();
    setRunLoading(true);
    setRunError(null);
    try {
      const res = await fetch(`${API_BASE}/api/payroll/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ employeeId: runEmployeeId, grossEarnings: runGrossPay, taxYear: runTaxYear }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Processing failed');
      setRunResult(data.calculations);
    } catch (err: any) {
      setRunError(err.message);
    } finally {
      setRunLoading(false);
    }
  };

  // ─── Dark theme styles ──────────────────────────────────────────
  const darkInputStyle = {
    input: { color: '#FFF' },
    label: { color: '#888' },
    '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } },
  };

  const darkSelectStyle = {
    color: '#FFF',
    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' },
  };

  // ── Tabs ────────────────────────────────────────────────────────
  const renderOverview = () => (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="h5" sx={{ color: '#FFF' }}>Payroll Runs</Typography>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel sx={{ color: '#888' }}>Filter Employee</InputLabel>
            <Select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              sx={darkSelectStyle}
            >
              <MenuItem value="all">All Employees</MenuItem>
              {employees.map(e => (
                <MenuItem key={e.id} value={e.id}>{e.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<Download />}
            onClick={(e) => setExportAnchorEl(e.currentTarget)}
            sx={{ color: '#00D4FF', borderColor: '#00D4FF' }}
          >
            Export
          </Button>
          <Button variant="contained" startIcon={<Add />} onClick={() => { setDialogOpen(true); }} sx={{ bgcolor: '#00D4FF', color: '#0A0A0A' }}>
            Generate Payroll
          </Button>
        </Box>
      </Box>

      <Menu
        anchorEl={exportAnchorEl}
        open={exportOpen}
        onClose={() => setExportAnchorEl(null)}
        PaperProps={{ sx: { bgcolor: '#1A1A1A', border: '1px solid #333' } }}
      >
        <MenuItem onClick={() => handleExport('pdf')} sx={{ color: '#FFF' }}>
          <ListItemIcon><PictureAsPdf fontSize="small" sx={{ color: '#F44336' }} /></ListItemIcon>
          <ListItemText>Export as PDF</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleExport('excel')} sx={{ color: '#FFF' }}>
          <ListItemIcon><TableChart fontSize="small" sx={{ color: '#4CAF50' }} /></ListItemIcon>
          <ListItemText>Export as Excel</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleExport('csv')} sx={{ color: '#FFF' }}>
          <ListItemIcon><Description fontSize="small" sx={{ color: '#00D4FF' }} /></ListItemIcon>
          <ListItemText>Export as CSV</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleExport('word')} sx={{ color: '#FFF' }}>
          <ListItemIcon><FilePresent fontSize="small" sx={{ color: '#2196F3' }} /></ListItemIcon>
          <ListItemText>Export as Word</ListItemText>
        </MenuItem>
      </Menu>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <TableContainer component={Paper} sx={{ bgcolor: '#1A1A1A', border: '1px solid #333' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: '#888' }}>Period</TableCell>
              <TableCell sx={{ color: '#888' }}>Employees</TableCell>
              <TableCell sx={{ color: '#888' }}>Total Hours</TableCell>
              <TableCell sx={{ color: '#888' }}>Gross Pay</TableCell>
              <TableCell sx={{ color: '#888' }}>Status</TableCell>
              <TableCell sx={{ color: '#888' }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {payrolls.map((p) => (
              <TableRow
                key={p.id}
                sx={{
                  borderBottom: '1px solid #333',
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' },
                }}
                onClick={() => handleRowClick(p)}
              >
                <TableCell sx={{ color: '#FFF' }}>{p.period_start} → {p.period_end}</TableCell>
                <TableCell sx={{ color: '#FFF' }}>{Number(p.employee_count) || 0}</TableCell>
                <TableCell sx={{ color: '#FFF' }}>{Number(p.total_hours).toFixed(2)}h</TableCell>
                <TableCell sx={{ color: '#FFF' }}>${Number(p.total_pay).toFixed(2)}</TableCell>
                <TableCell>{getStatusChip(p.status)}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Stack direction="row" spacing={1}>
                    {p.status === 'draft' && (
                      <>
                        <IconButton size="small" onClick={() => handleUpdateStatus(p.id, 'approved')} color="primary" title="Approve">
                          <CheckCircle fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => handleDelete(p.id)} color="error" title="Delete">
                          <Delete fontSize="small" />
                        </IconButton>
                      </>
                    )}
                    {p.status === 'approved' && (
                      <IconButton size="small" onClick={() => handleUpdateStatus(p.id, 'paid')} color="success" title="Mark Paid">
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

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ bgcolor: '#1A1A1A', color: '#FFF' }}>Generate Payroll</DialogTitle>
        <DialogContent sx={{ bgcolor: '#1A1A1A' }}>
          <TextField
            label="Period Start"
            type="date"
            fullWidth
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ mt: 2, ...darkInputStyle }}
          />
          <TextField
            label="Period End"
            type="date"
            fullWidth
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ mt: 2, ...darkInputStyle }}
          />
          <Typography variant="subtitle1" sx={{ color: '#FFF', mt: 3, mb: 2 }}>Select Employees</Typography>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel sx={{ color: '#888' }}>Employees</InputLabel>
            <Select
              multiple
              value={selectedEmployeeIds}
              onChange={(e) => setSelectedEmployeeIds(e.target.value as string[])}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((id) => {
                    const emp = employees.find(e => e.id === id);
                    return <Chip key={id} label={emp?.name || id} size="small" />;
                  })}
                </Box>
              )}
              sx={darkSelectStyle}
            >
              {employees.map((emp) => (
                <MenuItem key={emp.id} value={emp.id}>
                  <Checkbox checked={selectedEmployeeIds.indexOf(emp.id) > -1} />
                  <MuiListItemText primary={emp.name} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Typography variant="subtitle1" sx={{ color: '#FFF', mt: 2, mb: 2 }}>Employee Rates (0 = use default)</Typography>
          <TableContainer component={Paper} sx={{ bgcolor: '#0A0A0A', border: '1px solid #333', maxHeight: 300 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ color: '#888' }}>Employee</TableCell>
                  <TableCell sx={{ color: '#888' }}>Rate Override</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(selectedEmployeeIds.length > 0 ? employees.filter(e => selectedEmployeeIds.includes(e.id)) : employees).map((emp) => {
                  const comp = compEmployees.find(c => c.id === emp.id);
                  const currentRate = comp?.current_rate || 0;
                  const override = employeeRateOverrides[emp.id];
                  return (
                    <TableRow key={emp.id} sx={{ borderBottom: '1px solid #333' }}>
                      <TableCell sx={{ color: '#FFF' }}>{emp.name}</TableCell>
                      <TableCell>
                        <TextField
                          type="number"
                          size="small"
                          value={override !== undefined && override !== null ? override : ''}
                          onChange={(e) => {
                            const val = e.target.value ? Number(e.target.value) : null;
                            setEmployeeRateOverrides(prev => ({ ...prev, [emp.id]: val }));
                          }}
                          placeholder="Override"
                          sx={{ input: { color: '#FFF' }, width: 140 }}
                          InputProps={{
                            endAdornment: <InputAdornment position="end" sx={{ color: '#888' }}>/hr</InputAdornment>,
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={handleGenerate} sx={{ bgcolor: '#00D4FF', color: '#0A0A0A' }}>
              Generate
            </Button>
          </Box>
        </DialogContent>
      </Dialog>

      {/* DETAIL DIALOG with Pay Stub Export */}
      <Dialog open={detailDialogOpen} onClose={() => setDetailDialogOpen(false)} maxWidth="lg" fullWidth scroll="paper">
        <DialogTitle sx={{ bgcolor: '#1A1A1A', color: '#FFF' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6" sx={{ fontWeight: 'bold' }}>Payroll Details</Typography>
            <IconButton onClick={() => setDetailDialogOpen(false)} sx={{ color: '#FFF' }}><Close /></IconButton>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ bgcolor: '#0A0A0A' }}>
          {detailLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress sx={{ color: '#00D4FF' }} /></Box>
          ) : selectedPayroll ? (
            <>
              <Paper sx={{ p: 3, bgcolor: '#1A1A1A', border: '1px solid #333', mb: 3 }}>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={3}>
                    <Typography variant="body2" sx={{ color: '#888' }}>Period</Typography>
                    <Typography variant="body1" sx={{ color: '#FFF' }}>
                      {selectedPayroll.period_start} → {selectedPayroll.period_end}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <Typography variant="body2" sx={{ color: '#888' }}>Employees</Typography>
                    <Typography variant="body1" sx={{ color: '#FFF' }}>
                      {Number(selectedPayroll.employee_count) || 0}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <Typography variant="body2" sx={{ color: '#888' }}>Total Hours</Typography>
                    <Typography variant="body1" sx={{ color: '#FFF' }}>
                      {Number(selectedPayroll.total_hours).toFixed(2)}h
                    </Typography>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <Typography variant="body2" sx={{ color: '#888' }}>Total Gross</Typography>
                    <Typography variant="body1" sx={{ color: '#FFF' }}>
                      ${Number(selectedPayroll.total_pay).toFixed(2)}
                    </Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="body2" sx={{ color: '#888' }}>Status</Typography>
                    {getStatusChip(selectedPayroll.status)}
                  </Grid>
                  {selectedPayroll.notes && (
                    <Grid item xs={12}>
                      <Typography variant="body2" sx={{ color: '#888' }}>Notes</Typography>
                      <Typography variant="body2" sx={{ color: '#FFF' }}>{selectedPayroll.notes}</Typography>
                    </Grid>
                  )}
                </Grid>
              </Paper>

              <Typography variant="h6" sx={{ color: '#FFF', mb: 2 }}>Employee Breakdown</Typography>
              <TableContainer component={Paper} sx={{ bgcolor: '#1A1A1A', border: '1px solid #333' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ color: '#888' }}>Employee</TableCell>
                      <TableCell sx={{ color: '#888' }} align="right">Hours</TableCell>
                      <TableCell sx={{ color: '#888' }} align="right">Rate</TableCell>
                      <TableCell sx={{ color: '#888' }} align="right">Gross</TableCell>
                      <TableCell sx={{ color: '#888' }} align="right">Adjustments</TableCell>
                      <TableCell sx={{ color: '#888' }} align="right">CPP</TableCell>
                      <TableCell sx={{ color: '#888' }} align="right">EI</TableCell>
                      <TableCell sx={{ color: '#888' }} align="right">Tax</TableCell>
                      <TableCell sx={{ color: '#888' }} align="right">Net Pay</TableCell>
                      <TableCell sx={{ color: '#888' }} align="right">Vacation</TableCell>
                      <TableCell sx={{ color: '#888' }} align="right">Banked Hours</TableCell>
                      <TableCell sx={{ color: '#888' }} align="right">Pay Stub</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {payrollItems.map((item) => {
                      const hours = Number(item.hours) || 0;
                      const rate = Number(item.hourly_rate) || 0;
                      const grossPay = Number(item.pay) || 0;
                      const adjustments = Number(item.adjustments) || 0;
                      const cpp = Number(item.cpp_deduction) || 0;
                      const ei = Number(item.ei_deduction) || 0;
                      const tax = Number(item.tax_deduction) || 0;
                      const netPay = Number(item.final_pay) || 0;
                      const vacation = Number(item.vacation_hours) || 0;
                      const banked = Number(item.banked_hours) || 0;
                      return (
                        <TableRow key={item.id} sx={{ borderBottom: '1px solid #333' }}>
                          <TableCell sx={{ color: '#FFF' }}>{item.employee_name || 'Unknown'}</TableCell>
                          <TableCell sx={{ color: '#FFF' }} align="right">{hours.toFixed(2)}</TableCell>
                          <TableCell sx={{ color: '#FFF' }} align="right">${rate.toFixed(2)}</TableCell>
                          <TableCell sx={{ color: '#FFF' }} align="right">${grossPay.toFixed(2)}</TableCell>
                          <TableCell sx={{ color: '#FFF' }} align="right">${adjustments.toFixed(2)}</TableCell>
                          <TableCell sx={{ color: '#FFF' }} align="right">${cpp.toFixed(2)}</TableCell>
                          <TableCell sx={{ color: '#FFF' }} align="right">${ei.toFixed(2)}</TableCell>
                          <TableCell sx={{ color: '#FFF' }} align="right">${tax.toFixed(2)}</TableCell>
                          <TableCell sx={{ color: '#00D4FF' }} align="right">${netPay.toFixed(2)}</TableCell>
                          <TableCell sx={{ color: '#FFF' }} align="right">{vacation.toFixed(2)}</TableCell>
                          <TableCell sx={{ color: '#FFF' }} align="right">{banked.toFixed(2)}</TableCell>
                          <TableCell>
                            <Button
                              size="small"
                              startIcon={<PictureAsPdf />}
                              onClick={() => handleExportPayStub(item.id, item.employee_name || 'Employee')}
                              sx={{ color: '#00D4FF' }}
                            >
                              PDF
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {payrollItems.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={12} sx={{ color: '#888', textAlign: 'center', py: 3 }}>No employees in this payroll.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          ) : (
            <Alert severity="info">No payroll selected.</Alert>
          )}
        </DialogContent>
      </Dialog>
    </>
  );

  const renderCompensation = () => (
    <Box>
      <Typography variant="h5" sx={{ color: '#FFF', mb: 2 }}>Employee Compensation</Typography>
      <Typography variant="body2" sx={{ color: '#888', mb: 3 }}>View and update hourly rates. Select employees to apply a raise.</Typography>
      <Paper sx={{ p: 3, bgcolor: '#1A1A1A', border: '1px solid #333', mb: 3 }}>
        <Typography variant="subtitle1" sx={{ color: '#FFF', mb: 2 }}>Apply Raise to Selected Employees</Typography>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel sx={{ color: '#888' }}>Raise Type</InputLabel>
              <Select
                value={raiseType}
                onChange={(e) => setRaiseType(e.target.value as 'percentage' | 'fixed')}
                sx={darkSelectStyle}
              >
                <MenuItem value="percentage">Percentage</MenuItem>
                <MenuItem value="fixed">Fixed ($)</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={3}>
            <TextField
              type="number"
              label={raiseType === 'percentage' ? 'Percent' : 'Amount'}
              value={raiseValue}
              onChange={(e) => setRaiseValue(Number(e.target.value))}
              size="small"
              fullWidth
              sx={darkInputStyle}
            />
          </Grid>
          <Grid item xs={12} md={3}>
            <TextField
              type="date"
              label="Effective Date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              size="small"
              fullWidth
              InputLabelProps={{ shrink: true }}
              sx={darkInputStyle}
            />
          </Grid>
          <Grid item xs={12} md={3}>
            <Button
              variant="contained"
              onClick={handleApplyRaise}
              disabled={selectedEmployees.length === 0}
              sx={{ bgcolor: '#00D4FF', color: '#0A0A0A', width: '100%' }}
            >
              Apply Raise ({selectedEmployees.length})
            </Button>
          </Grid>
        </Grid>
      </Paper>
      {compLoading ? (
        <CircularProgress sx={{ color: '#00D4FF' }} />
      ) : (
        <TableContainer component={Paper} sx={{ bgcolor: '#1A1A1A', border: '1px solid #333' }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ color: '#888' }}>Select</TableCell>
                <TableCell sx={{ color: '#888' }}>Employee</TableCell>
                <TableCell sx={{ color: '#888' }}>Current Rate</TableCell>
                <TableCell sx={{ color: '#888' }}>History</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {compEmployees.map((emp) => (
                <TableRow key={emp.id} sx={{ borderBottom: '1px solid #333' }}>
                  <TableCell>
                    <Switch
                      checked={selectedEmployees.includes(emp.id)}
                      onChange={() => {
                        setSelectedEmployees(prev =>
                          prev.includes(emp.id) ? prev.filter(id => id !== emp.id) : [...prev, emp.id]
                        );
                      }}
                      sx={{ color: '#00D4FF' }}
                    />
                  </TableCell>
                  <TableCell sx={{ color: '#FFF' }}>{emp.first_name} {emp.last_name}</TableCell>
                  <TableCell sx={{ color: '#FFF' }}>${Number(emp.current_rate).toFixed(2) || '—'}/hr</TableCell>
                  <TableCell>{emp.history?.length > 0 ? <Chip label={`${emp.history.length} changes`} size="small" /> : '—'}</TableCell>
                </TableRow>
              ))}
              {compEmployees.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} sx={{ color: '#888', textAlign: 'center', py: 3 }}>No employees found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );

  const renderSettings = () => (
    <Box>
      <Typography variant="h5" sx={{ color: '#FFF', mb: 2 }}>Payroll Settings</Typography>
      {settingsLoading ? (
        <CircularProgress sx={{ color: '#00D4FF' }} />
      ) : settings ? (
        <Paper sx={{ p: 3, bgcolor: '#1A1A1A', border: '1px solid #333' }}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel sx={{ color: '#888' }}>Schedule</InputLabel>
                <Select
                  value={settings.payroll_schedule || ''}
                  onChange={(e) => setSettings({ ...settings, payroll_schedule: e.target.value as any })}
                  sx={darkSelectStyle}
                >
                  <MenuItem value="weekly">Weekly</MenuItem>
                  <MenuItem value="biweekly">Bi‑Weekly</MenuItem>
                  <MenuItem value="monthly">Monthly</MenuItem>
                  <MenuItem value="">None (Manual)</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Day of Week (0=Sun) or Day of Month"
                type="number"
                value={settings.payroll_day}
                onChange={(e) => setSettings({ ...settings, payroll_day: Number(e.target.value) })}
                fullWidth
                sx={darkInputStyle}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Time"
                type="time"
                value={settings.payroll_time}
                onChange={(e) => setSettings({ ...settings, payroll_time: e.target.value })}
                fullWidth
                InputLabelProps={{ shrink: true }}
                sx={darkInputStyle}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Default Hourly Rate"
                type="number"
                value={settings.default_hourly_rate}
                onChange={(e) => setSettings({ ...settings, default_hourly_rate: Number(e.target.value) })}
                fullWidth
                sx={darkInputStyle}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Overtime Multiplier"
                type="number"
                value={settings.overtime_multiplier}
                onChange={(e) => setSettings({ ...settings, overtime_multiplier: Number(e.target.value) })}
                fullWidth
                sx={darkInputStyle}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Tax Rate (%)"
                type="number"
                value={settings.tax_rate}
                onChange={(e) => setSettings({ ...settings, tax_rate: Number(e.target.value) })}
                fullWidth
                sx={darkInputStyle}
              />
            </Grid>
          </Grid>
          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="contained" onClick={handleSaveSettings} sx={{ bgcolor: '#00D4FF', color: '#0A0A0A' }}>
              Save Settings
            </Button>
          </Box>
        </Paper>
      ) : (
        <Alert severity="warning">Could not load settings</Alert>
      )}
    </Box>
  );

  const renderWhatIf = () => (
    <Box>
      <Typography variant="h5" sx={{ color: '#FFF', mb: 2 }}>What‑If Scenario Planner</Typography>
      <Typography variant="body2" sx={{ color: '#888', mb: 3 }}>Simulate the impact of raises or hiring on total payroll cost.</Typography>
      <Paper sx={{ p: 3, bgcolor: '#1A1A1A', border: '1px solid #333', mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={4}>
            <FormControl fullWidth size="small">
              <InputLabel sx={{ color: '#888' }}>Scenario</InputLabel>
              <Select
                value={scenarioType}
                onChange={(e) => setScenarioType(e.target.value as any)}
                sx={darkSelectStyle}
              >
                <MenuItem value="raise_percent">Percentage Raise</MenuItem>
                <MenuItem value="raise_fixed">Fixed Raise ($)</MenuItem>
                <MenuItem value="hire_count">Hire New Employees</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={3}>
            <TextField
              type="number"
              label={scenarioType === 'hire_count' ? 'Number to Hire' : 'Value'}
              value={scenarioValue}
              onChange={(e) => setScenarioValue(Number(e.target.value))}
              size="small"
              fullWidth
              sx={darkInputStyle}
            />
          </Grid>
          <Grid item xs={12} md={5}>
            <Button
              variant="contained"
              onClick={handleRunWhatIf}
              disabled={whatIfLoading}
              sx={{ bgcolor: '#00D4FF', color: '#0A0A0A', width: '100%' }}
            >
              {whatIfLoading ? <CircularProgress size={24} sx={{ color: '#0A0A0A' }} /> : 'Run Scenario'}
            </Button>
          </Grid>
        </Grid>
        {scenarioResult && (
          <Box sx={{ mt: 3, p: 2, bgcolor: '#0A0A0A', borderRadius: 2, border: '1px solid #333' }}>
            <Typography variant="subtitle1" sx={{ color: '#00D4FF' }}>📊 Result</Typography>
            <Typography sx={{ color: '#888' }}>{scenarioResult.explanation}</Typography>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} md={4}>
                <Typography variant="body2" sx={{ color: '#888' }}>Current Total (weekly)</Typography>
                <Typography variant="h6" sx={{ color: '#FFF' }}>${Number(scenarioResult.currentTotal).toFixed(2)}</Typography>
              </Grid>
              <Grid item xs={12} md={4}>
                <Typography variant="body2" sx={{ color: '#888' }}>Projected Total</Typography>
                <Typography variant="h6" sx={{ color: '#FFF' }}>${Number(scenarioResult.projectedTotal).toFixed(2)}</Typography>
              </Grid>
              <Grid item xs={12} md={4}>
                <Typography variant="body2" sx={{ color: '#888' }}>Change</Typography>
                <Typography variant="h6" sx={{ color: scenarioResult.delta >= 0 ? '#F44336' : '#4CAF50' }}>
                  {scenarioResult.delta >= 0 ? '+' : ''}{Number(scenarioResult.delta).toFixed(2)}
                </Typography>
              </Grid>
            </Grid>
          </Box>
        )}
      </Paper>
    </Box>
  );

  // ── Run Payroll Tab ─────────────────────────────────────────────
  const renderRunPayroll = () => (
    <Box>
      <Typography variant="h5" sx={{ color: '#FFF', mb: 2 }}>Run Payroll</Typography>
      <Typography variant="body2" sx={{ color: '#888', mb: 3 }}>
        Calculate and commit employee payroll with statutory deductions and YTD tracking.
      </Typography>
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, bgcolor: '#1A1A1A', border: '1px solid #333' }}>
            <form onSubmit={handleRunPayroll}>
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel sx={{ color: '#888' }}>Employee</InputLabel>
                <Select
                  value={runEmployeeId}
                  onChange={(e) => setRunEmployeeId(Number(e.target.value))}
                  sx={darkSelectStyle}
                >
                  {runEmployees.map((emp) => (
                    <MenuItem key={emp.id} value={emp.id}>
                      {emp.first_name} {emp.last_name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="Gross Pay This Period ($)"
                type="number"
                fullWidth
                value={runGrossPay}
                onChange={(e) => setRunGrossPay(Number(e.target.value))}
                sx={{ mb: 2, ...darkInputStyle }}
              />
              <TextField
                label="Tax Year"
                type="number"
                fullWidth
                value={runTaxYear}
                onChange={(e) => setRunTaxYear(Number(e.target.value))}
                sx={{ mb: 3, ...darkInputStyle }}
              />
              <Button
                type="submit"
                variant="contained"
                fullWidth
                disabled={runLoading}
                sx={{ bgcolor: '#00D4FF', color: '#0A0A0A' }}
                startIcon={<PlayArrow />}
              >
                {runLoading ? <CircularProgress size={24} sx={{ color: '#0A0A0A' }} /> : 'Process Paycheck'}
              </Button>
            </form>
            {runError && <Alert severity="error" sx={{ mt: 2 }}>{runError}</Alert>}
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, bgcolor: '#1A1A1A', border: '1px solid #333', minHeight: 350 }}>
            {runResult ? (
              <>
                <Typography variant="h6" sx={{ color: '#FFF', mb: 2 }}>Payslip Summary</Typography>
                <Typography variant="subtitle1" sx={{ color: '#00D4FF', mb: 1 }}>Employee Withholdings</Typography>
                {Object.entries(runResult.breakdown.employeeWithholdings).map(([key, value]) => (
                  <Box key={key} sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: '1px solid #333' }}>
                    <Typography sx={{ color: '#FFF', textTransform: 'capitalize' }}>
                      {key.replace(/([A-Z])/g, ' $1')}
                    </Typography>
                    <Typography sx={{ color: '#FFF', fontWeight: 'bold' }}>${value}</Typography>
                  </Box>
                ))}
                <Divider sx={{ my: 2, borderColor: '#333' }} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 1, bgcolor: '#0A0A0A', px: 2, borderRadius: 1, border: '1px solid #4CAF50' }}>
                  <Typography sx={{ color: '#FFF', fontWeight: 'bold' }}>Net Take‑Home Pay</Typography>
                  <Typography sx={{ color: '#4CAF50', fontWeight: 'bold', fontSize: '1.2rem' }}>${runResult.netPayout}</Typography>
                </Box>
                <Typography variant="subtitle1" sx={{ color: '#00D4FF', mt: 2, mb: 1 }}>Employer Contributions</Typography>
                {Object.entries(runResult.breakdown.employerContributions).map(([key, value]) => (
                  <Box key={key} sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: '1px solid #333' }}>
                    <Typography sx={{ color: '#FFF', textTransform: 'capitalize' }}>
                      {key.replace(/([A-Z])/g, ' $1')}
                    </Typography>
                    <Typography sx={{ color: '#FFF', fontWeight: 'bold' }}>${value}</Typography>
                  </Box>
                ))}
              </>
            ) : (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#888' }}>
                Enter parameters and run calculation to view results.
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );

  // ─── Main Render ────────────────────────────────────────────────

  const handleApplyRaise = async () => {
    if (selectedEmployees.length === 0) {
      alert('Select at least one employee');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/payroll/employees/compensation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          employeeIds: selectedEmployees,
          raiseType,
          raiseValue,
          effectiveDate: effectiveDate || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        fetchCompEmployees();
        setSelectedEmployees([]);
      } else {
        alert(data.message || 'Failed to apply raise');
      }
    } catch (e) { alert('Error applying raise'); }
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    try {
      const res = await fetch(`${API_BASE}/api/payroll/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (data.success) alert('Settings saved');
      else alert(data.message || 'Failed to save');
    } catch (e) { alert('Error saving settings'); }
  };

  const handleRunWhatIf = async () => {
    setWhatIfLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/payroll/what-if`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          scenarioType,
          scenarioValue,
          employeeIds: selectedEmployees.length > 0 ? selectedEmployees : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) setScenarioResult(data);
      else alert(data.message || 'What‑if failed');
    } catch (e) { alert('Error running what‑if'); }
    setWhatIfLoading(false);
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4, bgcolor: '#0A0A0A', minHeight: '100vh' }}>
      <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold', mb: 1 }}>
        💰 Payroll
      </Typography>
      <Typography variant="body1" sx={{ color: '#888', mb: 3 }}>
        Manage compensation, auto‑schedule runs, and plan scenarios.
      </Typography>

      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{ mb: 3, borderBottom: '1px solid #333' }}
        textColor="primary"
        indicatorColor="primary"
      >
        <Tab label="Overview" icon={<AttachMoney />} iconPosition="start" />
        <Tab label="Compensation" icon={<People />} iconPosition="start" />
        <Tab label="Schedule & Settings" icon={<Settings />} iconPosition="start" />
        <Tab label="What‑If" icon={<TrendingUp />} iconPosition="start" />
        <Tab label="Run Payroll" icon={<PlayArrow />} iconPosition="start" />
      </Tabs>

      {activeTab === 0 && renderOverview()}
      {activeTab === 1 && renderCompensation()}
      {activeTab === 2 && renderSettings()}
      {activeTab === 3 && renderWhatIf()}
      {activeTab === 4 && renderRunPayroll()}
    </Container>
  );
}
