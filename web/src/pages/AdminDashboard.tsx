import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Container, Grid, Paper, Typography, Card, CardContent,
  CircularProgress, Alert, Chip, LinearProgress,
} from '@mui/material';
import {
  People, Work, AttachMoney, TrendingUp, TrendingDown,
} from '@mui/icons-material';

const API_BASE = 'https://future-jobs-pro-ai-production.up.railway.app';

interface AdminStats {
  totalEmployees: number;
  activeJobs: number;
  totalProjects: number;
  totalPayrollThisMonth: number;
  revenueThisMonth: number;
  marginToday: number;
  marginChange: number;
}

export default function AdminDashboard() {
  const token = localStorage.getItem('token') || '';
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAdminData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch stats from the same dashboard endpoint
      const res = await fetch(`${API_BASE}/api/dashboard/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch admin data');
      const data = await res.json();

      // Map to admin stats (add more fields if available from backend)
      setStats({
        totalEmployees: data.totalEmployees || 0,
        activeJobs: data.activeJobs || 0,
        totalProjects: data.totalProjects || 0, // if not provided, set to 0 or derive
        totalPayrollThisMonth: data.totalPayrollThisMonth || 0,
        revenueThisMonth: data.revenueToday || 0,
        marginToday: data.marginToday || 0,
        marginChange: data.marginChange || 0,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAdminData();
  }, [fetchAdminData]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh' }}>
        <CircularProgress sx={{ color: '#00D4FF' }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }

  const safeStats = stats || {
    totalEmployees: 0,
    activeJobs: 0,
    totalProjects: 0,
    totalPayrollThisMonth: 0,
    revenueThisMonth: 0,
    marginToday: 0,
    marginChange: 0,
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold', mb: 4 }}>
        📊 Admin Dashboard
      </Typography>

      <Grid container spacing={3}>
        {/* KPI Cards */}
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: '#1A1A1A', border: '1px solid #333' }}>
            <CardContent>
              <Typography variant="body2" sx={{ color: '#888' }}>Total Employees</Typography>
              <Typography variant="h4" sx={{ color: '#00D4FF', fontWeight: 'bold' }}>
                {safeStats.totalEmployees}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                <People sx={{ color: '#00D4FF', mr: 1 }} />
                <Typography variant="caption" sx={{ color: '#888' }}>Active users</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: '#1A1A1A', border: '1px solid #333' }}>
            <CardContent>
              <Typography variant="body2" sx={{ color: '#888' }}>Active Jobs</Typography>
              <Typography variant="h4" sx={{ color: '#4CAF50', fontWeight: 'bold' }}>
                {safeStats.activeJobs}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                <Work sx={{ color: '#4CAF50', mr: 1 }} />
                <Typography variant="caption" sx={{ color: '#888' }}>In progress</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: '#1A1A1A', border: '1px solid #333' }}>
            <CardContent>
              <Typography variant="body2" sx={{ color: '#888' }}>Revenue This Month</Typography>
              <Typography variant="h4" sx={{ color: '#FF9800', fontWeight: 'bold' }}>
                ${safeStats.revenueThisMonth.toLocaleString()}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                <AttachMoney sx={{ color: '#FF9800', mr: 1 }} />
                <Typography variant="caption" sx={{ color: '#888' }}>Gross revenue</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: '#1A1A1A', border: '1px solid #333' }}>
            <CardContent>
              <Typography variant="body2" sx={{ color: '#888' }}>Today's Margin</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold' }}>
                  {safeStats.marginToday.toFixed(1)}%
                </Typography>
                {safeStats.marginChange > 0 ? (
                  <TrendingUp fontSize="small" sx={{ color: '#4CAF50', ml: 1 }} />
                ) : (
                  <TrendingDown fontSize="small" sx={{ color: '#F44336', ml: 1 }} />
                )}
              </Box>
              <LinearProgress
                variant="determinate"
                value={Math.min(safeStats.marginToday, 100)}
                sx={{ mt: 1, height: 6, borderRadius: 3, bgcolor: '#333', '& .MuiLinearProgress-bar': { bgcolor: '#4CAF50' } }}
              />
            </CardContent>
          </Card>
        </Grid>

        {/* Extended admin info */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3, bgcolor: '#1A1A1A', border: '1px solid #333' }}>
            <Typography variant="h6" sx={{ color: '#FFF', mb: 2 }}>📋 Company Overview</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Typography variant="body2" sx={{ color: '#888' }}>Total Projects</Typography>
                <Typography variant="h6" sx={{ color: '#FFF' }}>{safeStats.totalProjects || 0}</Typography>
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="body2" sx={{ color: '#888' }}>Payroll This Month</Typography>
                <Typography variant="h6" sx={{ color: '#FFF' }}>
                  ${safeStats.totalPayrollThisMonth?.toLocaleString() || '0'}
                </Typography>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
}