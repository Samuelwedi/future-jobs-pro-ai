import React, { useState, useEffect, useRef } from "react";
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
  Chip,
  CircularProgress,
  Alert,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  Button,
  Stack,
} from "@mui/material";
import { Groups, Edit } from "@mui/icons-material";
import ResourceAttachments from "../components/ResourceAttachments";
import { API_BASE } from "../services/api";

export default function Team() {
  const editSeq = useRef(0),
    editToken = useRef("");
  const [editable, setEditable] = useState<Record<string, boolean>>({}),
    [saving, setSaving] = useState(false);
  const close = () => {
    if (!saving) {
      editSeq.current++;
      editToken.current = "";
      setEditDialogOpen(false);
      setSelectedMember(null);
      setEditForm({ sin: "", dateOfBirth: "" });
    }
  };
  useEffect(
    () => () => {
      editSeq.current++;
      editToken.current = "";
    },
    [],
  );
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [editForm, setEditForm] = useState({ sin: "", dateOfBirth: "" });

  useEffect(() => {
    fetchTeam();
  }, []);

  const fetchTeam = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/api/users/company`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load team");
      const data = await res.json();
      setMembers(data.users || []);
      const admin = await fetch(`${API_BASE}/api/company-admin/overview`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (admin.ok) {
        const d = await admin.json();
        setEditable(
          Object.fromEntries(
            (d.employees || []).map((e: any) => [e.id, e.canManage === true]),
          ),
        );
      } else setEditable({});
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const openEditDialog = async (member: any) => {
    const seq = ++editSeq.current,
      token = localStorage.getItem("token") || "";
    editToken.current = token;
    setSelectedMember(null);
    setEditDialogOpen(false);
    setEditForm({ sin: "", dateOfBirth: "" });
    try {
      const response = await fetch(
          `${API_BASE}/api/company-admin/employees/${member.id}`,
          { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
        ),
        body = await response.json();
      if (seq !== editSeq.current || token !== localStorage.getItem("token"))
        return;
      if (!response.ok) throw Error(body.message);
      const e = body.employee;
      setSelectedMember({
        ...member,
        first_name: e.firstName,
        last_name: e.lastName,
        recordVersion: e.recordVersion,
        maskedSin: e.tax.maskedSin,
      });
      setEditForm({ sin: "", dateOfBirth: e.dateOfBirth || "" });
      setEditDialogOpen(true);
    } catch (e: any) {
      if (seq === editSeq.current) setError(e.message);
    }
  };

  const saveTaxInfo = async () => {
    if (saving || !selectedMember) return;
    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      if (!token || token !== editToken.current)
        throw Error("Account changed. Reopen the employee record.");
      const res = await fetch(
        `${API_BASE}/api/company-admin/employees/${selectedMember.id}/tax`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            expectedVersion: selectedMember.recordVersion,
            sin: editForm.sin,
            dateOfBirth: editForm.dateOfBirth || null,
          }),
        },
      );
      const data = await res.json();
      if (
        token !== editToken.current ||
        token !== localStorage.getItem("token")
      )
        return;
      if (data.success) {
        setEditDialogOpen(false);
        setSelectedMember(null);
        setEditForm({ sin: "", dateOfBirth: "" });
        fetchTeam();
      } else {
        alert(data.message || "Update failed");
      }
    } catch (e: any) {
      alert(e.message || "Error saving tax info");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ bgcolor: "#0A0A0A", minHeight: "100vh", py: 4 }}>
      <Container maxWidth="lg">
        <Typography
          variant="h4"
          sx={{ color: "#FFF", fontWeight: "bold", mb: 1 }}
        >
          <Groups sx={{ mr: 1, verticalAlign: "middle" }} />
          Team Management
        </Typography>
        <Typography variant="body1" sx={{ color: "#888", mb: 4 }}>
          View team contacts. Permitted administrators can edit employee tax
          details; protected accounts use their dedicated workflows.
        </Typography>

        {loading && <CircularProgress sx={{ color: "#00D4FF" }} />}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {!loading && !error && (
          <Paper
            sx={{
              bgcolor: "#1A1A1A",
              borderRadius: 3,
              border: "1px solid #333",
              overflow: "hidden",
            }}
          >
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ color: "#888" }}>Name</TableCell>
                    <TableCell sx={{ color: "#888" }}>Email</TableCell>
                    <TableCell sx={{ color: "#888" }}>Role</TableCell>
                    <TableCell sx={{ color: "#888" }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {members.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        sx={{ color: "#888", textAlign: "center", py: 4 }}
                      >
                        No team members found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    members.map((member: any) => (
                      <TableRow key={member.id} hover>
                        <TableCell sx={{ color: "#FFF" }}>
                          {member.first_name} {member.last_name}
                        </TableCell>
                        <TableCell sx={{ color: "#CCC" }}>
                          {member.email}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={member.role}
                            size="small"
                            sx={{
                              bgcolor:
                                member.role === "boss"
                                  ? "#00D4FF20"
                                  : "#4CAF5020",
                              color:
                                member.role === "boss" ? "#00D4FF" : "#4CAF50",
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <IconButton
                            aria-label="Edit employee tax information"
                            disabled={!editable[member.id]}
                            size="small"
                            onClick={() => void openEditDialog(member)}
                          >
                            <Edit sx={{ color: "#00D4FF" }} />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}

        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onClose={close} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ bgcolor: "#1A1A1A", color: "#FFF" }}>
            Tax Information for {selectedMember?.first_name}{" "}
            {selectedMember?.last_name}
          </DialogTitle>
          <DialogContent sx={{ bgcolor: "#0A0A0A" }}>
            <TextField
              label="New SIN (9 digits)"
              type="password"
              helperText={`Current: ${selectedMember?.maskedSin || "Not set"}. Blank preserves the existing identifier.`}
              fullWidth
              value={editForm.sin}
              onChange={(e) =>
                setEditForm({ ...editForm, sin: e.target.value })
              }
              sx={{ mt: 2, input: { color: "#FFF" }, label: { color: "#888" } }}
            />
            <TextField
              label="Date of Birth"
              type="date"
              fullWidth
              value={editForm.dateOfBirth}
              onChange={(e) =>
                setEditForm({ ...editForm, dateOfBirth: e.target.value })
              }
              InputLabelProps={{ shrink: true }}
              sx={{ mt: 2, input: { color: "#FFF" }, label: { color: "#888" } }}
            />
            <Stack
              direction="row"
              spacing={2}
              sx={{ mt: 3, justifyContent: "flex-end" }}
            >
              <Button disabled={saving} onClick={close}>
                Cancel
              </Button>
              <Button
                disabled={saving}
                variant="contained"
                onClick={saveTaxInfo}
                sx={{ bgcolor: "#00D4FF", color: "#0A0A0A" }}
              >
                Save
              </Button>
            </Stack>
            {selectedMember && (
              <Box sx={{ mt: 3 }}>
                <ResourceAttachments
                  target="subjectUserId"
                  targetId={selectedMember.id}
                  title="Employee documents"
                />
              </Box>
            )}
          </DialogContent>
        </Dialog>
      </Container>
    </Box>
  );
}
