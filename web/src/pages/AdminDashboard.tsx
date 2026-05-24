import React, { useState, useEffect } from 'react';
import {
  Box, Container, Grid, Paper, Typography, Card, CardContent, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, Tabs, Tab,
} from '@mui/material';
import { Business, People, AttachMoney, Assessment } from '@mui/icons-material';

export default function AdminDashboard() {
  const [tab, setTab] = useState(0);
  const [stats] = useState({ totalCompanies: 45, totalUsers: 320, totalProjects: 180, totalRevenue: 28500, totalTimeEntries: 1240 });

  return (
    <Box sx={{ bgcolor: '#0A0A0A', minHeight: '100vh' }}>
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold', mb: 1 }}>👑 Admin Dashboard</Typography>
        <Typography variant="body2" sx={{ color: '#888', mb: 4 }}>Platform overview and management</Typography>

        <Grid container spacing={3} sx={{ mb: 4 }}>
          {[
            { label: 'Total Companies', value: stats.totalCompanies, icon: <Business />, color: '#00D4FF' },
            { label: 'Total Users', value: stats.totalUsers, icon: <People />, color: '#4CAF50' },
            { label: 'Total Revenue', value: `$${stats.totalRevenue.toLocaleString()}`, icon: <AttachMoney />, color: '#FF9800' },
            { label: 'Time Entries', value: stats.totalTimeEntries, icon: <Assessment />, color: '#E91E63' },
          ].map((stat, i) => (
            <Grid item xs={6} md={3} key={i}>
              <Card sx={{ bgcolor: '#1A1A1A', border: '1px solid #333' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography variant="body2" sx={{ color: '#888' }}>{stat.label}</Typography>
                      <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold' }}>{stat.value}</Typography>
                    </Box>
                    <Box sx={{ color: stat.color }}>{stat.icon}</Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        <Paper sx={{ bgcolor: '#1A1A1A', borderRadius: 2, border: '1px solid #333' }}>
          <Tabs value={tab} onChange={(e, v) => setTab(v)} sx={{ borderBottom: '1px solid #333' }}>
            <Tab label="Companies" sx={{ color: '#FFF' }} />
            <Tab label="Users" sx={{ color: '#FFF' }} />
          </Tabs>
          {tab === 0 && (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    {['Name', 'Email', 'Plan', 'Status', 'Users', 'Created'].map(h => <TableCell key={h} sx={{ color: '#888' }}>{h}</TableCell>)}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {['Acme Corp', 'BuildRight Inc', 'Elite Plumbing'].map((name, i) => (
                    <TableRow key={i}>
                      <TableCell sx={{ color: '#FFF' }}>{name}</TableCell>
                      <TableCell sx={{ color: '#CCC' }}>contact@{name.toLowerCase().replace(' ', '')}.com</TableCell>
                      <TableCell><Chip label="Pro" size="small" sx={{ bgcolor: '#00D4FF20', color: '#00D4FF' }} /></TableCell>
                      <TableCell><Chip label="Active" size="small" sx={{ bgcolor: '#4CAF5020', color: '#4CAF50' }} /></TableCell>
                      <TableCell sx={{ color: '#CCC' }}>{Math.floor(Math.random() * 20) + 1}</TableCell>
                      <TableCell sx={{ color: '#CCC' }}>Jan 2024</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      </Container>
    </Box>
  );
}