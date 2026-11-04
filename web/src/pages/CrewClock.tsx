import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Container, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, Chip, CircularProgress, Alert, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, Checkbox, FormControl,
  InputLabel, Select, MenuItem, ListItemText, Stack,
} from '@mui/material';
import { Refresh, Logout, People, Close } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../services/api';

interface ActiveEmployee {
  userId: string;
  firstName: string;
  lastName: string;
  timeEntryId: string;
  clockIn: string;
  latitude: number | null;
  longitude: number | null;
  lastGpsTime: string | null;
  isMoving: boolean;
  geofenceStatus: string;
  projectName: string;
}

interface AllEmployee {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  is_clocked_in: boolean;
}

interface Project {
  id: string;
  name: string;
}

export default function CrewClock() {
  const navigate = useNavigate();
  const token = localStorage.getItem('token') || '';
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const [activeEmployees, setActiveEmployees] = useState<ActiveEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Bulk modal state
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [allEmployees, setAllEmployees] = useState<AllEmployee[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkDataLoading, setBulkDataLoading] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const mutationLock = useRef(false);
  const canManage = ['boss', 'manager'].includes(String(user?.role).toLowerCase());
  const coordinates = () => new Promise<{latitude:number;longitude:number}>((resolve,reject) => {
    if (!navigator.geolocation) return reject(new Error('Location is unavailable in this browser.'));
    navigator.geolocation.getCurrentPosition(position => resolve({latitude:position.coords.latitude,longitude:position.coords.longitude}),
      () => reject(new Error('Allow location access and try again.')), {enableHighAccuracy:true,timeout:20000,maximumAge:0});
  });

  useEffect(() => {
    fetchActiveEmployees();
  }, []);

  const fetchActiveEmployees = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/gps/active/${user?.companyId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Could not load active employees');
      setActiveEmployees(data.employees || []);
    } catch (e) {
      console.error(e);
      alert('Could not load active employees');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchBulkData = async () => {
    setBulkDataLoading(true); setBulkError(''); setAllEmployees([]); setProjects([]);
    try {
      const [employeesRes, projectsRes] = await Promise.all([
        fetch(`${API_BASE}/api/users/company/${user?.companyId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/api/projects`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const employeesData = await employeesRes.json();
      const projectsData = await projectsRes.json();

      if (!employeesRes.ok || !projectsRes.ok) throw new Error('Could not load employees and projects.');
      const activeRes = await fetch(`${API_BASE}/api/gps/active/${user?.companyId}`, {headers:{Authorization:`Bearer ${token}`}});
      if (!activeRes.ok) throw new Error('Could not refresh crew status.');
      const activeData = await activeRes.json();
      const activeIds = new Set((activeData.employees || []).map((e: ActiveEmployee) => e.userId));
      const users = employeesData.users || [];
      const withStatus = users.map((emp: any) => ({
        ...emp,
        is_clocked_in: activeIds.has(emp.id),
      }));
      setAllEmployees(withStatus);
      setProjects(projectsData.projects || []);
    } catch (e) {
      console.error('Failed to fetch bulk data', e);
      setBulkError('Could not load employees, projects and status. Close and reopen to retry.');
    } finally { setBulkDataLoading(false); }
  };

  const openBulkModal = async () => {
    if (!canManage || mutationLock.current) return;
    setSelectedEmployeeIds([]);
    setSelectedProjectId('');
    setBulkModalOpen(true);
    await fetchBulkData();
  };

  const toggleEmployeeSelection = (id: string) => {
    setSelectedEmployeeIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const runBulk = async (direction: 'in' | 'out') => {
    if (!canManage || mutationLock.current || bulkDataLoading) return;
    if (selectedEmployeeIds.some(id => !allEmployees.some(employee => employee.id === id))) {
      setBulkError('Reopen the employee list to refresh status before retrying.'); return;
    }
    if (!selectedEmployeeIds.length || (direction === 'in' && !selectedProjectId)) {
      setBulkError('Select employees and, for clock-in, a project.'); return;
    }
    mutationLock.current = true; setBulkLoading(true); setBulkError('');
    try {
      const location = await coordinates();
      const res = await fetch(`${API_BASE}/api/time-entries/bulk-clock-${direction}`, {
        method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
        body:JSON.stringify({userIds:selectedEmployeeIds,projectId:selectedProjectId,...location}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Clock action was not confirmed. Refresh status before retrying.');
      const results = data.results || [];
      const successful = new Set(results.filter((r:any)=>r.success === true && selectedEmployeeIds.includes(r.userId)).map((r:any)=>r.userId));
      const remaining = selectedEmployeeIds.filter(id=>!successful.has(id));
      const details = remaining.map(id=>{
        const employee=allEmployees.find(e=>e.id===id);
        return `${employee ? `${employee.first_name} ${employee.last_name}` : id}: ${results.find((r:any)=>r.userId===id)?.message || 'No confirmed result; refresh status before retrying.'}`;
      });
      alert(`${successful.size} of ${selectedEmployeeIds.length} employees clocked ${direction}.` + (details.length ? `\n\n${details.join('\n')}` : ''));
      await Promise.all([fetchActiveEmployees(),fetchBulkData()]);
      setSelectedEmployeeIds(remaining);
      if (!remaining.length) setBulkModalOpen(false);
    } catch (e:any) {
      setBulkError(e.message || 'Action was not confirmed. Refresh status before retrying.');
    } finally { mutationLock.current = false; setBulkLoading(false); }
  };
  const handleBulkClockIn = () => runBulk('in');
  const handleBulkClockOut = () => runBulk('out');

  const handleForceClockOut = async (userId: string, timeEntryId: string) => {
    if (!canManage || mutationLock.current || !window.confirm('Force clock out this employee?')) return;
    mutationLock.current = true; setBulkLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/crew/clock-out`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId, timeEntryId }),
      });
      if (!res.ok) throw new Error((await res.json()).message || 'Clock-out was not confirmed');
      alert('Employee clocked out.');
      fetchActiveEmployees();
    } catch (e: any) {
      alert('Failed: ' + e.message);
    } finally { mutationLock.current = false; setBulkLoading(false); }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh' }}>
        <CircularProgress sx={{ color: '#00D4FF' }} />
      </Box>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold' }}>
          Crew Clock
        </Typography>
        <Stack direction="row" spacing={2}>
          <Button
            variant="outlined"
            startIcon={<Refresh />}
            onClick={fetchActiveEmployees}
            sx={{ color: '#00D4FF', borderColor: '#00D4FF' }}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={<People />}
            disabled={!canManage || bulkLoading} onClick={openBulkModal}
            sx={{ bgcolor: '#00D4FF', color: '#0A0A0A' }}
          >
            Bulk Actions
          </Button>
        </Stack>
      </Box>

      <TableContainer component={Paper} sx={{ bgcolor: '#1A1A1A', border: '1px solid #333' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: '#888' }}>Employee</TableCell>
              <TableCell sx={{ color: '#888' }}>Project</TableCell>
              <TableCell sx={{ color: '#888' }}>Clock In</TableCell>
              <TableCell sx={{ color: '#888' }}>Status</TableCell>
              <TableCell sx={{ color: '#888' }}>Location</TableCell>
              <TableCell sx={{ color: '#888' }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {activeEmployees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} sx={{ color: '#888', textAlign: 'center', py: 4 }}>
                  No active employees
                </TableCell>
              </TableRow>
            ) : (
              activeEmployees.map((emp) => (
                <TableRow key={emp.userId} sx={{ borderBottom: '1px solid #333' }}>
                  <TableCell sx={{ color: '#FFF' }}>{emp.firstName} {emp.lastName}</TableCell>
                  <TableCell sx={{ color: '#00D4FF' }}>{emp.projectName || '—'}</TableCell>
                  <TableCell sx={{ color: '#FFF' }}>
                    {new Date(emp.clockIn).toLocaleTimeString()}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={emp.isMoving ? 'Moving' : 'Stationary'}
                      size="small"
                      sx={{ bgcolor: emp.isMoving ? '#4CAF50' : '#FF9800', color: '#FFF' }}
                    />
                  </TableCell>
                  <TableCell sx={{ color: '#888' }}>
                    {emp.latitude != null && emp.longitude != null
                      ? `${emp.latitude.toFixed(5)}, ${emp.longitude.toFixed(5)}`
                      : 'No GPS'}
                  </TableCell>
                  <TableCell>
                    <IconButton
                      disabled={!canManage || bulkLoading} aria-label="Clock out employee" size="small"
                      onClick={() => handleForceClockOut(emp.userId, emp.timeEntryId)}
                      sx={{ color: '#F44336' }}
                    >
                      <Logout fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Bulk Actions Modal */}
      <Dialog open={bulkModalOpen} onClose={() => !mutationLock.current && setBulkModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: '#1A1A1A', color: '#FFF', display: 'flex', justifyContent: 'space-between' }}>
          Bulk Actions
          <IconButton disabled={bulkLoading || bulkDataLoading} onClick={() => setBulkModalOpen(false)} sx={{ color: '#FFF' }}>
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ bgcolor: '#0A0A0A' }}>
          <Alert severity="info" sx={{my:2}}>Bulk actions use this device’s current location. Confirm selected employees are with you at the work site.</Alert>
          {bulkDataLoading && <CircularProgress size={24}/>}
          {bulkError && <Alert severity="error" onClose={() => setBulkError('')}>{bulkError}</Alert>}
          <FormControl fullWidth sx={{ mb: 2, mt: 1 }}>
            <InputLabel sx={{ color: '#888' }}>Project</InputLabel>
            <Select
              disabled={bulkLoading || bulkDataLoading}
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              sx={{ color: '#FFF', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }}
            >
              {projects.map((p) => (
                <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <Typography variant="subtitle2" sx={{ color: '#888', mb: 1 }}>
            Select Employees
          </Typography>
          <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
            {allEmployees.map((emp) => (
              <Box key={emp.id} sx={{ display: 'flex', alignItems: 'center', py: 1, borderBottom: '1px solid #222' }}>
                <Checkbox disabled={bulkLoading || bulkDataLoading}
                  checked={selectedEmployeeIds.includes(emp.id)}
                  onChange={() => toggleEmployeeSelection(emp.id)}
                  sx={{ color: '#00D4FF' }}
                />
                <Typography sx={{ color: '#FFF' }}>
                  {emp.first_name} {emp.last_name}
                  <Chip
                    size="small"
                    label={emp.is_clocked_in ? 'In' : 'Out'}
                    sx={{ ml: 1, bgcolor: emp.is_clocked_in ? '#4CAF50' : '#888', color: '#FFF' }}
                  />
                </Typography>
              </Box>
            ))}
          </Box>
        </DialogContent>
        <DialogActions sx={{ bgcolor: '#1A1A1A' }}>
          <Button disabled={bulkLoading || bulkDataLoading} onClick={() => setBulkModalOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleBulkClockIn}
            disabled={bulkLoading || bulkDataLoading}
            sx={{ bgcolor: '#4CAF50', color: '#FFF' }}
          >
            Clock In
          </Button>
          <Button
            variant="contained"
            onClick={handleBulkClockOut}
            disabled={bulkLoading || bulkDataLoading}
            sx={{ bgcolor: '#F44336', color: '#FFF' }}
          >
            Clock Out
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
