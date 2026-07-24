import React, { useState, useEffect } from 'react';
import {
  Box, Container, Typography, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Chip,
  CircularProgress, Alert, IconButton, Dialog, DialogTitle,
  DialogContent, TextField, Button, Stack,
} from '@mui/material';
import { Groups, Edit } from '@mui/icons-material';

const API_BASE = 'https://future-jobs-pro-ai-production.up.railway.app';

export default function Team() {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [editForm, setEditForm] = useState({ sin: '', dateOfBirth: '' });

  useEffect(() => {
    fetchTeam();
  }, []);

  const fetchTeam = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/users/company`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load team');
      const data = await res.json();
      setMembers(data.users || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const openEditDialog = (member: any) => {
    setSelectedMember(member);
    setEditForm({
      sin: member.sin || '',
      dateOfBirth: member.date_of_birth || '',
    });
    setEditDialogOpen(true);
  };

  const saveTaxInfo = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/users/${selectedMember.id}/tax-info`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          sin: editForm.sin || null,
          dateOfBirth: editForm.dateOfBirth || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEditDialogOpen(false);
        fetchTeam();
      } else {
        alert(data.message || 'Update failed');
      }
    } catch (e) {
      alert('Error saving tax info');
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
          View and manage crew members – click the edit icon to update SIN and Date of Birth for tax purposes.
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
                    <TableCell sx={{ color: '#888' }}>DOB</TableCell>
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
                    members.map((member: any) => (
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
                          {member.sin ? '****' + member.sin.slice(-4) : '—'}
                        </TableCell>
                        <TableCell sx={{ color: '#FFF' }}>
                          {member.date_of_birth ? new Date(member.date_of_birth).toLocaleDateString() : '—'}
                        </TableCell>
                        <TableCell>
                          <IconButton size="small" onClick={() => openEditDialog(member)}>
                            <Edit sx={{ color: '#00D4FF' }} />
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
        <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ bgcolor: '#1A1A1A', color: '#FFF' }}>
            Tax Information for {selectedMember?.first_name} {selectedMember?.last_name}
          </DialogTitle>
          <DialogContent sx={{ bgcolor: '#0A0A0A' }}>
            <TextField
              label="SIN (9 digits)"
              fullWidth
              value={editForm.sin}
              onChange={(e) => setEditForm({ ...editForm, sin: e.target.value })}
              sx={{ mt: 2, input: { color: '#FFF' }, label: { color: '#888' } }}
            />
            <TextField
              label="Date of Birth"
              type="date"
              fullWidth
              value={editForm.dateOfBirth}
              onChange={(e) => setEditForm({ ...editForm, dateOfBirth: e.target.value })}
              InputLabelProps={{ shrink: true }}
              sx={{ mt: 2, input: { color: '#FFF' }, label: { color: '#888' } }}
            />
            <Stack direction="row" spacing={2} sx={{ mt: 3, justifyContent: 'flex-end' }}>
              <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
              <Button variant="contained" onClick={saveTaxInfo} sx={{ bgcolor: '#00D4FF', color: '#0A0A0A' }}>
                Save
              </Button>
            </Stack>
          </DialogContent>
        </Dialog>
      </Container>
    </Box>
  );
}