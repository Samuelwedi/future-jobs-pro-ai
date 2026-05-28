import React, { useState, useEffect } from 'react';
import {
  Box, Container, Typography, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Chip,
  CircularProgress, Alert,
} from '@mui/material';
import { Work } from '@mui/icons-material';

const API_BASE = 'https://balancing-treble-prevent.ngrok-free.dev';

export default function Projects() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/projects/active`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load projects');
      const data = await res.json();
      setProjects(data.projects || []);
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
          <Work sx={{ mr: 1, verticalAlign: 'middle' }} />
          Projects
        </Typography>
        <Typography variant="body1" sx={{ color: '#888', mb: 4 }}>
          Active and upcoming projects
        </Typography>

        {loading && <CircularProgress sx={{ color: '#00D4FF' }} />}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {!loading && !error && (
          <Paper sx={{ bgcolor: '#1A1A1A', borderRadius: 3, border: '1px solid #333', overflow: 'hidden' }}>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ color: '#888' }}>Project Name</TableCell>
                    <TableCell sx={{ color: '#888' }}>Client</TableCell>
                    <TableCell sx={{ color: '#888' }}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {projects.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} sx={{ color: '#888', textAlign: 'center', py: 4 }}>
                        No projects found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    projects.map((proj: any) => (
                      <TableRow key={proj.id} hover>
                        <TableCell sx={{ color: '#FFF' }}>{proj.name}</TableCell>
                        <TableCell sx={{ color: '#CCC' }}>{proj.client_name || '—'}</TableCell>
                        <TableCell>
                          <Chip
                            label="Active"
                            size="small"
                            sx={{ bgcolor: '#4CAF5020', color: '#4CAF50' }}
                          />
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