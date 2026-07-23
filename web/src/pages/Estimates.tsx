import React, { useState, useEffect } from 'react';
import {
  Box, Container, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, Dialog, DialogTitle, DialogContent,
  TextField, Chip, IconButton, CircularProgress, Stack, Tabs, Tab,
  Alert, Grid, MenuItem, Select, FormControl, InputLabel,
  InputAdornment,
} from '@mui/material';
import {
  Add, Delete, Send, Edit, Refresh, AttachMoney,
  CheckCircle, Cancel, TrendingUp, Description,
  PictureAsPdf, TableChart, FilePresent,
} from '@mui/icons-material';

const API_BASE = 'https://future-jobs-pro-ai-production.up.railway.app';

// ─── Types ────────────────────────────────────────────────────────
interface EstimateItem {
  description: string;
  quantity: number;
  unit_price: number;
  total?: number;
}

interface Estimate {
  id: string;
  estimate_number: string;
  project_id: string | null;
  client_id: string | null;
  issue_date: string;
  expiry_date: string | null;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'converted';
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  notes: string;
  client_notes: string;
  created_at: string;
  sent_at: string | null;
  accepted_at: string | null;
  converted_to_invoice_id: string | null;
  project_name?: string;
  client_name?: string;
  items?: EstimateItem[];
}

