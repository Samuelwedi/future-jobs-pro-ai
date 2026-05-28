import React, { useState, useEffect } from 'react';
import {
  Box, Container, Typography, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Chip,
  CircularProgress, Alert,
} from '@mui/material';
import { Groups } from '@mui/icons-material';

const API_BASE = 'https://balancing-treble-prevent.ngrok-free.dev';

export default function Team() {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  return (
    <Box sx={{ bgcolor: '#0A0A0A', minHeight: '100vh', py: 4 }}>
      <Container maxWidth="lg">
        <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold', mb: 1 }}>
          <Groups sx={{ mr: 1, verticalAlign: 'middle' }} />
          Team Management
        </Typography>
        <Typography variant="body1" sx={{ color: '#888', mb: 4 }}>
          View and manage your crew members
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
                    <TableCell sx={{ color: '#888' }}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {members.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} sx={{ color: '#888', textAlign: 'center', py: 4 }}>
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
                        <TableCell>
                          <Chip label="Active" size="small" sx={{ bgcolor: '#4CAF5020', color: '#4CAF50' }} />
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
    </Box>
  );
}