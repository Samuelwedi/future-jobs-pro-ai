import React, { useState, useEffect } from 'react';
import {
  Box, Container, Typography, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Chip,
  CircularProgress, Alert, Button, Dialog, DialogTitle,
  DialogContent, TextField, Stack, IconButton, FormControl,
  InputLabel, Select, MenuItem,
} from '@mui/material';
import { Groups, Edit, Save, Cancel } from '@mui/icons-material';

const API_BASE = 'https://future-jobs-pro-ai-production.up.railway.app';

interface Member {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  sin?: string;
  date_of_birth?: string;
}

export default function Team() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [editForm, setEditForm] = useState<Partial<Member>>({});

  useEffect(() => {
    fetchTeam();
  }, []);

  const fetchTeam = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/team`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'ngrok-skip-browser-warning': 'true',
        },
      });
      if (!res.ok) throw new Error('Failed to load team');
      const data = await res.json();
      setMembers(data.members || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const openEditDialog = (member: Member) => {
    setEditingMember(member);
    setEditForm({
      first_name: member.first_name,
      last_name: member.last_name,
      email: member.email,
      role: member.role,
      sin: member.sin || '',
      date_of_birth: member.date_of_birth || '',
    });
    setEditDialogOpen(true);
  };

  const handleEditChange = (field: keyof Member, value: string) => {
    setEditForm({ ...editForm, [field]: value });
  };

  const saveMember = async () => {
    if (!editingMember) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/users/${editingMember.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) throw new Error('Failed to update member');
      setEditDialogOpen(false);
      fetchTeam();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <Box sx={{ bgcolor: '#0A0A0A', minHeight: '100vh', py: 4 }}>
      <Container maxWidth="lg">
        <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold', mb: 1 }}>
          <Groups sx={{ mr: 1, verticalAlign: 'middle' }} />
          Team Management
        </Typography>
        <Typography variant="body1" sx={{ color: '#888', mb: 4 }}>
          View and manage your crew members, including SIN and date of birth for tax purposes.
        </Typography>

        {loading && <CircularProgress sx={{ color: '#00D4FF' }} />}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {!loading && !error && (
          <Paper sx={{ bgcolor: '#1A1A1A', borderRadius: 3, border: '1px solid #333', overflow: 'hidden' }}>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ color: '#888' }}>Name</TableCell>
                    <TableCell sx={{ color: '#888' }}>Email</TableCell>
                    <TableCell sx={{ color: '#888' }}>Role</TableCell>
                    <TableCell sx={{ color: '#888' }}>SIN</TableCell>
                    <TableCell sx={{ color: '#888' }}>Date of Birth</TableCell>
                    <TableCell sx={{ color: '#888' }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {members.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} sx={{ color: '#888', textAlign: 'center', py: 4 }}>
                        No team members found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    members.map((member) => (
                      <TableRow key={member.id} hover>
                        <TableCell sx={{ color: '#FFF' }}>
                          {member.first_name} {member.last_name}
                        </TableCell>
                        <TableCell sx={{ color: '#CCC' }}>{member.email}</TableCell>
                        <TableCell>
                          <Chip
                            label={member.role}
                            size="small"
                            sx={{
                              bgcolor: member.role === 'boss' ? '#00D4FF20' : '#4CAF5020',
                              color: member.role === 'boss' ? '#00D4FF' : '#4CAF50',
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ color: '#FFF' }}>
                          {member.sin || '—'}
                        </TableCell>
                        <TableCell sx={{ color: '#FFF' }}>
                          {member.date_of_birth || '—'}
                        </TableCell>
                        <TableCell>
                          <IconButton size="small" onClick={() => openEditDialog(member)} color="primary">
                            <Edit fontSize="small" />
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
      </Container>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: '#1A1A1A', color: '#FFF' }}>Edit Employee</DialogTitle>
        <DialogContent sx={{ bgcolor: '#1A1A1A' }}>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="First Name"
              value={editForm.first_name || ''}
              onChange={(e) => handleEditChange('first_name', e.target.value)}
              fullWidth
              sx={{ input: { color: '#FFF' }, label: { color: '#888' } }}
            />
            <TextField
              label="Last Name"
              value={editForm.last_name || ''}
              onChange={(e) => handleEditChange('last_name', e.target.value)}
              fullWidth
              sx={{ input: { color: '#FFF' }, label: { color: '#888' } }}
            />
            <TextField
              label="Email"
              value={editForm.email || ''}
              onChange={(e) => handleEditChange('email', e.target.value)}
              fullWidth
              sx={{ input: { color: '#FFF' }, label: { color: '#888' } }}
            />
            <FormControl fullWidth>
              <InputLabel sx={{ color: '#888' }}>Role</InputLabel>
              <Select
                value={editForm.role || ''}
                onChange={(e) => handleEditChange('role', e.target.value)}
                sx={{ color: '#FFF', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }}
              >
                <MenuItem value="employee">Employee</MenuItem>
                <MenuItem value="manager">Manager</MenuItem>
                <MenuItem value="boss">Boss</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="SIN (9 digits)"
              value={editForm.sin || ''}
              onChange={(e) => handleEditChange('sin', e.target.value)}
              fullWidth
              placeholder="123456789"
              sx={{ input: { color: '#FFF' }, label: { color: '#888' } }}
            />
            <TextField
              label="Date of Birth"
              type="date"
              value={editForm.date_of_birth || ''}
              onChange={(e) => handleEditChange('date_of_birth', e.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
              sx={{ input: { color: '#FFF' }, label: { color: '#888' } }}
            />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 2 }}>
              <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
              <Button variant="contained" onClick={saveMember} sx={{ bgcolor: '#00D4FF', color: '#0A0A0A' }}>
                Save
              </Button>
            </Box>
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  );
}