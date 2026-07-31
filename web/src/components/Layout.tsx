import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import {
  Box, Typography, List, ListItemButton, ListItemIcon, ListItemText,
  Avatar, AppBar, Toolbar, IconButton, Badge,
  Menu, MenuItem,
} from '@mui/material';
import {
  Notifications, Brightness4, Person, Logout as LogoutIcon,
  Dashboard as DashboardIcon, CalendarMonth, Assessment,
  Groups, Folder, Timer, Chat, Assignment, BeachAccess,
  TouchApp, Settings, Link as LinkIcon,
  SmartToy, Mic, SupportAgent, AttachMoney, Receipt, Description,
  Lock as LockIcon, Info as InfoIcon, Article as ArticleIcon,
  Help as HelpIcon, PrivacyTip as PrivacyTipIcon, ContactSupport as ContactSupportIcon,
  Star as StarIcon, PlayArrow as PlayArrowIcon,
  Folder as FolderIcon,
  // NEW ICONS
  People, MyLocation, Stars, BusinessCenter,
} from '@mui/icons-material';

// Navigation items – now includes new pages
const navItems = [
  { label: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard' },
  { label: 'Team', icon: <Groups />, path: '/team' },
  { label: 'Employee Portal', icon: <Person />, path: '/employee-portal' },
  { label: 'Schedule', icon: <CalendarMonth />, path: '/schedule' },
  { label: 'Timesheet', icon: <Timer />, path: '/timesheet' },
  { label: 'Tasks', icon: <Assignment />, path: '/tasks' },
  { label: 'PTO', icon: <BeachAccess />, path: '/pto' },
  { label: 'Projects', icon: <Folder />, path: '/projects' },
  { label: 'Media Folders', icon: <FolderIcon />, path: '/media' },
  { label: 'Chat', icon: <Chat />, path: '/chat' },
  { label: 'Support', icon: <SupportAgent />, path: '/support' },
  { label: 'Payroll', icon: <AttachMoney />, path: '/payroll' },
  { label: 'Direct Deposit', icon: <AttachMoney />, path: '/direct-deposit' },
  { label: 'Year‑End', icon: <Receipt />, path: '/year-end' },
  { label: 'Invoices', icon: <Receipt />, path: '/invoices' },
  { label: 'Estimates', icon: <Description />, path: '/estimates' },
  { label: 'Reports', icon: <Assessment />, path: '/reports' },
  { label: 'Admin Dashboard', icon: <DashboardIcon />, path: '/admin-dashboard' },
  { label: 'Kiosk', icon: <TouchApp />, path: '/kiosk' },
  { label: 'Ask Lucy', icon: <SmartToy />, path: '/ask-lucy' },
  { label: 'Voice Assistant', icon: <Mic />, path: '/voice-assistant' },
  { label: 'Integrations', icon: <LinkIcon />, path: '/integrations' },
  { label: 'Settings', icon: <Settings />, path: '/settings' },
  { label: 'Security', icon: <LockIcon />, path: '/security' },
  { label: 'About', icon: <InfoIcon />, path: '/about' },
  { label: 'Blog', icon: <ArticleIcon />, path: '/blog' },
  { label: 'FAQ', icon: <HelpIcon />, path: '/faq' },
  { label: 'Privacy', icon: <PrivacyTipIcon />, path: '/privacy' },
  { label: 'Terms', icon: <Description />, path: '/terms' },
  { label: 'Contact', icon: <ContactSupportIcon />, path: '/contact' },
  { label: 'Pricing', icon: <AttachMoney />, path: '/pricing' },
  { label: 'Features', icon: <StarIcon />, path: '/features' },
  { label: 'Demo', icon: <PlayArrowIcon />, path: '/demo' },
  // ✅ NEW SIDEBAR ITEMS (boss/manager only – will be conditionally shown)
  { label: 'Company Settings', icon: <Settings />, path: '/company-settings', role: 'boss' },
  { label: 'Crew Clock', icon: <People />, path: '/crew-clock', role: 'boss' },
  { label: 'Crew Tracker', icon: <MyLocation />, path: '/crew-tracking', role: 'boss' },
  { label: 'Subscription', icon: <Stars />, path: '/subscription', role: 'boss' },
  // Note: GPSPlayback is accessed from Timesheet, not in sidebar.
  // NewChat is accessed from Chat page or directly via button.
];

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<any>(null);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

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

  const initials = user
    ? `${user.firstName?.charAt(0) || ''}${user.lastName?.charAt(0) || ''}`
    : 'U';

  // Filter navItems based on user role (boss/manager only for certain items)
  const filteredNavItems = navItems.filter(item => {
    if (item.role && user) {
      return user.role === 'boss' || user.role === 'manager';
    }
    return true;
  });

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: '#0A0A0A' }}>
      {/* Sidebar */}
      <Box sx={{ width: 260, bgcolor: '#111', borderRight: '1px solid #222', display: 'flex', flexDirection: 'column', pt: 2, pb: 2, flexShrink: 0 }}>
        <Box sx={{ px: 2, mb: 3 }}>
          <Typography sx={{ color: '#00D4FF', fontWeight: 'bold', fontSize: 18 }}>🚀 Future Jobs Pro</Typography>
          <Typography variant="caption" sx={{ color: '#666' }}>Samuel B.</Typography>
        </Box>
        <List sx={{ flex: 1, overflowY: 'auto' }}>
          {filteredNavItems.map((item) => {
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
        <ListItemButton onClick={handleLogout} sx={{ mx: 1, borderRadius: 2, color: '#F44336', '&:hover': { bgcolor: 'rgba(244,67,54,0.1)' } }}>
          <ListItemIcon sx={{ minWidth: 36, color: '#F44336' }}><LogoutIcon /></ListItemIcon>
          <ListItemText primary="Logout" primaryTypographyProps={{ fontSize: 14 }} />
        </ListItemButton>
      </Box>

      {/* Main content */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <AppBar position="static" sx={{ bgcolor: '#1A1A1A', borderBottom: '1px solid #333', boxShadow: 'none' }}>
          <Toolbar>
            <Typography variant="h6" sx={{ flexGrow: 1, color: '#FFF', fontWeight: 'bold' }}>
              Welcome back, {user?.fullName || user?.firstName || 'User'}
            </Typography>
            <IconButton color="inherit"><Badge badgeContent={3} color="error"><Notifications /></Badge></IconButton>
            <IconButton color="inherit"><Brightness4 /></IconButton>
            <IconButton onClick={(e) => setAnchorEl(e.currentTarget)} sx={{ p: 0 }}>
              <Avatar sx={{ bgcolor: '#00D4FF', width: 40, height: 40 }}>{initials}</Avatar>
            </IconButton>
            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={() => setAnchorEl(null)}
              PaperProps={{ sx: { bgcolor: '#1A1A1A', border: '1px solid #333' } }}
            >
              <MenuItem onClick={() => { navigate('/settings'); setAnchorEl(null); }} sx={{ color: '#FFF' }}>
                <ListItemIcon><Person sx={{ color: '#FFF' }} /></ListItemIcon>
                Profile
              </MenuItem>
              <MenuItem onClick={handleLogout} sx={{ color: '#FFF' }}>
                <ListItemIcon><LogoutIcon sx={{ color: '#F44336' }} /></ListItemIcon>
                Logout
              </MenuItem>
            </Menu>
          </Toolbar>
        </AppBar>

        <Box component="main" sx={{ flex: 1, p: 3, bgcolor: '#0A0A0A' }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}