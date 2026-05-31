import React, { useState, useEffect } from 'react';
import {
  Box, Container, Typography, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Chip,
  CircularProgress, Alert,
} from '@mui/material';
import { BeachAccess } from '@mui/icons-material';

const API_BASE = 'https://future-jobs-pro-ai-production.up.railway.app';

export default function PTO() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchPTO();
  }, []);

  const fetchPTO = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/pto`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 402) { window.location.href = '/payment-required'; return; }
      if (!res.ok) throw new Error('Failed to load PTO requests');
      const data = await res.json();
      setRequests(data.requests || []);
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
          <BeachAccess sx={{ mr: 1, verticalAlign: 'middle' }} />
          Paid Time Off
        </Typography>
        <Typography variant="body1" sx={{ color: '#888', mb: 4 }}>
          PTO requests across your company
        </Typography>

        {loading && <CircularProgress sx={{ color: '#00D4FF' }} />}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {!loading && !error && (
          <Paper sx={{ bgcolor: '#1A1A1A', borderRadius: 3, border: '1px solid #333', overflow: 'hidden' }}>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ color: '#888' }}>Employee</TableCell>
                    <TableCell sx={{ color: '#888' }}>Type</TableCell>
                    <TableCell sx={{ color: '#888' }}>Dates</TableCell>
                    <TableCell sx={{ color: '#888' }}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {requests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} sx={{ color: '#888', textAlign: 'center', py: 4 }}>
                        No PTO requests yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    requests.map((req: any) => (
                      <TableRow key={req.id} hover>
                        <TableCell sx={{ color: '#FFF' }}>{req.user_name}</TableCell>
                        <TableCell sx={{ color: '#CCC' }}>{req.type}</TableCell>
                        <TableCell sx={{ color: '#CCC' }}>
                          {new Date(req.start_date).toLocaleDateString()} → {new Date(req.end_date).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={req.status}
                            size="small"
                            sx={{
                              bgcolor: req.status === 'approved' ? '#4CAF5020' : '#FF980020',
                              color: req.status === 'approved' ? '#4CAF50' : '#FF9800',
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