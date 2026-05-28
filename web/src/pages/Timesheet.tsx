import React, { useState, useEffect } from 'react';
import {
  Box, Container, Typography, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Chip,
} from '@mui/material';
import { Timer } from '@mui/icons-material';

const mockEntries = [
  { date: '2026-05-23', project: 'Maple HVAC Install', clockIn: '08:02', clockOut: '16:15', hours: 7.8, status: 'Approved' },
  { date: '2026-05-24', project: 'Pine Plumbing Repair', clockIn: '08:15', clockOut: '15:50', hours: 7.1, status: 'Pending' },
  { date: '2026-05-25', project: 'Birch Electrical', clockIn: '07:45', clockOut: '16:30', hours: 8.2, status: 'Approved' },
];

export default function Timesheet() {
  const [entries] = useState(mockEntries);

  return (
    <Box sx={{ bgcolor: '#0A0A0A', minHeight: '100vh', py: 4 }}>
      <Container maxWidth="lg">
        <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold', mb: 1 }}>
          <Timer sx={{ mr: 1, verticalAlign: 'middle' }} />
          Timesheet
        </Typography>
        <Typography variant="body1" sx={{ color: '#888', mb: 4 }}>
          Your recent time entries
        </Typography>

        <Paper sx={{ bgcolor: '#1A1A1A', borderRadius: 3, border: '1px solid #333', overflow: 'hidden' }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ color: '#888' }}>Date</TableCell>
                  <TableCell sx={{ color: '#888' }}>Project</TableCell>
                  <TableCell sx={{ color: '#888' }}>Clock In</TableCell>
                  <TableCell sx={{ color: '#888' }}>Clock Out</TableCell>
                  <TableCell sx={{ color: '#888' }}>Hours</TableCell>
                  <TableCell sx={{ color: '#888' }}>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {entries.map((entry, i) => (
                  <TableRow key={i} hover>
                    <TableCell sx={{ color: '#FFF' }}>{entry.date}</TableCell>
                    <TableCell sx={{ color: '#CCC' }}>{entry.project}</TableCell>
                    <TableCell sx={{ color: '#CCC' }}>{entry.clockIn}</TableCell>
                    <TableCell sx={{ color: '#CCC' }}>{entry.clockOut}</TableCell>
                    <TableCell sx={{ color: '#FFF', fontWeight: 'bold' }}>{entry.hours}h</TableCell>
                    <TableCell>
                      <Chip
                        label={entry.status}
                        size="small"
                        sx={{
                          bgcolor: entry.status === 'Approved' ? '#4CAF5020' : '#FF980020',
                          color: entry.status === 'Approved' ? '#4CAF50' : '#FF9800',
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Container>
    </Box>
  );
}