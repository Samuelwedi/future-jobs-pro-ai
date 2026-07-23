import React, { useState, useEffect } from 'react';
import {
  Box, Container, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, Chip, CircularProgress, Stack, Alert,
  FormControl, InputLabel, Select, MenuItem, Dialog, DialogTitle, DialogContent,
  Grid,
  TextField,
} from '@mui/material';
import { Download, Delete, Add, FilePresent } from '@mui/icons-material';

const API_BASE = 'https://future-jobs-pro-ai-production.up.railway.app';

interface TaxForm {
  id: string;
  employee_id: string;
  employee_name: string;
  year: number;
  form_type: string;
  status: string;
  pdf_url: string;
  created_at: string;
  filed_at?: string;
}

export default function TaxFormsPage() {
  const token = localStorage.getItem('token') || '';
  const [forms, setForms] = useState<TaxForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [formType, setFormType] = useState<'T4' | 'RL1'>('T4');
  const [generating, setGenerating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchForms = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/tax-forms`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setForms(data.forms);
      else setError(data.message || 'Failed to load tax forms');
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => { fetchForms(); }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`${API_BASE}/api/tax-forms/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ year, formType }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`Generated ${data.count} ${formType} forms for ${year}`);
        setDialogOpen(false);
        fetchForms();
      } else {
        alert(data.message || 'Generation failed');
      }
    } catch (e) { alert('Error generating forms'); }
    setGenerating(false);
  };

  const downloadPDF = async (id: string, employeeName: string, formType: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/tax-forms/${id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${formType}_${employeeName.replace(' ', '_')}.pdf`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (e) {
      alert('Failed to download PDF');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this tax form?')) return;
    try {
      await fetch(`${API_BASE}/api/tax-forms/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchForms();
    } catch (e) { alert('Delete failed'); }
  };

  const getStatusChip = (status: string) => {
    const map: Record<string, any> = {
      draft: { color: 'default', label: 'Draft' },
      filed: { color: 'success', label: 'Filed' },
      sent: { color: 'primary', label: 'Sent' },
    };
    return <Chip label={map[status]?.label || status} color={map[status]?.color || 'default'} size="small" />;
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4, bgcolor: '#0A0A0A', minHeight: '100vh' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold' }}>
          📄 Tax Forms (T4 / RL-1)
        </Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => setDialogOpen(true)} sx={{ bgcolor: '#00D4FF', color: '#0A0A0A' }}>
          Generate Forms
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <TableContainer component={Paper} sx={{ bgcolor: '#1A1A1A', border: '1px solid #333' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: '#FFF' }}>Employee</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Year</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Type</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Status</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Created</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} sx={{ textAlign: 'center', py: 3 }}><CircularProgress sx={{ color: '#00D4FF' }} /></TableCell></TableRow>
            ) : forms.length === 0 ? (
              <TableRow><TableCell colSpan={6} sx={{ color: '#888', textAlign: 'center', py: 3 }}>No tax forms generated.</TableCell></TableRow>
            ) : (
              forms.map((form) => (
                <TableRow key={form.id} sx={{ borderBottom: '1px solid #333' }}>
                  <TableCell sx={{ color: '#FFF' }}>{form.employee_name}</TableCell>
                  <TableCell sx={{ color: '#FFF' }}>{form.year}</TableCell>
                  <TableCell sx={{ color: '#FFF' }}>{form.form_type}</TableCell>
                  <TableCell>{getStatusChip(form.status)}</TableCell>
                  <TableCell sx={{ color: '#FFF' }}>{new Date(form.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1}>
                      <Button
                        size="small"
                        startIcon={<Download />}
                        onClick={() => downloadPDF(form.id, form.employee_name, form.form_type)}
                        sx={{ color: '#00D4FF' }}
                      >
                        PDF
                      </Button>
                      {form.status === 'draft' && (
                        <Button
                          size="small"
                          startIcon={<Delete />}
                          onClick={() => handleDelete(form.id)}
                          color="error"
                        >
                          Delete
                        </Button>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Generate Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: '#1A1A1A', color: '#FFF' }}>Generate Tax Forms</DialogTitle>
        <DialogContent sx={{ bgcolor: '#1A1A1A' }}>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                label="Year"
                type="number"
                fullWidth
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                sx={{ input: { color: '#FFF' }, label: { color: '#888' } }}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel sx={{ color: '#888' }}>Form Type</InputLabel>
                <Select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as 'T4' | 'RL1')}
                  sx={{ color: '#FFF', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }}
                >
                  <MenuItem value="T4">T4 (Federal)</MenuItem>
                  <MenuItem value="RL1">RL-1 (Québec)</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              variant="contained"
              onClick={handleGenerate}
              disabled={generating}
              sx={{ bgcolor: '#00D4FF', color: '#0A0A0A' }}
            >
              {generating ? <CircularProgress size={24} sx={{ color: '#0A0A0A' }} /> : 'Generate'}
            </Button>
          </Box>
        </DialogContent>
      </Dialog>
    </Container>
  );
}