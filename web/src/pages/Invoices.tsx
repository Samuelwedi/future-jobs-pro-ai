import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Container, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, Dialog, DialogTitle, DialogContent,
  TextField, Chip, IconButton, CircularProgress, Stack, Tabs, Tab,
  Alert, Grid, Card, CardContent, Select, MenuItem, FormControl, InputLabel,
  Switch, FormControlLabel, Divider, InputAdornment,
} from '@mui/material';
import {
  Add, Delete, Send, CheckCircle, Edit, Refresh, Receipt,
  AttachMoney, People, Schedule, Visibility, Download,
  Payment, TrendingUp, TrendingDown,
} from '@mui/icons-material';

const API_BASE = 'https://future-jobs-pro-ai-production.up.railway.app';

// ─── Types ────────────────────────────────────────────────────────
interface Invoice {
  id: string;
  invoice_number: string;
  project_id: string | null;
  client_id: string | null;
  issue_date: string;
  due_date: string;
  status: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  paid_amount: number;
  balance: number;
  notes: string;
  client_notes: string;
  created_at: string;
  sent_at?: string;
  paid_at?: string;
  viewed_at?: string;
  project_name?: string;
  client_name?: string;
  payment_count?: number;
}

interface InvoiceItem {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  timeEntryIds?: string[];
}

interface Payment {
  id: string;
  amount: number;
  payment_date: string;
  method: string;
  reference: string;
  notes: string;
}

interface ClientSummary {
  client: { id: string; first_name: string; last_name: string; email: string; phone: string };
  invoices: Invoice[];
  projects: any[];
  totals: { total_invoices: number; total_billed: number; total_paid: number; total_balance: number };
}

