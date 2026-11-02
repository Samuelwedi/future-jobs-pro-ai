import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Container,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  Chip,
  IconButton,
  CircularProgress,
  Stack,
  Tabs,
  Tab,
  Alert,
  Grid,
  Card,
  CardContent,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Switch,
  FormControlLabel,
  Divider,
  InputAdornment,
} from "@mui/material";
import {
  Add,
  Delete,
  Send,
  CheckCircle,
  Edit,
  Refresh,
  Receipt,
  AttachMoney,
  People,
  Schedule,
  Visibility,
  Download,
  Payment,
  TrendingUp,
  TrendingDown,
  Description,
  Flag, // Added for milestone
} from "@mui/icons-material";
import { API_BASE } from "../services/api";
import {
  commercialKey,
  money,
  conversionDates,
  downloadCommercialPDF,
} from "../services/commercialDocuments";

// ─── Types ────────────────────────────────────────────────────────
interface Invoice {
  currency?: string;
  updated_at: string;
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
  // ─── Milestone fields ───
  milestone_name?: string;
  milestone_percentage?: number;
  parent_invoice_id?: string | null;
  parent_invoice_number?: string;
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
  client: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
  };
  invoices: Invoice[];
  projects: any[];
  totalsByCurrency: {
    currency: string | null;
    total_invoices: number;
    total_billed: number;
    total_paid: number;
    total_balance: number;
  }[];
}

interface Estimate {
  id: string;
  estimate_number: string;
  currency?: string;
  total: number;
  client_name?: string;
}