// ─── Main Component ──────────────────────────────────────────────
export default function EstimatesPage() {
  const token = localStorage.getItem('token') || '';
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Form state
  const [form, setForm] = useState({
    projectId: '',
    clientId: '',
    issueDate: new Date().toISOString().split('T')[0],
    expiryDate: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0],
    taxRate: 0,
    notes: '',
    clientNotes: '',
    items: [{ description: '', quantity: 1, unit_price: 0 }],
  });
  const [projects, setProjects] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedEstimate, setSelectedEstimate] = useState<Estimate | null>(null);

  // ── Fetch Functions ──
  const fetchEstimates = async () => {
    setLoading(true);
    try {
      const url = filterStatus !== 'all' ? `${API_BASE}/api/estimates?status=${filterStatus}` : `${API_BASE}/api/estimates`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setEstimates(data.estimates);
      else setError(data.message || 'Failed to load estimates');
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  const fetchProjects = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/projects`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setProjects(data.projects);
    } catch (e) { console.error(e); }
  };

  const fetchClients = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/users/company`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setClients(data.users);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    fetchEstimates();
    fetchProjects();
    fetchClients();
  }, [filterStatus]);

  // ── Handlers ──
  const resetForm = () => {
    setEditId(null);
    setForm({
      projectId: '',
      clientId: '',
      issueDate: new Date().toISOString().split('T')[0],
      expiryDate: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0],
      taxRate: 0,
      notes: '',
      clientNotes: '',
      items: [{ description: '', quantity: 1, unit_price: 0 }],
    });
  };

  const openCreateDialog = () => { resetForm(); setDialogOpen(true); };

  const openEditDialog = async (estimate: Estimate) => {
    setEditId(estimate.id);
    setForm({
      projectId: estimate.project_id || '',
      clientId: estimate.client_id || '',
      issueDate: estimate.issue_date,
      expiryDate: estimate.expiry_date || '',
      taxRate: estimate.tax_rate,
      notes: estimate.notes || '',
      clientNotes: estimate.client_notes || '',
      items: estimate.items || [{ description: '', quantity: 1, unit_price: 0 }],
    });
    if (!estimate.items) {
      // Fetch items
      try {
        const res = await fetch(`${API_BASE}/api/estimates/${estimate.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.success && data.items) {
          setForm(prev => ({ ...prev, items: data.items.map((it: any) => ({
            description: it.description,
            quantity: it.quantity,
            unit_price: it.unit_price,
          })) }));
        }
      } catch (e) {}
    }
    setDialogOpen(true);
  };

  const addItem = () => {
    setForm({ ...form, items: [...form.items, { description: '', quantity: 1, unit_price: 0 }] });
  };

  const removeItem = (idx: number) => {
    if (form.items.length === 1) return;
    const updated = form.items.filter((_, i) => i !== idx);
    setForm({ ...form, items: updated });
  };

  const updateItem = (idx: number, field: string, value: any) => {
    const updated = form.items.map((item, i) =>
      i === idx ? { ...item, [field]: value } : item
    );
    setForm({ ...form, items: updated });
  };

  const handleSave = async () => {
    // Validate
    if (form.items.some(i => !i.description || i.unit_price <= 0)) {
      alert('All items must have a description and positive unit price.');
      return;
    }
    try {
      const payload = {
        projectId: form.projectId || null,
        clientId: form.clientId || null,
        issueDate: form.issueDate,
        expiryDate: form.expiryDate || null,
        taxRate: form.taxRate || 0,
        notes: form.notes,
        clientNotes: form.clientNotes,
        items: form.items.map(i => ({
          description: i.description,
          quantity: i.quantity || 1,
          unit_price: i.unit_price,
        })),
      };
      const url = editId ? `${API_BASE}/api/estimates/${editId}` : `${API_BASE}/api/estimates`;
      const method = editId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setDialogOpen(false);
        fetchEstimates();
      } else {
        alert(data.message || 'Save failed');
      }
    } catch (e) { alert('Error saving estimate'); }
  };

  const handleSend = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/estimates/${id}/send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) fetchEstimates();
      else alert(data.message || 'Failed to send');
    } catch (e) { alert('Error sending'); }
  };

  const handleAccept = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/estimates/${id}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) fetchEstimates();
      else alert(data.message || 'Failed to accept');
    } catch (e) { alert('Error accepting'); }
  };

  const handleConvert = async (id: string) => {
    if (!window.confirm('Convert this estimate to an invoice?')) return;
    try {
      const res = await fetch(`${API_BASE}/api/estimates/${id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success && data.invoice) {
        alert(`Invoice ${data.invoice.invoice_number} created!`);
        fetchEstimates();
        // Optionally navigate to invoice
      } else {
        alert(data.message || 'Conversion failed');
      }
    } catch (e) { alert('Error converting'); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this estimate?')) return;
    try {
      await fetch(`${API_BASE}/api/estimates/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchEstimates();
    } catch (e) { alert('Delete failed'); }
  };

  const getStatusChip = (status: string) => {
    const map: Record<string, any> = {
      draft: { color: 'default', label: 'Draft' },
      sent: { color: 'primary', label: 'Sent' },
      accepted: { color: 'success', label: 'Accepted' },
      rejected: { color: 'error', label: 'Rejected' },
      converted: { color: 'info', label: 'Converted' },
    };
    return <Chip label={map[status]?.label || status} color={map[status]?.color || 'default'} size="small" />;
  };

  const openDetail = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/estimates/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setSelectedEstimate(data.estimate);
        setSelectedEstimate(prev => ({ ...prev!, items: data.items || [] }));
        setDetailDialogOpen(true);
      }
    } catch (e) { alert('Failed to load details'); }
  };

  // ── Render ─────────────────────────────────────────────────────
  return (
    <Container maxWidth="xl" sx={{ py: 4, bgcolor: '#0A0A0A', minHeight: '100vh' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold' }}>
          📄 Estimates
        </Typography>
        <Button variant="contained" startIcon={<Add />} onClick={openCreateDialog} sx={{ bgcolor: '#00D4FF', color: '#0A0A0A' }}>
          Create Estimate
        </Button>
      </Box>

      {/* Filter */}
      <Box sx={{ mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel sx={{ color: '#888' }}>Status</InputLabel>
          <Select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            sx={{ color: '#FFF', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="draft">Draft</MenuItem>
            <MenuItem value="sent">Sent</MenuItem>
            <MenuItem value="accepted">Accepted</MenuItem>
            <MenuItem value="rejected">Rejected</MenuItem>
            <MenuItem value="converted">Converted</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <TableContainer component={Paper} sx={{ bgcolor: '#1A1A1A', border: '1px solid #333' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: '#FFF' }}>#</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Client</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Project</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Issue Date</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Total</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Status</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} sx={{ textAlign: 'center', py: 3 }}><CircularProgress sx={{ color: '#00D4FF' }} /></TableCell></TableRow>
            ) : estimates.length === 0 ? (
              <TableRow><TableCell colSpan={7} sx={{ color: '#888', textAlign: 'center', py: 3 }}>No estimates found.</TableCell></TableRow>
            ) : (
              estimates.map((est) => (
                <TableRow key={est.id} sx={{ borderBottom: '1px solid #333' }}>
                  <TableCell sx={{ color: '#FFF' }}>{est.estimate_number}</TableCell>
                  <TableCell sx={{ color: '#FFF' }}>{est.client_name || '—'}</TableCell>
                  <TableCell sx={{ color: '#FFF' }}>{est.project_name || '—'}</TableCell>
                  <TableCell sx={{ color: '#FFF' }}>{est.issue_date}</TableCell>
                  <TableCell sx={{ color: '#FFF' }}>${est.total.toFixed(2)}</TableCell>
                  <TableCell>{getStatusChip(est.status)}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1}>
                      {est.status === 'draft' && (
                        <>
                          <IconButton size="small" onClick={() => openEditDialog(est)} color="primary" title="Edit">
                            <Edit fontSize="small" />
                          </IconButton>
                          <IconButton size="small" onClick={() => handleSend(est.id)} color="info" title="Send">
                            <Send fontSize="small" />
                          </IconButton>
                          <IconButton size="small" onClick={() => handleDelete(est.id)} color="error" title="Delete">
                            <Delete fontSize="small" />
                          </IconButton>
                        </>
                      )}
                      {est.status === 'sent' && (
                        <>
                          <IconButton size="small" onClick={() => handleAccept(est.id)} color="success" title="Accept">
                            <CheckCircle fontSize="small" />
                          </IconButton>
                          <IconButton size="small" onClick={() => handleConvert(est.id)} color="info" title="Convert to Invoice">
                            <AttachMoney fontSize="small" />
                          </IconButton>
                        </>
                      )}
                      {est.status === 'accepted' && (
                        <IconButton size="small" onClick={() => handleConvert(est.id)} color="info" title="Convert to Invoice">
                          <AttachMoney fontSize="small" />
                        </IconButton>
                      )}
                      {(est.status === 'sent' || est.status === 'accepted' || est.status === 'converted') && (
                        <IconButton size="small" onClick={() => openDetail(est.id)} color="default" title="Details">
                          <Description fontSize="small" />
                        </IconButton>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ bgcolor: '#1A1A1A', color: '#FFF' }}>
          {editId ? 'Edit Estimate' : 'Create Estimate'}
        </DialogTitle>
        <DialogContent sx={{ bgcolor: '#1A1A1A', maxHeight: '80vh', overflowY: 'auto' }}>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel sx={{ color: '#888' }}>Project (optional)</InputLabel>
                <Select
                  value={form.projectId}
                  onChange={(e) => setForm({ ...form, projectId: e.target.value })}
                  sx={{ color: '#FFF', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }}
                >
                  <MenuItem value="">None</MenuItem>
                  {projects.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel sx={{ color: '#888' }}>Client (optional)</InputLabel>
                <Select
                  value={form.clientId}
                  onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                  sx={{ color: '#FFF', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }}
                >
                  <MenuItem value="">Select Client</MenuItem>
                  {clients.map(c => <MenuItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="Issue Date"
                type="date"
                fullWidth
                value={form.issueDate}
                onChange={(e) => setForm({ ...form, issueDate: e.target.value })}
                InputLabelProps={{ shrink: true }}
                sx={{ input: { color: '#FFF' }, label: { color: '#888' } }}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="Expiry Date (optional)"
                type="date"
                fullWidth
                value={form.expiryDate}
                onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                InputLabelProps={{ shrink: true }}
                sx={{ input: { color: '#FFF' }, label: { color: '#888' } }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Tax Rate (%)"
                type="number"
                fullWidth
                value={form.taxRate}
                onChange={(e) => setForm({ ...form, taxRate: Number(e.target.value) })}
                sx={{ input: { color: '#FFF' }, label: { color: '#888' } }}
              />
            </Grid>
            <Grid item xs={12}>
              <Typography variant="subtitle1" sx={{ color: '#FFF', mt: 2 }}>Line Items</Typography>
              {form.items.map((item, idx) => (
                <Box key={idx} sx={{ display: 'flex', gap: 1, mb: 1 }}>
                  <TextField
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => updateItem(idx, 'description', e.target.value)}
                    sx={{ flex: 3, input: { color: '#FFF' } }}
                    size="small"
                  />
                  <TextField
                    type="number"
                    placeholder="Qty"
                    value={item.quantity}
                    onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))}
                    sx={{ flex: 1, input: { color: '#FFF' } }}
                    size="small"
                  />
                  <TextField
                    type="number"
                    placeholder="Unit Price"
                    value={item.unit_price}
                    onChange={(e) => updateItem(idx, 'unit_price', Number(e.target.value))}
                    sx={{ flex: 1, input: { color: '#FFF' } }}
                    size="small"
                  />
                  <IconButton size="small" onClick={() => removeItem(idx)} color="error" disabled={form.items.length === 1}>
                    <Delete fontSize="small" />
                  </IconButton>
                </Box>
              ))}
              <Button onClick={addItem} size="small" sx={{ color: '#00D4FF' }}>+ Add Item</Button>
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Notes (internal)"
                multiline
                rows={2}
                fullWidth
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                sx={{ input: { color: '#FFF' }, label: { color: '#888' } }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Client Notes (shown on estimate)"
                multiline
                rows={2}
                fullWidth
                value={form.clientNotes}
                onChange={(e) => setForm({ ...form, clientNotes: e.target.value })}
                sx={{ input: { color: '#FFF' }, label: { color: '#888' } }}
              />
            </Grid>
          </Grid>
          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={handleSave} sx={{ bgcolor: '#00D4FF', color: '#0A0A0A' }}>
              {editId ? 'Update' : 'Create'}
            </Button>
          </Box>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailDialogOpen} onClose={() => setDetailDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ bgcolor: '#1A1A1A', color: '#FFF' }}>
          Estimate Details – {selectedEstimate?.estimate_number}
        </DialogTitle>
        <DialogContent sx={{ bgcolor: '#0A0A0A' }}>
          {selectedEstimate && (
            <>
              <Grid container spacing={2}>
                <Grid item xs={6}><Typography variant="body2" sx={{ color: '#888' }}>Client</Typography><Typography sx={{ color: '#FFF' }}>{selectedEstimate.client_name || '—'}</Typography></Grid>
                <Grid item xs={6}><Typography variant="body2" sx={{ color: '#888' }}>Project</Typography><Typography sx={{ color: '#FFF' }}>{selectedEstimate.project_name || '—'}</Typography></Grid>
                <Grid item xs={6}><Typography variant="body2" sx={{ color: '#888' }}>Issue Date</Typography><Typography sx={{ color: '#FFF' }}>{selectedEstimate.issue_date}</Typography></Grid>
                <Grid item xs={6}><Typography variant="body2" sx={{ color: '#888' }}>Expiry</Typography><Typography sx={{ color: '#FFF' }}>{selectedEstimate.expiry_date || '—'}</Typography></Grid>
                <Grid item xs={12}><Typography variant="body2" sx={{ color: '#888' }}>Status</Typography>{getStatusChip(selectedEstimate.status)}</Grid>
              </Grid>
              <Typography variant="h6" sx={{ color: '#FFF', mt: 2 }}>Items</Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ color: '#888' }}>Description</TableCell>
                    <TableCell sx={{ color: '#888' }} align="right">Qty</TableCell>
                    <TableCell sx={{ color: '#888' }} align="right">Unit Price</TableCell>
                    <TableCell sx={{ color: '#888' }} align="right">Total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {selectedEstimate.items?.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell sx={{ color: '#FFF' }}>{item.description}</TableCell>
                      <TableCell sx={{ color: '#FFF' }} align="right">{item.quantity}</TableCell>
                      <TableCell sx={{ color: '#FFF' }} align="right">${item.unit_price.toFixed(2)}</TableCell>
                      <TableCell sx={{ color: '#FFF' }} align="right">${(item.quantity * item.unit_price).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
                <Typography variant="body1" sx={{ color: '#888' }}>Subtotal: ${selectedEstimate.subtotal.toFixed(2)}</Typography>
                {selectedEstimate.tax_rate > 0 && (
                  <Typography variant="body1" sx={{ color: '#888', ml: 2 }}>Tax: ${selectedEstimate.tax_amount.toFixed(2)}</Typography>
                )}
                <Typography variant="h6" sx={{ color: '#00D4FF', ml: 3 }}>Total: ${selectedEstimate.total.toFixed(2)}</Typography>
              </Box>
              {selectedEstimate.notes && (
                <Typography variant="body2" sx={{ color: '#888', mt: 2 }}>Notes: {selectedEstimate.notes}</Typography>
              )}
              {selectedEstimate.client_notes && (
                <Typography variant="body2" sx={{ color: '#888' }}>Client Notes: {selectedEstimate.client_notes}</Typography>
              )}
              {selectedEstimate.converted_to_invoice_id && (
                <Button variant="outlined" size="small" sx={{ mt: 2, color: '#00D4FF', borderColor: '#00D4FF' }}>
                  View Invoice
                </Button>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </Container>
  );
}