// ─── Main Component ──────────────────────────────────────────────
export default function InvoicesPage() {
  const token = localStorage.getItem('token') || '';
  const [activeTab, setActiveTab] = useState(0);

  // ── State ──
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<any>({
    projectId: '',
    clientId: '',
    issueDate: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0],
    taxRate: 0,
    notes: '',
    clientNotes: '',
    items: [{ description: '', quantity: 1, unit_price: 0, timeEntryIds: [] }],
    isRecurring: false,
    recurringFrequency: 'monthly',
    recurringEndDate: '',
  });
  const [projects, setProjects] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [unbilled, setUnbilled] = useState<any[]>([]);
  const [unbilledLoading, setUnbilledLoading] = useState(false);

  // Customer Hub
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [clientSummary, setClientSummary] = useState<ClientSummary | null>(null);
  const [hubLoading, setHubLoading] = useState(false);

  // Payment dialog
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentDate, setPaymentDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentRef, setPaymentRef] = useState('');

  // ── Fetch Functions ──
  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/invoices`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setInvoices(data.invoices);
      else setError(data.message || 'Failed to load invoices');
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, [token]);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/projects`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setProjects(data.projects);
    } catch (e) { console.error(e); }
  }, [token]);

  const fetchClients = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/users/company`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setClients(data.users);
    } catch (e) { console.error(e); }
  }, [token]);

  const fetchUnbilled = async (projectId: string) => {
    setUnbilledLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/invoices/unbilled?projectId=${projectId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setUnbilled(data.unbilled);
    } catch (e) { console.error(e); }
    setUnbilledLoading(false);
  };

  useEffect(() => {
    fetchInvoices();
    fetchProjects();
    fetchClients();
  }, []);

  // ── Handlers ──
  const resetForm = () => {
    setEditId(null);
    setForm({
      projectId: '',
      clientId: '',
      issueDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0],
      taxRate: 0,
      notes: '',
      clientNotes: '',
      items: [{ description: '', quantity: 1, unit_price: 0, timeEntryIds: [] }],
      isRecurring: false,
      recurringFrequency: 'monthly',
      recurringEndDate: '',
    });
    setUnbilled([]);
  };

  const openCreateDialog = () => { resetForm(); setDialogOpen(true); };

  const openEditDialog = async (invoice: Invoice) => {
    setEditId(invoice.id);
    setForm({
      projectId: invoice.project_id || '',
      clientId: invoice.client_id || '',
      issueDate: invoice.issue_date,
      dueDate: invoice.due_date,
      taxRate: invoice.tax_rate,
      notes: invoice.notes || '',
      clientNotes: invoice.client_notes || '',
      items: [{ description: '', quantity: 1, unit_price: 0, timeEntryIds: [] }],
      isRecurring: false,
      recurringFrequency: 'monthly',
      recurringEndDate: '',
    });
    // Fetch invoice items
    try {
      const res = await fetch(`${API_BASE}/api/invoices/${invoice.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setForm((prev: any) => ({
          ...prev,
          items: data.items.map((it: any) => ({
            description: it.description,
            quantity: it.quantity,
            unit_price: it.unit_price,
            timeEntryIds: it.time_entry_ids || [],
          })),
        }));
      }
    } catch (e) { console.error(e); }
    setDialogOpen(true);
  };

  const addItem = () => {
    setForm({ ...form, items: [...form.items, { description: '', quantity: 1, unit_price: 0, timeEntryIds: [] }] });
  };

  const removeItem = (idx: number) => {
    if (form.items.length === 1) return;
    const updated = form.items.filter((_: any, i: number) => i !== idx);
    setForm({ ...form, items: updated });
  };

  const updateItem = (idx: number, field: string, value: any) => {
    const updated = form.items.map((item: any, i: number) =>
      i === idx ? { ...item, [field]: value } : item
    );
    setForm({ ...form, items: updated });
  };

  const handleSave = async () => {
    // Validate
    if (form.items.some((i: any) => !i.description || i.unit_price <= 0)) {
      alert('All items must have a description and a positive price.');
      return;
    }
    try {
      const payload = {
        projectId: form.projectId || null,
        clientId: form.clientId || null,
        issueDate: form.issueDate,
        dueDate: form.dueDate,
        taxRate: form.taxRate || 0,
        notes: form.notes,
        clientNotes: form.clientNotes,
        items: form.items.map((i: any) => ({
          description: i.description,
          quantity: i.quantity || 1,
          unit_price: i.unit_price,
          timeEntryIds: i.timeEntryIds || [],
        })),
        isRecurring: form.isRecurring,
        recurringFrequency: form.recurringFrequency,
        recurringEndDate: form.recurringEndDate || null,
      };

      const url = editId ? `${API_BASE}/api/invoices/${editId}` : `${API_BASE}/api/invoices`;
      const method = editId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setDialogOpen(false);
        fetchInvoices();
      } else {
        alert(data.message || 'Save failed');
      }
    } catch (e) { alert('Error saving invoice'); }
  };

  const handleSend = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/invoices/${id}/send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) fetchInvoices();
      else alert(data.message || 'Failed to send');
    } catch (e) { alert('Error sending'); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this invoice?')) return;
    try {
      await fetch(`${API_BASE}/api/invoices/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchInvoices();
    } catch (e) { alert('Delete failed'); }
  };

  const openPaymentDialog = (invoiceId: string, currentPaid: number, total: number) => {
    setPaymentInvoiceId(invoiceId);
    setPaymentAmount(total - currentPaid);
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentMethod('credit_card');
    setPaymentRef('');
    setPaymentDialogOpen(true);
  };

  const handleRecordPayment = async () => {
    if (!paymentInvoiceId) return;
    try {
      const res = await fetch(`${API_BASE}/api/invoices/${paymentInvoiceId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          amount: paymentAmount,
          paymentDate,
          method: paymentMethod,
          reference: paymentRef || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPaymentDialogOpen(false);
        fetchInvoices();
      } else {
        alert(data.message || 'Payment failed');
      }
    } catch (e) { alert('Error recording payment'); }
  };

  const fetchClientHub = async (clientId: string) => {
    if (!clientId) return;
    setHubLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/invoices/client/${clientId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setClientSummary(data);
    } catch (e) { console.error(e); }
    setHubLoading(false);
  };

  // ── Render Helpers ──
  const getStatusChip = (status: string) => {
    const map: Record<string, any> = {
      draft: { color: 'default', label: 'Draft' },
      sent: { color: 'primary', label: 'Sent' },
      viewed: { color: 'info', label: 'Viewed' },
      paid: { color: 'success', label: 'Paid' },
      overdue: { color: 'error', label: 'Overdue' },
      cancelled: { color: 'default', label: 'Cancelled' },
    };
    return <Chip label={map[status]?.label || status} color={map[status]?.color || 'default'} size="small" />;
  };

  // ── Tab Panels ──
  const renderOverview = () => (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" sx={{ color: '#FFF' }}>All Invoices</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={openCreateDialog} sx={{ bgcolor: '#00D4FF', color: '#0A0A0A' }}>
          Create Invoice
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <TableContainer component={Paper} sx={{ bgcolor: '#1A1A1A', border: '1px solid #333' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: '#FFF' }}>Invoice #</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Client</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Project</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Issue Date</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Due Date</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Total</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Balance</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Status</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {invoices.map((inv) => (
              <TableRow key={inv.id} sx={{ borderBottom: '1px solid #333' }}>
                <TableCell sx={{ color: '#FFF' }}>{inv.invoice_number}</TableCell>
                <TableCell sx={{ color: '#FFF' }}>{inv.client_name || '—'}</TableCell>
                <TableCell sx={{ color: '#FFF' }}>{inv.project_name || '—'}</TableCell>
                <TableCell sx={{ color: '#FFF' }}>{inv.issue_date}</TableCell>
                <TableCell sx={{ color: '#FFF' }}>{inv.due_date}</TableCell>
                <TableCell sx={{ color: '#FFF' }}>${inv.total.toFixed(2)}</TableCell>
                <TableCell sx={{ color: inv.balance > 0 ? '#F44336' : '#4CAF50' }}>
                  ${inv.balance.toFixed(2)}
                </TableCell>
                <TableCell>{getStatusChip(inv.status)}</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={1}>
                    {inv.status === 'draft' && (
                      <>
                        <IconButton size="small" onClick={() => openEditDialog(inv)} color="primary" title="Edit">
                          <Edit fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => handleSend(inv.id)} color="info" title="Send">
                          <Send fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => handleDelete(inv.id)} color="error" title="Delete">
                          <Delete fontSize="small" />
                        </IconButton>
                      </>
                    )}
                    {inv.status === 'sent' && (
                      <>
                        <IconButton size="small" onClick={() => handleSend(inv.id)} color="info" title="Resend">
                          <Send fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => openPaymentDialog(inv.id, inv.paid_amount, inv.total)} color="success" title="Record Payment">
                          <Payment fontSize="small" />
                        </IconButton>
                      </>
                    )}
                    {inv.status === 'overdue' && (
                      <IconButton size="small" onClick={() => handleSend(inv.id)} color="error" title="Send Reminder">
                        <Send fontSize="small" />
                      </IconButton>
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
            {invoices.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} sx={{ color: '#888', textAlign: 'center', py: 3 }}>
                  No invoices yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );

  const renderCustomerHub = () => (
    <Box>
      <Typography variant="h5" sx={{ color: '#FFF', mb: 2 }}>Customer Hub</Typography>
      <Typography variant="body2" sx={{ color: '#888', mb: 3 }}>
        360° view of client financial health.
      </Typography>

      <FormControl sx={{ minWidth: 250, mb: 3 }}>
        <InputLabel sx={{ color: '#888' }}>Select Client</InputLabel>
        <Select
          value={selectedClientId}
          onChange={(e) => { setSelectedClientId(e.target.value); fetchClientHub(e.target.value); }}
          sx={{ color: '#FFF', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }}
        >
          {clients.map(c => (
            <MenuItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</MenuItem>
          ))}
        </Select>
      </FormControl>

      {hubLoading ? (
        <CircularProgress sx={{ color: '#00D4FF' }} />
      ) : clientSummary ? (
        <>
          <Paper sx={{ p: 3, bgcolor: '#1A1A1A', border: '1px solid #333', mb: 3 }}>
            <Typography variant="h6" sx={{ color: '#FFF' }}>
              {clientSummary.client.first_name} {clientSummary.client.last_name}
            </Typography>
            <Typography variant="body2" sx={{ color: '#888' }}>{clientSummary.client.email}</Typography>
            <Grid container spacing={2} sx={{ mt: 2 }}>
              <Grid item xs={6} md={3}>
                <Card sx={{ bgcolor: '#0A0A0A', border: '1px solid #333' }}>
                  <CardContent>
                    <Typography variant="body2" sx={{ color: '#888' }}>Total Invoices</Typography>
                    <Typography variant="h6" sx={{ color: '#FFF' }}>{clientSummary.totals.total_invoices}</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={6} md={3}>
                <Card sx={{ bgcolor: '#0A0A0A', border: '1px solid #333' }}>
                  <CardContent>
                    <Typography variant="body2" sx={{ color: '#888' }}>Total Billed</Typography>
                    <Typography variant="h6" sx={{ color: '#FFF' }}>${clientSummary.totals.total_billed.toFixed(2)}</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={6} md={3}>
                <Card sx={{ bgcolor: '#0A0A0A', border: '1px solid #333' }}>
                  <CardContent>
                    <Typography variant="body2" sx={{ color: '#888' }}>Total Paid</Typography>
                    <Typography variant="h6" sx={{ color: '#FFF' }}>${clientSummary.totals.total_paid.toFixed(2)}</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={6} md={3}>
                <Card sx={{ bgcolor: '#0A0A0A', border: '1px solid #333' }}>
                  <CardContent>
                    <Typography variant="body2" sx={{ color: '#888' }}>Outstanding Balance</Typography>
                    <Typography variant="h6" sx={{ color: clientSummary.totals.total_balance > 0 ? '#F44336' : '#4CAF50' }}>
                      ${clientSummary.totals.total_balance.toFixed(2)}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Paper>

          <Typography variant="subtitle1" sx={{ color: '#FFF', mt: 3 }}>Recent Invoices</Typography>
          <TableContainer component={Paper} sx={{ bgcolor: '#1A1A1A', border: '1px solid #333' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ color: '#FFF' }}>Invoice #</TableCell>
                  <TableCell sx={{ color: '#FFF' }}>Date</TableCell>
                  <TableCell sx={{ color: '#FFF' }}>Total</TableCell>
                  <TableCell sx={{ color: '#FFF' }}>Paid</TableCell>
                  <TableCell sx={{ color: '#FFF' }}>Balance</TableCell>
                  <TableCell sx={{ color: '#FFF' }}>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {clientSummary.invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell sx={{ color: '#FFF' }}>{inv.invoice_number}</TableCell>
                    <TableCell sx={{ color: '#FFF' }}>{inv.issue_date}</TableCell>
                    <TableCell sx={{ color: '#FFF' }}>${inv.total.toFixed(2)}</TableCell>
                    <TableCell sx={{ color: '#FFF' }}>${inv.paid_amount.toFixed(2)}</TableCell>
                    <TableCell sx={{ color: inv.balance > 0 ? '#F44336' : '#4CAF50' }}>
                      ${inv.balance.toFixed(2)}
                    </TableCell>
                    <TableCell>{getStatusChip(inv.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      ) : selectedClientId ? (
        <Alert severity="info">Select a client to view their hub.</Alert>
      ) : (
        <Alert severity="info">Select a client to view their financial summary.</Alert>
      )}
    </Box>
  );

  // ── Dialog: Create / Edit Invoice ──
  const renderCreateDialog = () => (
    <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ bgcolor: '#1A1A1A', color: '#FFF' }}>
        {editId ? 'Edit Invoice' : 'Create Invoice'}
      </DialogTitle>
      <DialogContent sx={{ bgcolor: '#1A1A1A', maxHeight: '80vh', overflowY: 'auto' }}>
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel sx={{ color: '#888' }}>Project (optional)</InputLabel>
              <Select
                value={form.projectId}
                onChange={(e) => {
                  setForm({ ...form, projectId: e.target.value });
                  if (e.target.value) fetchUnbilled(e.target.value);
                }}
                sx={{ color: '#FFF', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }}
              >
                <MenuItem value="">None</MenuItem>
                {projects.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel sx={{ color: '#888' }}>Client</InputLabel>
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
              label="Due Date"
              type="date"
              fullWidth
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
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
            {unbilled.length > 0 && (
              <Alert severity="info" sx={{ mb: 2 }}>
                {unbilled.length} unbilled time entries available. <Button size="small" onClick={() => {
                  const newItems = unbilled.map((u: any) => ({
                    description: `${u.employee_name || 'Employee'} – ${new Date(u.clock_in).toLocaleString()}`,
                    quantity: u.total_hours,
                    unit_price: u.amount / u.total_hours,
                    timeEntryIds: [u.id],
                  }));
                  setForm({ ...form, items: newItems });
                }}>Add All</Button>
              </Alert>
            )}
            {form.items.map((item: any, idx: number) => (
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
              label="Client Notes (shown on invoice)"
              multiline
              rows={2}
              fullWidth
              value={form.clientNotes}
              onChange={(e) => setForm({ ...form, clientNotes: e.target.value })}
              sx={{ input: { color: '#FFF' }, label: { color: '#888' } }}
            />
          </Grid>
          <Grid item xs={12}>
            <FormControlLabel
              control={
                <Switch
                  checked={form.isRecurring}
                  onChange={(e) => setForm({ ...form, isRecurring: e.target.checked })}
                  sx={{ color: '#00D4FF' }}
                />
              }
              label="Recurring Invoice"
              sx={{ color: '#FFF' }}
            />
          </Grid>
          {form.isRecurring && (
            <>
              <Grid item xs={6}>
                <FormControl fullWidth>
                  <InputLabel sx={{ color: '#888' }}>Frequency</InputLabel>
                  <Select
                    value={form.recurringFrequency}
                    onChange={(e) => setForm({ ...form, recurringFrequency: e.target.value })}
                    sx={{ color: '#FFF', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }}
                  >
                    <MenuItem value="weekly">Weekly</MenuItem>
                    <MenuItem value="monthly">Monthly</MenuItem>
                    <MenuItem value="quarterly">Quarterly</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6}>
                <TextField
                  label="End Date (optional)"
                  type="date"
                  fullWidth
                  value={form.recurringEndDate}
                  onChange={(e) => setForm({ ...form, recurringEndDate: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  sx={{ input: { color: '#FFF' }, label: { color: '#888' } }}
                />
              </Grid>
            </>
          )}
        </Grid>

        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} sx={{ bgcolor: '#00D4FF', color: '#0A0A0A' }}>
            {editId ? 'Update' : 'Create'}
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );

  // ── Dialog: Record Payment ──
  const renderPaymentDialog = () => (
    <Dialog open={paymentDialogOpen} onClose={() => setPaymentDialogOpen(false)} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ bgcolor: '#1A1A1A', color: '#FFF' }}>Record Payment</DialogTitle>
      <DialogContent sx={{ bgcolor: '#1A1A1A' }}>
        <TextField
          label="Amount"
          type="number"
          fullWidth
          value={paymentAmount}
          onChange={(e) => setPaymentAmount(Number(e.target.value))}
          sx={{ mt: 2, input: { color: '#FFF' }, label: { color: '#888' } }}
        />
        <TextField
          label="Payment Date"
          type="date"
          fullWidth
          value={paymentDate}
          onChange={(e) => setPaymentDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ mt: 2, input: { color: '#FFF' }, label: { color: '#888' } }}
        />
        <FormControl fullWidth sx={{ mt: 2 }}>
          <InputLabel sx={{ color: '#888' }}>Method</InputLabel>
          <Select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            sx={{ color: '#FFF', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }}
          >
            <MenuItem value="credit_card">Credit Card</MenuItem>
            <MenuItem value="ach">ACH</MenuItem>
            <MenuItem value="cash">Cash</MenuItem>
            <MenuItem value="check">Check</MenuItem>
            <MenuItem value="other">Other</MenuItem>
          </Select>
        </FormControl>
        <TextField
          label="Reference (optional)"
          fullWidth
          value={paymentRef}
          onChange={(e) => setPaymentRef(e.target.value)}
          sx={{ mt: 2, input: { color: '#FFF' }, label: { color: '#888' } }}
        />
        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
          <Button onClick={() => setPaymentDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleRecordPayment} sx={{ bgcolor: '#00D4FF', color: '#0A0A0A' }}>
            Record Payment
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );

  // ─── Main Render ──────────────────────────────────────────────────
  return (
    <Container maxWidth="xl" sx={{ py: 4, bgcolor: '#0A0A0A', minHeight: '100vh' }}>
      <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold', mb: 1 }}>
        📄 Invoices
      </Typography>
      <Typography variant="body1" sx={{ color: '#888', mb: 3 }}>
        Manage invoicing, client payments, and recurring schedules.
      </Typography>

      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{ mb: 3, borderBottom: '1px solid #333' }}
        textColor="primary"
        indicatorColor="primary"
      >
        <Tab label="Overview" icon={<Receipt />} iconPosition="start" />
        <Tab label="Customer Hub" icon={<People />} iconPosition="start" />
      </Tabs>

      {activeTab === 0 && renderOverview()}
      {activeTab === 1 && renderCustomerHub()}

      {renderCreateDialog()}
      {renderPaymentDialog()}
    </Container>
  );
}