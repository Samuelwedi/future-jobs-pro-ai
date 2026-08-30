import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Container, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControl, Grid, InputLabel, MenuItem, Paper,
  Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TextField, Typography,
} from '@mui/material';
import { Download, Print, Refresh, Visibility } from '@mui/icons-material';
import { API_BASE } from '../services/api';

type SlipSummary = { id: string; employee_id: string; employee_name: string; form_type: 'T4' | 'T4A' | 'RL1'; tax_year: number; generated_at: string };

export default function FinalizedSlips() {
  const token = localStorage.getItem('token') || '';
  const currentYear = new Date().getFullYear();
  const [taxYear, setTaxYear] = useState(currentYear);
  const [formType, setFormType] = useState('ALL');
  const [search, setSearch] = useState('');
  const [slips, setSlips] = useState<SlipSummary[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ taxYear: String(taxYear) });
      if (formType !== 'ALL') params.set('formType', formType);
      const response = await fetch(`${API_BASE}/api/year-end/finalized?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Could not load finalized slips');
      setSlips(body.slips || []);
    } catch (cause: any) { setError(cause.message || 'Could not load finalized slips'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [taxYear, formType]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle ? slips.filter(slip => `${slip.employee_name} ${slip.form_type} ${slip.tax_year}`.toLowerCase().includes(needle)) : slips;
  }, [slips, search]);

  const open = async (slip: SlipSummary) => {
    setLoading(true); setError('');
    try {
      const response = await fetch(`${API_BASE}/api/year-end/finalized/${slip.form_type}/${slip.id}`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Could not open finalized slip');
      setSelected({ ...body.slip, form_type: body.formType });
    } catch (cause: any) { setError(cause.message || 'Could not open finalized slip'); }
    finally { setLoading(false); }
  };

  const downloadRecord = () => {
    if (!selected) return;
    const employee = `${selected.first_name || ''}-${selected.last_name || ''}`.replace(/[^a-z0-9-]/gi, '');
    const blob = new Blob([JSON.stringify(selected, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${selected.form_type}-${selected.tax_year}-${employee || 'employee'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const monetaryFields = selected ? Object.entries(selected).filter(([key]) => key.startsWith('box_') || key.startsWith('employer_')) : [];

  return <Container maxWidth="xl" sx={{ py: 4 }}>
    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
      <Box><Typography variant="h4" color="white" fontWeight={900}>Finalized T4 Slips</Typography><Typography color="text.secondary">Secure company archive for finalized T4, T4A, and RL‑1 records.</Typography></Box>
      <Button variant="outlined" startIcon={<Refresh />} onClick={load}>Refresh</Button>
    </Stack>
    <Alert severity="info" sx={{ mb: 3 }}>Finalized records are stored in your payroll database. This archive does not submit forms to the CRA or Revenu Québec.</Alert>
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    <Paper sx={{ p: 2.5, bgcolor: '#15191f', border: '1px solid #303842' }}>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={3}><TextField fullWidth label="Tax year" type="number" value={taxYear} onChange={event => setTaxYear(Number(event.target.value))} inputProps={{ min: 2000, max: currentYear + 1 }} /></Grid>
        <Grid item xs={12} md={3}><FormControl fullWidth><InputLabel>Form</InputLabel><Select label="Form" value={formType} onChange={event => setFormType(event.target.value)}><MenuItem value="ALL">All forms</MenuItem><MenuItem value="T4">T4</MenuItem><MenuItem value="T4A">T4A</MenuItem><MenuItem value="RL1">RL‑1</MenuItem></Select></FormControl></Grid>
        <Grid item xs={12} md={6}><TextField fullWidth label="Search employee" value={search} onChange={event => setSearch(event.target.value)} /></Grid>
      </Grid>
      {loading && <CircularProgress size={25} sx={{ mb: 2 }} />}
      <TableContainer><Table>
        <TableHead><TableRow><TableCell>Employee</TableCell><TableCell>Form</TableCell><TableCell>Tax year</TableCell><TableCell>Finalized</TableCell><TableCell align="right">Record</TableCell></TableRow></TableHead>
        <TableBody>{visible.length === 0 ? <TableRow><TableCell colSpan={5} align="center" sx={{ py: 6, color: '#8b98a5' }}>No finalized slips found for these filters.</TableCell></TableRow> : visible.map(slip => <TableRow key={`${slip.form_type}-${slip.id}`} hover><TableCell sx={{ color: '#FFF', fontWeight: 700 }}>{slip.employee_name}</TableCell><TableCell><Chip label={slip.form_type} color="info" size="small" /></TableCell><TableCell>{slip.tax_year}</TableCell><TableCell>{new Date(slip.generated_at).toLocaleString()}</TableCell><TableCell align="right"><Button startIcon={<Visibility />} onClick={() => open(slip)}>Open</Button></TableCell></TableRow>)}</TableBody>
      </Table></TableContainer>
    </Paper>

    <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} maxWidth="md" fullWidth PaperProps={{ sx: { bgcolor: '#111820' } }}>
      <DialogTitle>{selected?.form_type} • {selected?.tax_year} • {selected?.first_name} {selected?.last_name}</DialogTitle>
      <DialogContent dividers>
        <Typography color="text.secondary" sx={{ mb: 2 }}>{selected?.legal_name || selected?.company_name} • Finalized {selected?.generated_at ? new Date(selected.generated_at).toLocaleString() : ''}</Typography>
        <Grid container spacing={2}>{monetaryFields.map(([key, value]) => <Grid item xs={12} sm={6} md={4} key={key}><Paper sx={{ p: 2, bgcolor: '#18232d' }}><Typography variant="caption" color="text.secondary">{key.replace(/_/g, ' ').toUpperCase()}</Typography><Typography color="white" fontWeight={900} fontSize={20}>${Number(value || 0).toFixed(2)}</Typography></Paper></Grid>)}</Grid>
      </DialogContent>
      <DialogActions><Button onClick={() => setSelected(null)}>Close</Button><Button startIcon={<Download />} onClick={downloadRecord}>Download record</Button><Button variant="contained" startIcon={<Print />} onClick={() => window.print()}>Print</Button></DialogActions>
    </Dialog>
  </Container>;
}
