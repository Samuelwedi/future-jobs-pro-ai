import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box, Container, Grid, Paper, Typography, Card, CardContent,
  AppBar, Toolbar, IconButton, Avatar, Chip, LinearProgress,
  List, ListItemButton, ListItemIcon, ListItemText, Button,
} from '@mui/material';
import {
  Notifications, TrendingDown, AccessTime, Work, People,
  Dashboard as DashboardIcon, CalendarMonth, Assessment,
  Groups, Folder, Timer, Chat, Assignment, BeachAccess,
  TouchApp, Settings, Logout, Link as LinkIcon,
  Mic, MicOff,
} from '@mui/icons-material';
import {
  AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

const COLORS = ['#00D4FF', '#4CAF50', '#FF9800', '#F44336'];
const API_BASE = 'https://future-jobs-pro-ai-production.up.railway.app';

const navItems = [
  { label: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard' },
  { label: 'Schedule', icon: <CalendarMonth />, path: '/schedule' },
  { label: 'Reports', icon: <Assessment />, path: '/reports' },
  { label: 'Team', icon: <Groups />, path: '/team' },
  { label: 'Projects', icon: <Folder />, path: '/projects' },
  { label: 'Timesheet', icon: <Timer />, path: '/timesheet' },
  { label: 'Chat', icon: <Chat />, path: '/chat' },
  { label: 'Tasks', icon: <Assignment />, path: '/tasks' },
  { label: 'PTO', icon: <BeachAccess />, path: '/pto' },
  { label: 'Kiosk', icon: <TouchApp />, path: '/kiosk' },
  { label: 'Settings', icon: <Settings />, path: '/settings' },
  { label: 'Integrations', icon: <LinkIcon />, path: '/integrations' },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();

  const [user, setUser] = useState<any>(null);
  const [stats] = useState({
    activeJobs: 12, totalEmployees: 28, hoursToday: 142.5,
    revenueToday: 8475, marginToday: 34.2,
  });

  const profitData = [
    { time: '8AM', margin: 38 }, { time: '10AM', margin: 35 },
    { time: '12PM', margin: 32 }, { time: '2PM', margin: 34 },
    { time: '4PM', margin: 36 },
  ];

  const jobStatusData = [
    { name: 'Active', value: 12 }, { name: 'Completed', value: 8 },
    { name: 'On Hold', value: 3 }, { name: 'Cancelled', value: 1 },
  ];

  // ---- Voice command states ----
  const [voiceText, setVoiceText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const startVoice = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in your browser.');
      return;
    }
    const rec = new SpeechRecognition();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setVoiceText(transcript);
      setIsListening(false);
      alert(`🗣️ You said: "${transcript}"\nVoice assistant coming soon!`);
    };
    rec.onerror = () => setIsListening(false);
    rec.onend = () => setIsListening(false);
    rec.start();
    recognitionRef.current = rec;
    setIsListening(true);
  };

  const stopVoice = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };
  // --------------------------------

  useEffect(() => {
    try {
      const stored = localStorage.getItem('user');
      if (stored) setUser(JSON.parse(stored));
    } catch {}
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const fullName = user ? (user.fullName || `${user.firstName} ${user.lastName}`) : 'User';
  const initials = user
    ? `${user.firstName?.charAt(0) || ''}${user.lastName?.charAt(0) || ''}`
    : 'U';

  const trialEndDate = user?.trialEndsAt ? new Date(user.trialEndsAt) : null;
  const trialActive = trialEndDate && trialEndDate > new Date();
  const daysLeft = trialActive ? Math.ceil((trialEndDate!.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0;

  const handleAddPayment = async () => {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_BASE}/api/stripe/create-setup-session`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else alert('Failed to start payment setup');
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: '#0A0A0A' }}>
      {/* ===== SIDEBAR ===== */}
      <Box
        sx={{
          width: 260, bgcolor: '#111', borderRight: '1px solid #222',
          display: 'flex', flexDirection: 'column', pt: 2, pb: 2, flexShrink: 0,
        }}
      >
        <Box sx={{ px: 2, mb: 3 }}>
          <Typography sx={{ color: '#00D4FF', fontWeight: 'bold', fontSize: 18 }}>
            🚀 Future Jobs Pro
          </Typography>
          <Typography variant="caption" sx={{ color: '#666' }}>Samuel B.</Typography>
        </Box>

        <List sx={{ flex: 1 }}>
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <ListItemButton
                key={item.path}
                onClick={() => navigate(item.path)}
                sx={{
                  mx: 1, borderRadius: 2, mb: 0.5,
                  color: isActive ? '#00D4FF' : '#AAA',
                  bgcolor: isActive ? 'rgba(0,212,255,0.1)' : 'transparent',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' },
                }}
              >
                <ListItemIcon sx={{ minWidth: 36, color: 'inherit' }}>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: 14 }} />
              </ListItemButton>
            );
          })}
        </List>

        <ListItemButton
          onClick={handleLogout}
          sx={{ mx: 1, borderRadius: 2, color: '#F44336', '&:hover': { bgcolor: 'rgba(244,67,54,0.1)' } }}
        >
          <ListItemIcon sx={{ minWidth: 36, color: '#F44336' }}><Logout /></ListItemIcon>
          <ListItemText primary="Logout" primaryTypographyProps={{ fontSize: 14 }} />
        </ListItemButton>
      </Box>

      {/* ===== MAIN CONTENT ===== */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <AppBar position="static" sx={{ bgcolor: '#1A1A1A', borderBottom: '1px solid #333', boxShadow: 'none' }}>
          <Toolbar>
            <Typography variant="h6" sx={{ flexGrow: 1, color: '#FFF', fontWeight: 'bold' }}>
              Welcome back, {fullName}
            </Typography>
            <IconButton color="inherit"><Notifications /></IconButton>
            <IconButton><Avatar sx={{ bgcolor: '#00D4FF', width: 40, height: 40 }}>{initials}</Avatar></IconButton>
          </Toolbar>
        </AppBar>

        {/* ===== TRIAL BANNER ===== */}
        {user && (
          <Box sx={{
            bgcolor: trialActive ? '#1A1A2E' : '#F4433620',
            p: 2, textAlign: 'center', borderBottom: '1px solid #333'
          }}>
            {trialActive ? (
              <Typography sx={{ color: '#00D4FF' }}>
                Trial ends in {daysLeft} day{daysLeft !== 1 ? 's' : ''}.
                <Button href="/pricing" sx={{ ml: 2, color: '#00D4FF', textDecoration: 'underline' }}>
                  Upgrade
                </Button>
              </Typography>
            ) : (
              <>
                <Typography sx={{ color: '#F44336', mb: 1 }}>
                  Your trial has expired. Please add a payment method to continue.
                </Typography>
                <Button variant="contained" onClick={handleAddPayment}
                  sx={{ bgcolor: '#F44336', color: '#FFF' }}>
                  Add Payment Method
                </Button>
              </>
            )}
          </Box>
        )}

        <Container maxWidth="xl" sx={{ mt: 3, mb: 3, flex: 1 }}>
          <Box sx={{ mb: 3 }}>
            <Chip label="👑 Boss Mode" sx={{ bgcolor: '#00D4FF20', color: '#00D4FF', border: '1px solid #00D4FF40', fontWeight: 'bold' }} />
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
                    <LinearProgress variant="determinate" value={stats.marginToday}
                      sx={{ mt: 1, height: 6, borderRadius: 3, bgcolor: '#333',
                        '& .MuiLinearProgress-bar': { bgcolor: '#4CAF50' } }} />
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
            <Box sx={{ height: 250, minHeight: 200, mt: 2 }}>
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
                <Box sx={{ height: 250, minHeight: 200 }}>
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

        {/* ===== FLOATING VOICE BUTTON ===== */}
        <Box sx={{ position: 'fixed', bottom: 32, right: 32, zIndex: 1000 }}>
          <IconButton
            onClick={isListening ? stopVoice : startVoice}
            sx={{
              bgcolor: isListening ? '#F44336' : '#00D4FF',
              width: 56,
              height: 56,
              boxShadow: 4,
              '&:hover': { bgcolor: isListening ? '#D32F2F' : '#0097A7' },
            }}
          >
            {isListening ? <MicOff sx={{ color: '#FFF' }} /> : <Mic sx={{ color: '#0A0A0A' }} />}
          </IconButton>
        </Box>
      </Box>
    </Box>
  );
}