// ─── Main Component ──────────────────────────────────────────────
export default function InvoicesPage() {
  const token = localStorage.getItem("token") || "";
  const [activeTab, setActiveTab] = useState(0);

  // ── State ──
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<any>({
    currency: "CAD",
    requestKey: commercialKey(),
    expectedUpdatedAt: "",
    projectId: "",
    clientId: "",
    issueDate: new Date().toISOString().split("T")[0],
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    taxRate: 0,
    notes: "",
    clientNotes: "",
    items: [{ description: "", quantity: 1, unit_price: 0, timeEntryIds: [] }],
    isRecurring: false,
    recurringFrequency: "monthly",
    recurringEndDate: "",
    // ─── Milestone ───
    isMilestone: false,
    parentInvoiceId: "",
    milestoneName: "",
    milestonePercentage: 0,
  });
  const [projects, setProjects] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [unbilled, setUnbilled] = useState<any[]>([]);
  const [unbilledLoading, setUnbilledLoading] = useState(false);
  // ─── Parent invoices for milestone ───
  const [parentInvoices, setParentInvoices] = useState<Invoice[]>([]);

  // Customer Hub
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [clientSummary, setClientSummary] = useState<ClientSummary | null>(
    null,
  );
  const [hubLoading, setHubLoading] = useState(false);

  // Payment dialog
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentRef, setPaymentRef] = useState("");

  // Estimate conversion
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [availableEstimates, setAvailableEstimates] = useState<Estimate[]>([]);
  const [selectedEstimateId, setSelectedEstimateId] = useState("");

  // ── Fetch Functions ──
  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/invoices?limit=25&offset=${offset}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const data = await res.json();
      if (data.success) setInvoices(data.invoices);
      else setError(data.message || "Failed to load invoices");
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, [token, offset]);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/projects`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setProjects(data.projects);
    } catch (e) {
      console.error(e);
    }
  }, [token]);

  const fetchClients = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/users/company`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setClients(data.users);
    } catch (e) {
      console.error(e);
    }
  }, [token]);

  const fetchUnbilled = async (projectId: string) => {
    setUnbilledLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/invoices/unbilled?projectId=${projectId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const data = await res.json();
      if (data.success) setUnbilled(data.unbilled);
    } catch (e) {
      console.error(e);
    }
    setUnbilledLoading(false);
  };

  const fetchParentInvoices = async (projectId: string) => {
    try {
      const res = await fetch(
        `${API_BASE}/api/invoices?projectId=${projectId}&status=paid`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const data = await res.json();
      if (data.success) setParentInvoices(data.invoices);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchEstimatesForConversion = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/estimates?status=accepted`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setAvailableEstimates(data.estimates);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchInvoices();
    fetchProjects();
    fetchClients();
  }, [fetchInvoices, fetchProjects, fetchClients]);

  // ── Handlers ──
  const resetForm = () => {
    setEditId(null);
    setForm({
      currency: "CAD",
      requestKey: commercialKey(),
      expectedUpdatedAt: "",
      projectId: "",
      clientId: "",
      issueDate: new Date().toISOString().split("T")[0],
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
      taxRate: 0,
      notes: "",
      clientNotes: "",
      items: [
        { description: "", quantity: 1, unit_price: 0, timeEntryIds: [] },
      ],
      isRecurring: false,
      recurringFrequency: "monthly",
      recurringEndDate: "",
      isMilestone: false,
      parentInvoiceId: "",
      milestoneName: "",
      milestonePercentage: 0,
    });
    setUnbilled([]);
    setParentInvoices([]);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = async (invoice: Invoice) => {
    setEditId(invoice.id);
    setForm({
      currency: invoice.currency || "",
      requestKey: commercialKey(),
      expectedUpdatedAt: invoice.updated_at,
      projectId: invoice.project_id || "",
      clientId: invoice.client_id || "",
      issueDate: invoice.issue_date,
      dueDate: invoice.due_date,
      taxRate: invoice.tax_rate,
      notes: invoice.notes || "",
      clientNotes: invoice.client_notes || "",
      items: [
        { description: "", quantity: 1, unit_price: 0, timeEntryIds: [] },
      ],
      isRecurring: false,
      recurringFrequency: "monthly",
      recurringEndDate: "",
      isMilestone: !!invoice.milestone_name,
      parentInvoiceId: invoice.parent_invoice_id || "",
      milestoneName: invoice.milestone_name || "",
      milestonePercentage: invoice.milestone_percentage || 0,
    });
    // Fetch invoice items
    try {
      const res = await fetch(`${API_BASE}/api/invoices/${invoice.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success)
        throw new Error(data.message || "Unable to load draft.");
      if (data.success) {
        setForm((prev: any) => ({
          ...prev,
          expectedUpdatedAt: data.invoice.updated_at,
          currency: data.invoice.currency || "",
          isRecurring: !!data.invoice.is_recurring,
          recurringFrequency: data.invoice.recurring_frequency || "monthly",
          recurringEndDate: data.invoice.recurring_end_date || "",
          items: data.items.map((it: any) => ({
            description: it.description,
            quantity: it.quantity,
            unit_price: it.unit_price,
            timeEntryIds: it.time_entry_ids || [],
          })),
        }));
      }
    } catch (e) {
      alert("Unable to load draft. Refresh before editing.");
      return;
    }
    setDialogOpen(true);
  };

  const addItem = () => {
    setForm({
      ...form,
      items: [
        ...form.items,
        { description: "", quantity: 1, unit_price: 0, timeEntryIds: [] },
      ],
    });
  };

  const removeItem = (idx: number) => {
    if (form.items.length === 1) return;
    const updated = form.items.filter((_: any, i: number) => i !== idx);
    setForm({ ...form, items: updated });
  };

  const updateItem = (idx: number, field: string, value: any) => {
    const updated = form.items.map((item: any, i: number) =>
      i === idx ? { ...item, [field]: value } : item,
    );
    setForm({ ...form, items: updated });
  };

  const handleSave = async () => {
    // Validate
    if (form.items.some((i: any) => !i.description || i.unit_price <= 0)) {
      alert("All items must have a description and a positive price.");
      return;
    }
    // Validate milestone
    if (form.isMilestone) {
      if (!form.milestoneName) {
        alert("Please enter a milestone name.");
        return;
      }
      if (form.milestonePercentage <= 0 || form.milestonePercentage > 100) {
        alert("Milestone percentage must be between 1 and 100.");
        return;
      }
    }
    try {
      const payload = {
        currency: form.currency,
        requestKey: form.requestKey,
        expectedUpdatedAt: form.expectedUpdatedAt,
        projectId: form.projectId || null,
        clientId: form.clientId || null,
        issueDate: form.issueDate,
        dueDate: form.dueDate,
        taxRate: form.taxRate || 0,
        notes: form.notes,
        clientNotes: form.clientNotes,
        items: form.items.map((i: any) => ({
          description: i.description,
          quantity: i.quantity,
          unit_price: i.unit_price,
          timeEntryIds: i.timeEntryIds || [],
        })),
        isRecurring: form.isRecurring,
        recurringFrequency: form.recurringFrequency,
        recurringEndDate: form.recurringEndDate || null,
        // Milestone
        milestone_name: form.isMilestone ? form.milestoneName : null,
        milestone_percentage: form.isMilestone
          ? form.milestonePercentage
          : null,
        parent_invoice_id:
          form.isMilestone && form.parentInvoiceId
            ? form.parentInvoiceId
            : null,
      };

      const url = editId
        ? `${API_BASE}/api/invoices/${editId}`
        : `${API_BASE}/api/invoices`;
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setDialogOpen(false);
        fetchInvoices();
      } else {
        alert(data.message || "Save failed");
      }
    } catch (e) {
      alert("Error saving invoice");
    }
  };

  const handleSend = async (id: string) => {
    if (
      !window.confirm(
        "Have you shared this document with the customer externally? This records sharing; no email is sent.",
      )
    )
      return;
    try {
      const res = await fetch(`${API_BASE}/api/invoices/${id}/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ confirmed: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      fetchInvoices();
    } catch (e: any) {
      alert(e.message || "Unable to record external sharing.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this invoice?")) return;
    try {
      const res = await fetch(`${API_BASE}/api/invoices/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message);
      }
      fetchInvoices();
    } catch (e: any) {
      alert(e.message || "Delete failed");
    }
  };

  const openPaymentDialog = (
    invoiceId: string,
    currentPaid: number,
    total: number,
  ) => {
    setPaymentInvoiceId(invoiceId);
    setPaymentAmount(total - currentPaid);
    setPaymentDate(new Date().toISOString().split("T")[0]);
    setPaymentMethod("credit_card");
    setPaymentRef("");
    setPaymentDialogOpen(true);
  };

  const handleRecordPayment = async () => {
    if (!paymentInvoiceId) return;
    if (paymentRef.trim().length < 4) {
      alert("Provide a unique receipt reference (at least 4 characters).");
      return;
    }
    if (
      !window.confirm(
        "Record a completed external payment? No charge or bank transfer will be made.",
      )
    )
      return;
    try {
      const res = await fetch(
        `${API_BASE}/api/invoices/${paymentInvoiceId}/payments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            confirmed: true,
            amount: paymentAmount,
            paymentDate,
            method: paymentMethod,
            reference: paymentRef || undefined,
          }),
        },
      );
      const data = await res.json();
      if (data.success) {
        setPaymentDialogOpen(false);
        fetchInvoices();
      } else {
        alert(data.message || "Payment failed");
      }
    } catch (e) {
      alert("Error recording payment");
    }
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
    } catch (e) {
      console.error(e);
    }
    setHubLoading(false);
  };

  // ── Estimate conversion ──
  const handleConvertEstimate = async () => {
    if (!selectedEstimateId) return;
    const dates = conversionDates();
    if (!dates) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/estimates/${selectedEstimateId}/convert`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(dates),
        },
      );
      const data = await res.json();
      if (data.success && data.invoice) {
        alert(`Invoice ${data.invoice.invoice_number} created!`);
        fetchInvoices();
        setConvertDialogOpen(false);
        setSelectedEstimateId("");
      } else {
        alert(data.message || "Conversion failed");
      }
    } catch (e) {
      alert("Error converting estimate");
    }
  };

  // ── Render Helpers ──
  const getStatusChip = (status: string) => {
    const map: Record<string, any> = {
      draft: { color: "default", label: "Draft" },
      sent: { color: "primary", label: "Shared externally" },
      viewed: { color: "info", label: "Viewed" },
      paid: { color: "success", label: "Paid" },
      overdue: { color: "error", label: "Overdue" },
      cancelled: { color: "default", label: "Cancelled" },
    };
    return (
      <Chip
        label={map[status]?.label || status}
        color={map[status]?.color || "default"}
        size="small"
      />
    );
  };

  const getMilestoneChip = (invoice: Invoice) => {
    if (!invoice.milestone_name) return null;
    return (
      <Chip
        label={`${invoice.milestone_name} (${invoice.milestone_percentage || 0}%)`}
        size="small"
        sx={{
          bgcolor: "#00D4FF20",
          color: "#00D4FF",
          border: "1px solid #00D4FF40",
        }}
      />
    );
  };

  // ── Tab Panels ──
  const renderOverview = () => (
    <>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
        }}
      >
        <Typography variant="h5" sx={{ color: "#FFF" }}>
          All Invoices
        </Typography>
        <Box sx={{ display: "flex", gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<Description />}
            onClick={() => {
              fetchEstimatesForConversion();
              setConvertDialogOpen(true);
            }}
            sx={{ color: "#00D4FF", borderColor: "#00D4FF" }}
          >
            Create from Estimate
          </Button>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={openCreateDialog}
            sx={{ bgcolor: "#00D4FF", color: "#0A0A0A" }}
          >
            Create Invoice
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <TableContainer
        component={Paper}
        sx={{ bgcolor: "#1A1A1A", border: "1px solid #333" }}
      >
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: "#FFF" }}>Invoice #</TableCell>
              <TableCell sx={{ color: "#FFF" }}>Client</TableCell>
              <TableCell sx={{ color: "#FFF" }}>Project</TableCell>
              <TableCell sx={{ color: "#FFF" }}>Milestone</TableCell>
              <TableCell sx={{ color: "#FFF" }}>Issue Date</TableCell>
              <TableCell sx={{ color: "#FFF" }}>Due Date</TableCell>
              <TableCell sx={{ color: "#FFF" }}>Total</TableCell>
              <TableCell sx={{ color: "#FFF" }}>Balance</TableCell>
              <TableCell sx={{ color: "#FFF" }}>Status</TableCell>
              <TableCell sx={{ color: "#FFF" }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {invoices.map((inv) => (
              <TableRow key={inv.id} sx={{ borderBottom: "1px solid #333" }}>
                <TableCell sx={{ color: "#FFF" }}>
                  {inv.invoice_number}
                </TableCell>
                <TableCell sx={{ color: "#FFF" }}>
                  {inv.client_name || "—"}
                </TableCell>
                <TableCell sx={{ color: "#FFF" }}>
                  {inv.project_name || "—"}
                </TableCell>
                <TableCell>{getMilestoneChip(inv) || "—"}</TableCell>
                <TableCell sx={{ color: "#FFF" }}>{inv.issue_date}</TableCell>
                <TableCell sx={{ color: "#FFF" }}>{inv.due_date}</TableCell>
                <TableCell sx={{ color: "#FFF" }}>
                  {money(inv.total, inv.currency)}
                </TableCell>
                <TableCell
                  sx={{ color: inv.balance > 0 ? "#F44336" : "#4CAF50" }}
                >
                  {money(inv.balance, inv.currency)}
                </TableCell>
                <TableCell>{getStatusChip(inv.status)}</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="small"
                      onClick={() =>
                        downloadCommercialPDF(
                          API_BASE,
                          "invoice",
                          inv.id,
                          token,
                        ).catch((e) => alert(e.message))
                      }
                    >
                      PDF
                    </Button>
                    {inv.status === "draft" && (
                      <>
                        <IconButton
                          size="small"
                          onClick={() => openEditDialog(inv)}
                          color="primary"
                          title="Edit"
                        >
                          <Edit fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleSend(inv.id)}
                          color="info"
                          title="Record external sharing"
                        >
                          <Send fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleDelete(inv.id)}
                          color="error"
                          title="Delete"
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      </>
                    )}
                    {inv.status === "sent" && (
                      <>
                        <IconButton
                          size="small"
                          onClick={() => handleSend(inv.id)}
                          color="info"
                          title="Record external sharing"
                        >
                          <Send fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() =>
                            openPaymentDialog(
                              inv.id,
                              inv.paid_amount,
                              inv.total,
                            )
                          }
                          color="success"
                          title="Record Payment"
                        >
                          <Payment fontSize="small" />
                        </IconButton>
                      </>
                    )}
                    {inv.status === "overdue" && (
                      <IconButton
                        size="small"
                        onClick={() => handleSend(inv.id)}
                        color="error"
                        title="Record external sharing"
                      >
                        <Send fontSize="small" />
                      </IconButton>
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
            {invoices.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={10}
                  sx={{ color: "#888", textAlign: "center", py: 3 }}
                >
                  No invoices yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <Stack direction="row" spacing={2}>
        <Button
          disabled={loading || offset === 0}
          onClick={() => setOffset((n) => Math.max(0, n - 25))}
        >
          Previous
        </Button>
        <Typography sx={{ color: "#FFF" }}>
          Page {Math.floor(offset / 25) + 1}
        </Typography>
        <Button
          disabled={loading || invoices.length < 25 || offset >= 100000}
          onClick={() => setOffset((n) => n + 25)}
        >
          Next
        </Button>
      </Stack>
    </>
  );

  const renderCustomerHub = () => (
    <Box>
      <Typography variant="h5" sx={{ color: "#FFF", mb: 2 }}>
        Customer Hub
      </Typography>
      <Typography variant="body2" sx={{ color: "#888", mb: 3 }}>
        360° view of client financial health.
      </Typography>

      <FormControl sx={{ minWidth: 250, mb: 3 }}>
        <InputLabel sx={{ color: "#888" }}>Select Client</InputLabel>
        <Select
          value={selectedClientId}
          onChange={(e) => {
            setSelectedClientId(e.target.value);
            fetchClientHub(e.target.value);
          }}
          sx={{
            color: "#FFF",
            "& .MuiOutlinedInput-notchedOutline": { borderColor: "#333" },
          }}
        >
          {clients.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.first_name} {c.last_name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {hubLoading ? (
        <CircularProgress sx={{ color: "#00D4FF" }} />
      ) : clientSummary ? (
        <>
          <Paper
            sx={{ p: 3, bgcolor: "#1A1A1A", border: "1px solid #333", mb: 3 }}
          >
            <Typography variant="h6" sx={{ color: "#FFF" }}>
              {clientSummary.client.first_name} {clientSummary.client.last_name}
            </Typography>
            <Typography variant="body2" sx={{ color: "#888" }}>
              {clientSummary.client.email}
            </Typography>
            <Stack spacing={1} sx={{ mt: 2 }}>
              {clientSummary.totalsByCurrency.map((t) => (
                <Typography
                  key={t.currency || "unspecified"}
                  sx={{ color: "#FFF" }}
                >
                  {t.currency || "Unspecified currency"}: {t.total_invoices}{" "}
                  invoices · Billed {money(t.total_billed, t.currency)} ·
                  Recorded paid {money(t.total_paid, t.currency)} · Balance{" "}
                  {money(t.total_balance, t.currency)}
                </Typography>
              ))}
            </Stack>
          </Paper>

          <Typography variant="subtitle1" sx={{ color: "#FFF", mt: 3 }}>
            Recent Invoices
          </Typography>
          <TableContainer
            component={Paper}
            sx={{ bgcolor: "#1A1A1A", border: "1px solid #333" }}
          >
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ color: "#FFF" }}>Invoice #</TableCell>
                  <TableCell sx={{ color: "#FFF" }}>Date</TableCell>
                  <TableCell sx={{ color: "#FFF" }}>Total</TableCell>
                  <TableCell sx={{ color: "#FFF" }}>Paid</TableCell>
                  <TableCell sx={{ color: "#FFF" }}>Balance</TableCell>
                  <TableCell sx={{ color: "#FFF" }}>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {clientSummary.invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell sx={{ color: "#FFF" }}>
                      {inv.invoice_number}
                    </TableCell>
                    <TableCell sx={{ color: "#FFF" }}>
                      {inv.issue_date}
                    </TableCell>
                    <TableCell sx={{ color: "#FFF" }}>
                      {money(inv.total, inv.currency)}
                    </TableCell>
                    <TableCell sx={{ color: "#FFF" }}>
                      {money(inv.paid_amount, inv.currency)}
                    </TableCell>
                    <TableCell
                      sx={{ color: inv.balance > 0 ? "#F44336" : "#4CAF50" }}
                    >
                      {money(inv.balance, inv.currency)}
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
        <Alert severity="info">
          Select a client to view their financial summary.
        </Alert>
      )}
    </Box>
  );

  // ── Dialog: Create / Edit Invoice ──
  const renderCreateDialog = () => (
    <Dialog
      open={dialogOpen}
      onClose={() => setDialogOpen(false)}
      maxWidth="lg"
      fullWidth
    >
      <DialogTitle sx={{ bgcolor: "#1A1A1A", color: "#FFF" }}>
        {editId ? "Edit Invoice" : "Create Invoice"}
      </DialogTitle>
      <DialogContent
        sx={{ bgcolor: "#1A1A1A", maxHeight: "80vh", overflowY: "auto" }}
      >
        <TextField
          select
          fullWidth
          label="Currency"
          value={form.currency}
          onChange={(e) => setForm({ ...form, currency: e.target.value })}
          sx={{ mt: 2 }}
          helperText="Choose explicitly. Existing unspecified currency is never guessed."
        >
          <MenuItem value="CAD">CAD</MenuItem>
          <MenuItem value="USD">USD</MenuItem>
        </TextField>
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel sx={{ color: "#888" }}>Project (optional)</InputLabel>
              <Select
                value={form.projectId}
                onChange={(e) => {
                  setForm({ ...form, projectId: e.target.value });
                  if (e.target.value) {
                    fetchUnbilled(e.target.value);
                    fetchParentInvoices(e.target.value);
                  }
                }}
                sx={{
                  color: "#FFF",
                  "& .MuiOutlinedInput-notchedOutline": { borderColor: "#333" },
                }}
              >
                <MenuItem value="">None</MenuItem>
                {projects.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel sx={{ color: "#888" }}>Client</InputLabel>
              <Select
                value={form.clientId}
                onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                sx={{
                  color: "#FFF",
                  "& .MuiOutlinedInput-notchedOutline": { borderColor: "#333" },
                }}
              >
                <MenuItem value="">Select Client</MenuItem>
                {clients.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.first_name} {c.last_name}
                  </MenuItem>
                ))}
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
              sx={{ input: { color: "#FFF" }, label: { color: "#888" } }}
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
              sx={{ input: { color: "#FFF" }, label: { color: "#888" } }}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              label="Tax Rate (%)"
              type="number"
              fullWidth
              value={form.taxRate}
              onChange={(e) =>
                setForm({ ...form, taxRate: Number(e.target.value) })
              }
              sx={{ input: { color: "#FFF" }, label: { color: "#888" } }}
            />
          </Grid>

          {/* ─── Recurring & Milestone Toggle ─── */}
          <Grid item xs={12}>
            <FormControlLabel
              control={
                <Switch
                  checked={form.isRecurring}
                  onChange={(e) =>
                    setForm({ ...form, isRecurring: e.target.checked })
                  }
                  sx={{ color: "#00D4FF" }}
                />
              }
              label="Recurrence metadata (automatic generation unavailable)"
              sx={{ color: "#FFF" }}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={form.isMilestone}
                  onChange={(e) => {
                    setForm({ ...form, isMilestone: e.target.checked });
                    if (!e.target.checked) {
                      setForm((prev: any) => ({
                        ...prev,
                        parentInvoiceId: "",
                        milestoneName: "",
                        milestonePercentage: 0,
                      }));
                    }
                  }}
                  sx={{ color: "#00D4FF", ml: 3 }}
                />
              }
              label="Milestone Invoice"
              sx={{ color: "#FFF" }}
            />
          </Grid>

          {form.isRecurring && (
            <>
              <Grid item xs={6}>
                <FormControl fullWidth>
                  <InputLabel sx={{ color: "#888" }}>Frequency</InputLabel>
                  <Select
                    value={form.recurringFrequency}
                    onChange={(e) =>
                      setForm({ ...form, recurringFrequency: e.target.value })
                    }
                    sx={{
                      color: "#FFF",
                      "& .MuiOutlinedInput-notchedOutline": {
                        borderColor: "#333",
                      },
                    }}
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
                  onChange={(e) =>
                    setForm({ ...form, recurringEndDate: e.target.value })
                  }
                  InputLabelProps={{ shrink: true }}
                  sx={{ input: { color: "#FFF" }, label: { color: "#888" } }}
                />
              </Grid>
            </>
          )}

          {form.isMilestone && (
            <>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Milestone Name"
                  fullWidth
                  value={form.milestoneName}
                  onChange={(e) =>
                    setForm({ ...form, milestoneName: e.target.value })
                  }
                  sx={{ input: { color: "#FFF" }, label: { color: "#888" } }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  label="Milestone %"
                  type="number"
                  fullWidth
                  value={form.milestonePercentage}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      milestonePercentage: Number(e.target.value),
                    })
                  }
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end" sx={{ color: "#888" }}>
                        %
                      </InputAdornment>
                    ),
                  }}
                  sx={{ input: { color: "#FFF" }, label: { color: "#888" } }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth>
                  <InputLabel sx={{ color: "#888" }}>
                    Parent Invoice (optional)
                  </InputLabel>
                  <Select
                    value={form.parentInvoiceId}
                    onChange={(e) =>
                      setForm({ ...form, parentInvoiceId: e.target.value })
                    }
                    sx={{
                      color: "#FFF",
                      "& .MuiOutlinedInput-notchedOutline": {
                        borderColor: "#333",
                      },
                    }}
                  >
                    <MenuItem value="">None</MenuItem>
                    {parentInvoices.map((inv) => (
                      <MenuItem key={inv.id} value={inv.id}>
                        {inv.invoice_number} – {money(inv.total, inv.currency)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </>
          )}

          {/* ─── Line Items ─── */}
          <Grid item xs={12}>
            <Typography variant="subtitle1" sx={{ color: "#FFF", mt: 2 }}>
              Line Items
            </Typography>
            {unbilled.length > 0 && (
              <Alert severity="info" sx={{ mb: 2 }}>
                {unbilled.length} unbilled time entries available.{" "}
                <Button
                  size="small"
                  onClick={() => {
                    const newItems = unbilled.map((u: any) => ({
                      description: `${u.employee_name || "Employee"} – ${new Date(u.clock_in).toLocaleString()}`,
                      quantity: 1,
                      unit_price: Number(u.amount).toFixed(2),
                      timeEntryIds: [u.id],
                    }));
                    setForm({ ...form, items: newItems });
                  }}
                >
                  Add All
                </Button>
              </Alert>
            )}
            {form.items.map((item: any, idx: number) => (
              <Box key={idx} sx={{ display: "flex", gap: 1, mb: 1 }}>
                <TextField
                  placeholder="Description"
                  value={item.description}
                  onChange={(e) =>
                    updateItem(idx, "description", e.target.value)
                  }
                  sx={{ flex: 3, input: { color: "#FFF" } }}
                  size="small"
                />
                <TextField
                  type="number"
                  placeholder="Qty"
                  value={item.quantity}
                  onChange={(e) =>
                    updateItem(idx, "quantity", Number(e.target.value))
                  }
                  sx={{ flex: 1, input: { color: "#FFF" } }}
                  size="small"
                />
                <TextField
                  type="number"
                  placeholder="Unit Price"
                  value={item.unit_price}
                  onChange={(e) =>
                    updateItem(idx, "unit_price", Number(e.target.value))
                  }
                  sx={{ flex: 1, input: { color: "#FFF" } }}
                  size="small"
                />
                <IconButton
                  size="small"
                  onClick={() => removeItem(idx)}
                  color="error"
                  disabled={form.items.length === 1}
                >
                  <Delete fontSize="small" />
                </IconButton>
              </Box>
            ))}
            <Button onClick={addItem} size="small" sx={{ color: "#00D4FF" }}>
              + Add Item
            </Button>
          </Grid>

          <Grid item xs={12}>
            <TextField
              label="Notes (internal)"
              multiline
              rows={2}
              fullWidth
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              sx={{ input: { color: "#FFF" }, label: { color: "#888" } }}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              label="Client Notes (shown on invoice)"
              multiline
              rows={2}
              fullWidth
              value={form.clientNotes}
              onChange={(e) =>
                setForm({ ...form, clientNotes: e.target.value })
              }
              sx={{ input: { color: "#FFF" }, label: { color: "#888" } }}
            />
          </Grid>
        </Grid>

        <Box
          sx={{ mt: 3, display: "flex", justifyContent: "flex-end", gap: 2 }}
        >
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            sx={{ bgcolor: "#00D4FF", color: "#0A0A0A" }}
          >
            {editId ? "Update" : "Create"}
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );

  // ── Dialog: Record Payment ──
  const renderPaymentDialog = () => (
    <Dialog
      open={paymentDialogOpen}
      onClose={() => setPaymentDialogOpen(false)}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle sx={{ bgcolor: "#1A1A1A", color: "#FFF" }}>
        Record Payment
      </DialogTitle>
      <DialogContent sx={{ bgcolor: "#1A1A1A" }}>
        <TextField
          label="Amount"
          type="number"
          fullWidth
          value={paymentAmount}
          onChange={(e) => setPaymentAmount(Number(e.target.value))}
          sx={{ mt: 2, input: { color: "#FFF" }, label: { color: "#888" } }}
        />
        <TextField
          label="Payment Date"
          type="date"
          fullWidth
          value={paymentDate}
          onChange={(e) => setPaymentDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ mt: 2, input: { color: "#FFF" }, label: { color: "#888" } }}
        />
        <FormControl fullWidth sx={{ mt: 2 }}>
          <InputLabel sx={{ color: "#888" }}>Method</InputLabel>
          <Select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            sx={{
              color: "#FFF",
              "& .MuiOutlinedInput-notchedOutline": { borderColor: "#333" },
            }}
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
          sx={{ mt: 2, input: { color: "#FFF" }, label: { color: "#888" } }}
        />
        <Box
          sx={{ mt: 3, display: "flex", justifyContent: "flex-end", gap: 2 }}
        >
          <Button onClick={() => setPaymentDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleRecordPayment}
            sx={{ bgcolor: "#00D4FF", color: "#0A0A0A" }}
          >
            Record Payment
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );

  // ── Dialog: Convert Estimate ──
  const renderConvertDialog = () => (
    <Dialog
      open={convertDialogOpen}
      onClose={() => setConvertDialogOpen(false)}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle sx={{ bgcolor: "#1A1A1A", color: "#FFF" }}>
        Convert Estimate to Invoice
      </DialogTitle>
      <DialogContent sx={{ bgcolor: "#1A1A1A" }}>
        <FormControl fullWidth sx={{ mt: 2 }}>
          <InputLabel sx={{ color: "#888" }}>
            Select Accepted Estimate
          </InputLabel>
          <Select
            value={selectedEstimateId}
            onChange={(e) => setSelectedEstimateId(e.target.value)}
            sx={{
              color: "#FFF",
              "& .MuiOutlinedInput-notchedOutline": { borderColor: "#333" },
            }}
          >
            {availableEstimates.map((est) => (
              <MenuItem key={est.id} value={est.id}>
                {est.estimate_number} – {est.client_name || "No client"} –{" "}
                {money(est.total, est.currency)}
              </MenuItem>
            ))}
            {availableEstimates.length === 0 && (
              <MenuItem disabled>No accepted estimates available</MenuItem>
            )}
          </Select>
        </FormControl>
        <Box
          sx={{ mt: 3, display: "flex", justifyContent: "flex-end", gap: 2 }}
        >
          <Button onClick={() => setConvertDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleConvertEstimate}
            disabled={!selectedEstimateId}
            sx={{ bgcolor: "#00D4FF", color: "#0A0A0A" }}
          >
            Convert
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );

  // ─── Main Render ──────────────────────────────────────────────────
  return (
    <Container
      maxWidth="xl"
      sx={{ py: 4, bgcolor: "#0A0A0A", minHeight: "100vh" }}
    >
      <Typography
        variant="h4"
        sx={{ color: "#FFF", fontWeight: "bold", mb: 1 }}
      >
        📄 Invoices
      </Typography>
      <Typography variant="body1" sx={{ color: "#888", mb: 3 }}>
        Manage invoicing, client payments, milestones, and recurring schedules.
      </Typography>

      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{ mb: 3, borderBottom: "1px solid #333" }}
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
      {renderConvertDialog()}
    </Container>
  );
}
