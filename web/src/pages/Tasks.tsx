import React, { useState, useEffect } from 'react';
import {
  Box, Container, Typography, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Chip, Checkbox,
  CircularProgress, Alert,
} from '@mui/material';
import { Assignment } from '@mui/icons-material';

const API_BASE = 'https://future-jobs-pro-ai-production.up.railway.app';

export default function Tasks() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/tasks`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 402) { window.location.href = '/payment-required'; return; }
      if (!res.ok) throw new Error('Failed to load tasks');
      const data = await res.json();
      setTasks(data.tasks || []);
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
          <Assignment sx={{ mr: 1, verticalAlign: 'middle' }} />
          Tasks
        </Typography>
        <Typography variant="body1" sx={{ color: '#888', mb: 4 }}>
          Your company tasks and checklists
        </Typography>

        {loading && <CircularProgress sx={{ color: '#00D4FF' }} />}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {!loading && !error && (
          <Paper sx={{ bgcolor: '#1A1A1A', borderRadius: 3, border: '1px solid #333', overflow: 'hidden' }}>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ color: '#888' }}>Task</TableCell>
                    <TableCell sx={{ color: '#888' }}>Assigned To</TableCell>
                    <TableCell sx={{ color: '#888' }}>Status</TableCell>
                    <TableCell sx={{ color: '#888' }}>Done</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tasks.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} sx={{ color: '#888', textAlign: 'center', py: 4 }}>
                        No tasks found. Create one to get started!
                      </TableCell>
                    </TableRow>
                  ) : (
                    tasks.map((task: any) => (
                      <TableRow key={task.id} hover>
                        <TableCell sx={{ color: '#FFF' }}>{task.description}</TableCell>
                        <TableCell sx={{ color: '#CCC' }}>{task.assigned_name || 'Unassigned'}</TableCell>
                        <TableCell>
                          <Chip
                            label={task.status}
                            size="small"
                            sx={{
                              bgcolor: task.status === 'completed' ? '#4CAF5020' : '#FF980020',
                              color: task.status === 'completed' ? '#4CAF50' : '#FF9800',
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Checkbox disabled checked={task.status === 'completed'} sx={{ color: '#00D4FF' }} />
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