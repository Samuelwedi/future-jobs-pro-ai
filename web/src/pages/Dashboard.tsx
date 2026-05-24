import React, { useState, useEffect } from 'react';
import {
  Box, Container, Grid, Paper, Typography, Card, CardContent,
  AppBar, Toolbar, IconButton, Avatar, Chip, LinearProgress, Button,
} from '@mui/material';
import {
  Notifications, TrendingUp, TrendingDown, AccessTime,
  Work, People, AttachMoney,
} from '@mui/icons-material';
import {
  AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

const COLORS = ['#00D4FF', '#4CAF50', '#FF9800', '#F44336'];

export default function Dashboard() {
  const [stats] = useState({
    activeJobs: 12, totalEmployees: 28, hoursToday: 142.5, revenueToday: 8475, marginToday: 34.2, alertsCount: 3,
  });

  const profitData = [
    { time: '8AM', margin: 38 }, { time: '10AM', margin: 35 }, { time: '12PM', margin: 32 },
    { time: '2PM', margin: 34 }, { time: '4PM', margin: 36 },
  ];

  const jobStatusData = [
    { name: 'Active', value: 12 }, { name: 'Completed', value: 8 },
    { name: 'On Hold', value: 3 }, { name: 'Cancelled', value: 1 },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: '#0A0A0A' }}>
      <AppBar position="static" sx={{ bgcolor: '#1A1A1A', borderBottom: '1px solid #333' }}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1, color: '#00D4FF', fontWeight: 'bold' }}>
            🚀 Future Jobs Pro AI
          </Typography>
          <IconButton color="inherit"><Notifications /></IconButton>
          <IconButton><Avatar sx={{ bgcolor: '#00D4FF', width: 40, height: 40 }}>JB</Avatar></IconButton>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ mt: 3, mb: 3, flex: 1 }}>
        <Box sx={{ mb: 3 }}>
          <Chip label="👑 Boss Mode" sx={{ bgcolor: '#00D4FF20', color: '#00D4FF', border: '1px solid #00D4FF40', fontWeight: 'bold' }} />
          <Typography variant="body2" sx={{ color: '#888', mt: 1 }}>Welcome back, John Bossman</Typography>
        </Box>

        {/* Live Profit Pulse */}
        <Paper sx={{ p: 3, mb: 3, bgcolor: '#1A1A1A', borderRadius: 2, border: '1px solid #333' }}>
          <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 600, mb: 2 }}>💰 Live Profit Pulse</Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={3}>
              <Card sx={{ bgcolor: '#0A0A0A', border: '1px solid #333' }}>
                <CardContent>
                  <Typography variant="body2" sx={{ color: '#888' }}>Today's Margin</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold' }}>{stats.marginToday}%</Typography>
                    <TrendingDown fontSize="small" sx={{ color: '#F44336' }} />
                    <Typography variant="body2" sx={{ color: '#F44336' }}>2.1%</Typography>
                  </Box>
                  <LinearProgress variant="determinate" value={stats.marginToday} sx={{ mt: 1, height: 6, borderRadius: 3, bgcolor: '#333', '& .MuiLinearProgress-bar': { bgcolor: '#4CAF50' } }} />
                </CardContent>
              </Card>
            </Grid>
            {[
              { label: 'Active Jobs', value: stats.activeJobs, icon: <Work />, color: '#00D4FF' },
              { label: 'Employees', value: stats.totalEmployees, icon: <People />, color: '#4CAF50' },
              { label: 'Hours Today', value: `${stats.hoursToday}h`, icon: <AccessTime />, color: '#FF9800' },
            ].map((stat) => (
              <Grid item xs={6} md={3} key={stat.label}>
                <Card sx={{ bgcolor: '#0A0A0A', border: '1px solid #333' }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Box>
                        <Typography variant="body2" sx={{ color: '#888' }}>{stat.label}</Typography>
                        <Typography variant="h5" sx={{ color: '#FFF', fontWeight: 'bold' }}>{stat.value}</Typography>
                      </Box>
                      <Box sx={{ color: stat.color }}>{stat.icon}</Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
          <Box sx={{ mt: 3, height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={profitData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="time" stroke="#888" />
                <YAxis stroke="#888" />
                <Tooltip contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid #333' }} />
                <Area type="monotone" dataKey="margin" stroke="#00D4FF" fill="#00D4FF20" />
              </AreaChart>
            </ResponsiveContainer>
          </Box>
        </Paper>

        {/* Job Distribution */}
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, bgcolor: '#1A1A1A', borderRadius: 2, border: '1px solid #333' }}>
              <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 600, mb: 2 }}>Job Status</Typography>
              <Box sx={{ height: 250 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={jobStatusData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                      {jobStatusData.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid #333' }} />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            </Paper>
          </Grid>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, bgcolor: '#1A1A1A', borderRadius: 2, border: '1px solid #F4433640' }}>
              <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 600, mb: 2 }}>⚠️ Dispute Risk Alerts</Typography>
              {[
                { project: 'Maple HVAC Install', risk: 87, issue: 'Tech arrived 22min late + client history' },
                { project: 'Pine Plumbing Repair', risk: 72, issue: 'Job duration 45min over estimate' },
              ].map((alert, i) => (
                <Box key={i} sx={{ p: 2, bgcolor: '#0A0A0A', borderRadius: 1, border: '1px solid #333', mb: 1 }}>
                  <Typography sx={{ color: '#FFF', fontWeight: 500 }}>{alert.project}</Typography>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                    <Typography variant="body2" sx={{ color: '#888' }}>{alert.issue}</Typography>
                    <Chip label={`Risk: ${alert.risk}`} size="small" sx={{ bgcolor: '#F4433620', color: '#F44336' }} />
                  </Box>
                </Box>
              ))}
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}