import React, { useState, useEffect } from 'react';
import {
  Container, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, Dialog, DialogTitle, DialogContent,
  TextField, Box, Chip, IconButton, CircularProgress,
  Stack, Select, MenuItem, FormControl, InputLabel,
} from '@mui/material';
import { Add, Delete, Send, CheckCircle, Edit } from '@mui/icons-material';

const API_BASE = 'https://future-jobs-pro-ai-production.up.railway.app';

interface Invoice {
  id: string;
  invoice_number: string;
  project_id: string | null;
  project_name?: string;
  issue_date: string;
  due_date: string;
  status: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  notes: string;
  sent_at?: string;
  paid_at?: string;
  created_by_name?: string;
}

interface InvoiceItem {
  description: string;
  quantity: number;
  unit_price: number;
  timeEntryIds?: string[];
}

// Type for fetched item from API (includes id, invoice_id, etc.)
interface FetchedInvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  time_entry_ids: string[];
  created_at: string;
}

export default function InvoicesPage() {
  const token = localStorage.getItem('token') || '';
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // Form fields
  const [projectId, setProjectId] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [taxRate, setTaxRate] = useState(0);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<InvoiceItem[]>([
    { description: '', quantity: 1, unit_price: 0 },
  ]);
  const [projects, setProjects] = useState<any[]>([]);

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/invoices`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setInvoices(data.invoices);
    } catch (e) { console.error(e); }
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

  useEffect(() => { fetchInvoices(); fetchProjects(); }, []);

  const resetForm = () => {
    setEditId(null);
    setProjectId('');
    setIssueDate(new Date().toISOString().split('T')[0]);
    setDueDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    setTaxRate(0);
    setNotes('');
    setItems([{ description: '', quantity: 1, unit_price: 0 }]);
  };

  const openCreateDialog = () => { resetForm(); setDialogOpen(true); };

  const openEditDialog = (invoice: Invoice) => {
    setEditId(invoice.id);
    setProjectId(invoice.project_id || '');
    setIssueDate(invoice.issue_date);
    setDueDate(invoice.due_date);
    setTaxRate(invoice.tax_rate);
    setNotes(invoice.notes || '');
    // Fetch invoice items
    fetch(`${API_BASE}/api/invoices/${invoice.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          // Map fetched items to InvoiceItem format with proper type
          const fetchedItems: InvoiceItem[] = data.items.map((it: FetchedInvoiceItem) => ({
            description: it.description,
            quantity: it.quantity,
            unit_price: it.unit_price,
            timeEntryIds: it.time_entry_ids || [],
          }));
          setItems(fetchedItems);
        }
      });
    setDialogOpen(true);
  };

  const addItem = () => {
    setItems([...items, { description: '', quantity: 1, unit_price: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    const updated = [...items];
    // create a new item object to avoid TS indexing issues and maintain immutability
    updated[index] = { ...updated[index], [field]: value } as InvoiceItem;
    setItems(updated);
  };

  const handleSave = async () => {
    const payload = {
      projectId: projectId || null,
      issueDate,
      dueDate,
      taxRate,
      notes,
      items: items.map(it => ({
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unit_price,
        timeEntryIds: it.timeEntryIds || [],
      })),
    };

    try {
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

  const handleSend = async (id: string) => {
    try {
      await fetch(`${API_BASE}/api/invoices/${id}/send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchInvoices();
    } catch (e) { alert('Failed to send'); }
  };

  const handleMarkPaid = async (id: string) => {
    try {
      await fetch(`${API_BASE}/api/invoices/${id}/mark-paid`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchInvoices();
    } catch (e) { alert('Failed to mark paid'); }
  };

  const getStatusChip = (status: string) => {
    const colors: Record<string, any> = {
      draft: { color: 'default', label: 'Draft' },
      sent: { color: 'primary', label: 'Sent' },
      paid: { color: 'success', label: 'Paid' },
      overdue: { color: 'error', label: 'Overdue' },
      cancelled: { color: 'default', label: 'Cancelled' },
    };
    return <Chip label={colors[status]?.label || status} color={colors[status]?.color || 'default'} size="small" />;
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>;

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ color: '#FFF' }}>📄 Invoices</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={openCreateDialog} sx={{ bgcolor: '#00D4FF', color: '#0A0A0A' }}>
          Create Invoice
        </Button>
      </Box>

      <TableContainer component={Paper} sx={{ bgcolor: '#1A1A1A', border: '1px solid #333' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: '#FFF' }}>Invoice #</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Project</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Issue Date</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Due Date</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Total</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Status</TableCell>
              <TableCell sx={{ color: '#FFF' }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {invoices.map((inv) => (
              <TableRow key={inv.id} sx={{ borderBottom: '1px solid #333' }}>
                <TableCell sx={{ color: '#FFF' }}>{inv.invoice_number}</TableCell>
                <TableCell sx={{ color: '#FFF' }}>{inv.project_name || 'N/A'}</TableCell>
                <TableCell sx={{ color: '#FFF' }}>{inv.issue_date}</TableCell>
                <TableCell sx={{ color: '#FFF' }}>{inv.due_date}</TableCell>
                <TableCell sx={{ color: '#FFF' }}>${inv.total.toFixed(2)}</TableCell>
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
                      <IconButton size="small" onClick={() => handleMarkPaid(inv.id)} color="success" title="Mark Paid">
                        <CheckCircle fontSize="small" />
                      </IconButton>
                    )}
                    {inv.status === 'paid' && (
                      <Chip label="Paid" color="success" size="small" />
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
            {invoices.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} sx={{ color: '#888', textAlign: 'center', py: 3 }}>
                  No invoices yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Invoice Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ bgcolor: '#1A1A1A', color: '#FFF' }}>
          {editId ? 'Edit Invoice' : 'Create Invoice'}
        </DialogTitle>
        <DialogContent sx={{ bgcolor: '#1A1A1A' }}>
          <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
            <TextField
              label="Issue Date"
              type="date"
              fullWidth
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ input: { color: '#FFF' }, label: { color: '#888' } }}
            />
            <TextField
              label="Due Date"
              type="date"
              fullWidth
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ input: { color: '#FFF' }, label: { color: '#888' } }}
            />
          </Box>

          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel sx={{ color: '#888' }}>Project (optional)</InputLabel>
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} sx={{ color: '#FFF' }}>
              <MenuItem value="">None</MenuItem>
              {projects.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
            </Select>
          </FormControl>

          <TextField
            label="Tax Rate (%)"
            type="number"
            fullWidth
            value={taxRate}
            onChange={(e) => setTaxRate(Number(e.target.value))}
            sx={{ mt: 2, input: { color: '#FFF' }, label: { color: '#888' } }}
          />

          <Typography variant="subtitle1" sx={{ color: '#FFF', mt: 3, mb: 1 }}>Line Items</Typography>
          {items.map((item, idx) => (
            <Box key={idx} sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <TextField
                placeholder="Description"
                value={item.description}
                onChange={(e) => updateItem(idx, 'description', e.target.value)}
                sx={{ flex: 2, input: { color: '#FFF' } }}
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
                placeholder="Price"
                value={item.unit_price}
                onChange={(e) => updateItem(idx, 'unit_price', Number(e.target.value))}
                sx={{ flex: 1, input: { color: '#FFF' } }}
                size="small"
              />
              <IconButton size="small" onClick={() => removeItem(idx)} color="error" disabled={items.length === 1}>
                <Delete fontSize="small" />
              </IconButton>
            </Box>
          ))}
          <Button onClick={addItem} size="small" sx={{ color: '#00D4FF' }}>+ Add Item</Button>

          <TextField
            label="Notes"
            multiline
            rows={2}
            fullWidth
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            sx={{ mt: 2, input: { color: '#FFF' }, label: { color: '#888' } }}
          />

          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={handleSave} sx={{ bgcolor: '#00D4FF', color: '#0A0A0A' }}>
              {editId ? 'Update' : 'Create'}
            </Button>
          </Box>
        </DialogContent>
      </Dialog>
    </Container>
  );
}