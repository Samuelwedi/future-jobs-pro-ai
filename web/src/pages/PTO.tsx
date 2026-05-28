import React, { useState } from 'react';
import {
  Box, Container, Typography, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Chip, Button,
} from '@mui/material';
import { BeachAccess } from '@mui/icons-material';

const mockPTO = [
  { id: 1, type: 'Vacation', startDate: '2026-06-10', endDate: '2026-06-14', status: 'Approved', days: 5 },
  { id: 2, type: 'Sick', startDate: '2026-06-01', endDate: '2026-06-01', status: 'Pending', days: 1 },
];

export default function PTO() {
  const [requests] = useState(mockPTO);

  return (
    <Box sx={{ bgcolor: '#0A0A0A', minHeight: '100vh', py: 4 }}>
      <Container maxWidth="lg">
        <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold', mb: 1 }}>
          <BeachAccess sx={{ mr: 1, verticalAlign: 'middle' }} />
          Paid Time Off
        </Typography>
        <Typography variant="body1" sx={{ color: '#888', mb: 4 }}>
          Your PTO requests and balances
        </Typography>

        <Paper sx={{ bgcolor: '#1A1A1A', borderRadius: 3, border: '1px solid #333', overflow: 'hidden', mb: 3 }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ color: '#888' }}>Type</TableCell>
                  <TableCell sx={{ color: '#888' }}>Dates</TableCell>
                  <TableCell sx={{ color: '#888' }}>Days</TableCell>
                  <TableCell sx={{ color: '#888' }}>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {requests.map((req) => (
                  <TableRow key={req.id} hover>
                    <TableCell sx={{ color: '#FFF' }}>{req.type}</TableCell>
                    <TableCell sx={{ color: '#CCC' }}>{req.startDate} → {req.endDate}</TableCell>
                    <TableCell sx={{ color: '#FFF' }}>{req.days} day{req.days > 1 ? 's' : ''}</TableCell>
                    <TableCell>
                      <Chip
                        label={req.status}
                        size="small"
                        sx={{
                          bgcolor: req.status === 'Approved' ? '#4CAF5020' : '#FF980020',
                          color: req.status === 'Approved' ? '#4CAF50' : '#FF9800',
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        <Button variant="contained" sx={{ bgcolor: '#00D4FF', color: '#0A0A0A', px: 4, py: 1.5 }}>
          Request New PTO
        </Button>
      </Container>
    </Box>
  );
}