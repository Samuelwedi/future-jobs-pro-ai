import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box, Container, Grid, Paper, Typography, Card, CardContent,
  Chip, LinearProgress, CircularProgress, Alert, Snackbar,
} from '@mui/material';
import {
  TrendingDown, TrendingUp, AccessTime, Work, People,
} from '@mui/icons-material';
import {
  AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

const COLORS = ['#00D4FF', '#4CAF50', '#FF9800', '#F44336'];
const API_BASE = 'https://future-jobs-pro-ai-production.up.railway.app';

interface DashboardStats {
  activeJobs: number;
  totalEmployees: number;
  hoursToday: number;
  revenueToday: number;
  marginToday: number;
  marginChange: number;
}

interface ProfitDataPoint {
  time: string;
  margin: number;
}

interface JobStatusItem {
  name: string;
  value: number;
}

interface DisputeAlert {
  project: string;
  risk: number;
  issue: string;
}

export default function Dashboard() {
  const token = localStorage.getItem('token') || '';

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [profitData, setProfitData] = useState<ProfitDataPoint[]>([]);
  const [jobStatusData, setJobStatusData] = useState<JobStatusItem[]>([]);
  const [disputeAlerts, setDisputeAlerts] = useState<DisputeAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardData = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const statsRes = await fetch(`${API_BASE}/api/dashboard/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!statsRes.ok) throw new Error('Failed to fetch stats');
      const statsData = await statsRes.json();
      setStats(statsData);

      const profitRes = await fetch(`${API_BASE}/api/dashboard/profit-timeline`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (profitRes.ok) {
        const profitData = await profitRes.json();
        setProfitData(profitData);
      } else {
        setProfitData([]);
      }

      const jobStatusRes = await fetch(`${API_BASE}/api/dashboard/job-status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (jobStatusRes.ok) {
        const jobData = await jobStatusRes.json();
        setJobStatusData(jobData);
      } else {
        setJobStatusData([]);
      }

      const alertsRes = await fetch(`${API_BASE}/api/dashboard/dispute-alerts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (alertsRes.ok) {
        const alertsData = await alertsRes.json();
        setDisputeAlerts(alertsData);
      } else {
        setDisputeAlerts([]);
      }
    } catch (err: any) {
      console.error('Dashboard fetch error:', err);
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(() => fetchDashboardData(), 60000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  if (loading && !stats) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh' }}>
        <CircularProgress sx={{ color: '#00D4FF' }} />
      </Box>
    );
  }

  const safeStats = stats || {
    activeJobs: 0,
    totalEmployees: 0,
    hoursToday: 0,
    revenueToday: 0,
    marginToday: 0,
    marginChange: 0,
  };

  const safeProfitData = profitData.length > 0 ? profitData : [
    { time: '8AM', margin: 0 }, { time: '10AM', margin: 0 },
    { time: '12PM', margin: 0 }, { time: '2PM', margin: 0 },
    { time: '4PM', margin: 0 },
  ];

  const safeJobStatus = jobStatusData.length > 0 ? jobStatusData : [
    { name: 'No Data', value: 1 },
  ];

  const safeAlerts = disputeAlerts.length > 0 ? disputeAlerts : [
    { project: 'No alerts', risk: 0, issue: 'All projects are performing well' },
  ];

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Snackbar open={!!error} autoHideDuration={6000} onClose={() => setError(null)}>
        <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
      </Snackbar>

      <Box sx={{ mb: 3 }}>
        <Chip label="👑 Boss Mode" sx={{ bgcolor: '#00D4FF20', color: '#00D4FF', border: '1px solid #00D4FF40', fontWeight: 'bold' }} />
        {refreshing && <CircularProgress size={20} sx={{ ml: 2, color: '#00D4FF' }} />}
      </Box>

      {/* ---------- LIVE PROFIT PULSE ---------- */}
      <Paper sx={{ p: 3, mb: 3, bgcolor: '#1A1A1A', borderRadius: 2, border: '1px solid #333' }}>
        <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 600, mb: 2 }}>💰 Live Profit Pulse</Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} md={3}>
            <Card sx={{ bgcolor: '#0A0A0A', border: '1px solid #333' }}>
              <CardContent>
                <Typography variant="body2" sx={{ color: '#888' }}>Today's Margin</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold' }}>
                    {safeStats.marginToday.toFixed(1)}%
                  </Typography>
                  {safeStats.marginChange > 0 ? (
                    <TrendingUp fontSize="small" sx={{ color: '#4CAF50' }} />
                  ) : (
                    <TrendingDown fontSize="small" sx={{ color: '#F44336' }} />
                  )}
                  <Typography variant="body2" sx={{ color: safeStats.marginChange > 0 ? '#4CAF50' : '#F44336' }}>
                    {safeStats.marginChange > 0 ? '+' : ''}{safeStats.marginChange.toFixed(1)}%
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={Math.min(safeStats.marginToday, 100)}
                  sx={{ mt: 1, height: 6, borderRadius: 3, bgcolor: '#333', '& .MuiLinearProgress-bar': { bgcolor: '#4CAF50' } }}
                />
              </CardContent>
            </Card>
          </Grid>
          {[
            { label: 'Active Jobs', value: safeStats.activeJobs, icon: <Work />, color: '#00D4FF' },
            { label: 'Employees', value: safeStats.totalEmployees, icon: <People />, color: '#4CAF50' },
            { label: 'Hours Today', value: `${safeStats.hoursToday.toFixed(1)}h`, icon: <AccessTime />, color: '#FF9800' },
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
        <Box sx={{ height: 250, minHeight: 200, mt: 2 }}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <AreaChart data={safeProfitData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="time" stroke="#888" />
              <YAxis stroke="#888" domain={[0, 100]} />
              <Tooltip contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid #333' }} />
              <Area type="monotone" dataKey="margin" stroke="#00D4FF" fill="#00D4FF20" />
            </AreaChart>
          </ResponsiveContainer>
        </Box>
      </Paper>

      {/* ---------- JOB DISTRIBUTION & DISPUTE ALERTS ---------- */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, bgcolor: '#1A1A1A', borderRadius: 2, border: '1px solid #333' }}>
            <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 600, mb: 2 }}>Job Status</Typography>
            <Box sx={{ height: 250, minHeight: 200 }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <PieChart>
                  <Pie data={safeJobStatus} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                    {safeJobStatus.map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
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
            {safeAlerts.length === 0 ? (
              <Typography sx={{ color: '#888', textAlign: 'center', py: 3 }}>No alerts – all projects are in good standing.</Typography>
            ) : (
              safeAlerts.map((alert, i) => (
                <Box key={i} sx={{ p: 2, bgcolor: '#0A0A0A', borderRadius: 1, border: '1px solid #333', mb: 1 }}>
                  <Typography sx={{ color: '#FFF', fontWeight: 500 }}>{alert.project}</Typography>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                    <Typography variant="body2" sx={{ color: '#888' }}>{alert.issue}</Typography>
                    <Chip label={`Risk: ${alert.risk}%`} size="small" sx={{ bgcolor: '#F4433620', color: '#F44336' }} />
                  </Box>
                </Box>
              ))
            )}
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
}