import React, { useState, useEffect } from 'react';
import {
  Box, Container, Typography, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Chip,
  CircularProgress, Alert,
} from '@mui/material';
import { Timer } from '@mui/icons-material';

const API_BASE = 'https://future-jobs-pro-ai-production.up.railway.app';

export default function Timesheet() {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchEntries();
  }, []);

  const fetchEntries = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/time-entries`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load timesheet');
      const data = await res.json();
      // data.timeEntries is expected from the backend
      setEntries(data.timeEntries || data.entries || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (start: string, end: string | null) => {
    if (!end) return 'In progress';
    const diff = new Date(end).getTime() - new Date(start).getTime();
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  };

  return (
    <Box sx={{ bgcolor: '#0A0A0A', minHeight: '100vh', py: 4 }}>
      <Container maxWidth="lg">
        <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold', mb: 1 }}>
          <Timer sx={{ mr: 1, verticalAlign: 'middle' }} />
          Timesheet
        </Typography>
        <Typography variant="body1" sx={{ color: '#888', mb: 4 }}>
          Your time entries across all projects
        </Typography>

        {loading && <CircularProgress sx={{ color: '#00D4FF' }} />}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {!loading && !error && (
          <Paper sx={{ bgcolor: '#1A1A1A', borderRadius: 3, border: '1px solid #333', overflow: 'hidden' }}>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ color: '#888' }}>Date</TableCell>
                    <TableCell sx={{ color: '#888' }}>Project</TableCell>
                    <TableCell sx={{ color: '#888' }}>Clock In</TableCell>
                    <TableCell sx={{ color: '#888' }}>Clock Out</TableCell>
                    <TableCell sx={{ color: '#888' }}>Duration</TableCell>
                    <TableCell sx={{ color: '#888' }}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {entries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} sx={{ color: '#888', textAlign: 'center', py: 4 }}>
                        No time entries yet. Start a shift from the mobile app!
                      </TableCell>
                    </TableRow>
                  ) : (
                    entries.map((entry: any, i: number) => (
                      <TableRow key={entry.id || i} hover>
                        <TableCell sx={{ color: '#FFF' }}>
                          {new Date(entry.clock_in).toLocaleDateString()}
                        </TableCell>
                        <TableCell sx={{ color: '#CCC' }}>
                          {entry.project_name || entry.project?.name || '—'}
                        </TableCell>
                        <TableCell sx={{ color: '#CCC' }}>
                          {new Date(entry.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </TableCell>
                        <TableCell sx={{ color: '#CCC' }}>
                          {entry.clock_out
                            ? new Date(entry.clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : '—'}
                        </TableCell>
                        <TableCell sx={{ color: '#FFF', fontWeight: 'bold' }}>
                          {formatDuration(entry.clock_in, entry.clock_out)}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={entry.clock_out ? 'Completed' : 'Active'}
                            size="small"
                            sx={{
                              bgcolor: entry.clock_out ? '#4CAF5020' : '#FF980020',
                              color: entry.clock_out ? '#4CAF50' : '#FF9800',
                            }}
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