import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  Typography,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  Collapse,
  Divider,
  Avatar,
  Menu,
  MenuItem,
  Tooltip,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  CalendarMonth,
  Assessment,
  Groups,
  Folder,
  Timer,
  Chat,
  Assignment,
  BeachAccess,
  TouchApp,
  Settings,
  Logout as LogoutIcon,
  Link as LinkIcon,
  SmartToy,
  Mic,
  SupportAgent,
  AttachMoney,
  Receipt,
  Description,
  Lock as LockIcon,
  Info as InfoIcon,
  Article as ArticleIcon,
  Help as HelpIcon,
  PrivacyTip as PrivacyTipIcon,
  ContactSupport as ContactSupportIcon,
  Star as StarIcon,
  Person,
  Brightness4,
  Brightness7,
  ExpandLess,
  ExpandMore,
  Folder as FolderIcon,
  AccountBalance,
  Calculate,
  ReceiptLong,
  AdminPanelSettings,
  Work,
  People,
  Gavel,
} from '@mui/icons-material';
import NotificationCenter from './NotificationCenter';
import { useAppTheme } from './AppThemeProvider';

// ─── Navigation Configuration ──────────────────────────────────
const navConfig = [
  {
    category: 'Main',
    items: [
      { label: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard' },
    ],
  },
  {
    category: 'People',
    items: [
      { label: 'Team', icon: <Groups />, path: '/team' },
      { label: 'Employee Portal', icon: <Person />, path: '/employee-portal' },
      { label: 'PTO', icon: <BeachAccess />, path: '/pto' },
    ],
  },
  {
    category: 'Work',
    items: [
      { label: 'Schedule', icon: <CalendarMonth />, path: '/schedule' },
      { label: 'Timesheet', icon: <Timer />, path: '/timesheet' },
      { label: 'Tasks', icon: <Assignment />, path: '/tasks' },
      { label: 'Projects', icon: <Folder />, path: '/projects' },
      { label: 'Evidence Center', icon: <Gavel />, path: '/evidence' },
    ],
  },
  {
    category: 'Communication',
    items: [
      { label: 'Chat', icon: <Chat />, path: '/chat' },
      { label: 'Support', icon: <SupportAgent />, path: '/support' },
      { label: 'Ask Lucy', icon: <SmartToy />, path: '/ask-lucy' },
      { label: 'Voice Assistant', icon: <Mic />, path: '/voice-assistant' },
    ],
  },
  {
    category: 'Payroll & Finance',
    items: [
      { label: 'Payroll', icon: <AttachMoney />, path: '/payroll' },
      { label: 'Direct Deposit', icon: <AccountBalance />, path: '/direct-deposit' },
      { label: 'Year‑End', icon: <Receipt />, path: '/year-end' },
      { label: 'Finalized T4 Slips', icon: <ArticleIcon />, path: '/year-end/finalized' },
      { label: 'Invoices', icon: <ReceiptLong />, path: '/invoices' },
      { label: 'Estimates', icon: <Description />, path: '/estimates' },
    ],
  },
  {
    category: 'Reports & Admin',
    items: [
      { label: 'Reports', icon: <Assessment />, path: '/reports' },
      { label: 'Admin Dashboard', icon: <AdminPanelSettings />, path: '/admin-dashboard' },
      { label: 'Kiosk', icon: <TouchApp />, path: '/kiosk' },
    ],
  },
  {
    category: 'Integrations & Settings',
    items: [
      { label: 'Integrations', icon: <LinkIcon />, path: '/integrations' },
      { label: 'Settings', icon: <Settings />, path: '/settings' },
      { label: 'Security', icon: <LockIcon />, path: '/security' },
    ],
  },
  {
    category: 'Company',
    items: [
      { label: 'About', icon: <InfoIcon />, path: '/about' },
      { label: 'Blog', icon: <ArticleIcon />, path: '/blog' },
      { label: 'FAQ', icon: <HelpIcon />, path: '/faq' },
      { label: 'Privacy', icon: <PrivacyTipIcon />, path: '/privacy' },
      { label: 'Terms', icon: <Description />, path: '/terms' },
      { label: 'Contact', icon: <ContactSupportIcon />, path: '/contact' },
      { label: 'Pricing', icon: <AttachMoney />, path: '/pricing' },
      { label: 'Features', icon: <StarIcon />, path: '/features' },
    ],
  },
  // Optional: Media Folders (already included under 'Work'? Or separate)
  // Add if not already there:
  { category: 'Media', items: [{ label: 'Media Folders', icon: <FolderIcon />, path: '/media' }] },
];

// Flatten all items for the sidebar
const allNavItems = navConfig.flatMap(group => group.items);

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const appTheme = useAppTheme();

  const [drawerOpen, setDrawerOpen] = useState(!isMobile);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [user, setUser] = useState<any>(null);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const stored = localStorage.getItem('user');
      if (stored) setUser(JSON.parse(stored));
    } catch {}
  }, []);

  const toggleDrawer = () => setDrawerOpen(!drawerOpen);
  const handleMenuClick = (event: React.MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget);
  const handleCloseMenu = () => setAnchorEl(null);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
    handleCloseMenu();
  };

  const toggleCategory = (category: string) => {
    setOpenCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };

  const initials = user
    ? `${user.firstName?.charAt(0) || ''}${user.lastName?.charAt(0) || ''}`
    : 'U';

  const drawerContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <Toolbar>
        <Typography variant="h6" sx={{ color: '#00D4FF', fontWeight: 'bold' }}>
          Future Jobs Pro AI
        </Typography>
      </Toolbar>
      <Divider sx={{ borderColor: '#333' }} />
      <Box sx={{ flex: 1, overflowY: 'auto', px: 1 }}>
        {navConfig.map((group) => {
          const isOpen = openCategories[group.category] ?? true; // default open
          return (
            <React.Fragment key={group.category}>
              <ListItemButton onClick={() => toggleCategory(group.category)} sx={{ pl: 1 }}>
                <ListItemText primary={group.category} sx={{ color: '#888', fontSize: '0.75rem', fontWeight: 'bold' }} />
                {isOpen ? <ExpandLess sx={{ color: '#888' }} /> : <ExpandMore sx={{ color: '#888' }} />}
              </ListItemButton>
              <Collapse in={isOpen} timeout="auto" unmountOnExit>
                <List component="div" disablePadding>
                  {group.items.map((item) => {
                    const isActive = location.pathname === item.path;
                    return (
                      <ListItemButton
                        key={item.path}
                        onClick={() => navigate(item.path)}
                        sx={{
                          pl: 4,
                          borderRadius: 2,
                          mb: 0.5,
                          color: isActive ? '#00D4FF' : '#AAA',
                          bgcolor: isActive ? 'rgba(0,212,255,0.1)' : 'transparent',
                          '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' },
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 36, color: 'inherit' }}>
                          {item.icon}
                        </ListItemIcon>
                        <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: 14 }} />
                      </ListItemButton>
                    );
                  })}
                </List>
              </Collapse>
              <Divider sx={{ borderColor: '#222', my: 1 }} />
            </React.Fragment>
          );
        })}
      </Box>
      <Divider sx={{ borderColor: '#333' }} />
      <List>
        <ListItemButton onClick={handleLogout} sx={{ pl: 2, color: '#F44336' }}>
          <ListItemIcon sx={{ minWidth: 36, color: '#F44336' }}><LogoutIcon /></ListItemIcon>
          <ListItemText primary="Logout" primaryTypographyProps={{ fontSize: 14 }} />
        </ListItemButton>
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', bgcolor: 'background.default', minHeight: '100vh' }}>
      {/* App Bar */}
      <AppBar
        position="fixed"
        sx={{
          zIndex: theme.zIndex.drawer + 1,
          bgcolor: 'background.paper',
          borderBottom: '1px solid #333',
          boxShadow: 'none',
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={toggleDrawer}
            sx={{ mr: 2, display: { md: 'none' }, color: '#FFF' }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1, color: '#FFF' }}>
            {location.pathname.split('/')[1] || 'Dashboard'}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <NotificationCenter />
            <Tooltip title="Toggle theme">
              <IconButton onClick={appTheme.toggle} sx={{ color: 'text.secondary' }}>
                {appTheme.mode === 'dark' ? <Brightness7 /> : <Brightness4 />}
              </IconButton>
            </Tooltip>
            <IconButton onClick={handleMenuClick} sx={{ p: 0 }}>
              <Avatar sx={{ bgcolor: '#00D4FF', color: '#0A0A0A' }}>
                {initials}
              </Avatar>
            </IconButton>
            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={handleCloseMenu}
              PaperProps={{ sx: { bgcolor: '#1A1A1A', border: '1px solid #333' } }}
            >
              <MenuItem onClick={() => { navigate('/settings'); handleCloseMenu(); }} sx={{ color: '#FFF' }}>
                <ListItemIcon><Person sx={{ color: '#FFF' }} /></ListItemIcon>
                Profile
              </MenuItem>
              <MenuItem onClick={handleLogout} sx={{ color: '#FFF' }}>
                <ListItemIcon><LogoutIcon sx={{ color: '#F44336' }} /></ListItemIcon>
                Logout
              </MenuItem>
            </Menu>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Drawer */}
      <Drawer
        variant={isMobile ? 'temporary' : 'permanent'}
        open={drawerOpen}
        onClose={toggleDrawer}
        sx={{
          width: 280,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: 280,
            bgcolor: 'background.default',
            borderRight: '1px solid #333',
            boxSizing: 'border-box',
            top: 0,
            height: '100vh',
          },
        }}
      >
        {drawerContent}
      </Drawer>

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          mt: 8,
          bgcolor: 'background.default',
          minHeight: '100vh',
          width: { md: `calc(100% - 280px)` },
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}
