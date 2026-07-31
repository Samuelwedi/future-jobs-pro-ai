import React, { useState, useEffect } from 'react';
import {
  Box, Container, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, Chip, CircularProgress, Alert, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, Checkbox, FormControl,
  InputLabel, Select, MenuItem, ListItemText, Stack,
} from '@mui/material';
import { Refresh, Logout, People, Close } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

const API_BASE = 'https://future-jobs-pro-ai-production.up.railway.app';

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

  useEffect(() => {
    fetchActiveEmployees();
  }, []);

  const fetchActiveEmployees = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/gps/active/${user?.companyId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
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

      // Get clock-in status for each employee (simplified – we can just check active list)
      const activeIds = new Set(activeEmployees.map(e => e.userId));
      const users = employeesData.users || [];
      const withStatus = users.map((emp: any) => ({
        ...emp,
        is_clocked_in: activeIds.has(emp.id),
      }));
      setAllEmployees(withStatus);
      setProjects(projectsData.projects || []);
    } catch (e) {
      console.error('Failed to fetch bulk data', e);
    }
  };

  const openBulkModal = async () => {
    await fetchBulkData();
    setSelectedEmployeeIds([]);
    setSelectedProjectId('');
    setBulkModalOpen(true);
  };

  const toggleEmployeeSelection = (id: string) => {
    setSelectedEmployeeIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleBulkClockIn = async () => {
    if (selectedEmployeeIds.length === 0) {
      alert('Select at least one employee');
      return;
    }
    if (!selectedProjectId) {
      alert('Select a project');
      return;
    }
    setBulkLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/time-entries/bulk-clock-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          userIds: selectedEmployeeIds,
          projectId: selectedProjectId,
          latitude: 0,
          longitude: 0,
        }),
      });
      const data = await res.json();
      const results = data.results || [];
      const successCount = results.filter((r: any) => r.success).length;
      alert(`${successCount} of ${selectedEmployeeIds.length} employees clocked in.`);
      setBulkModalOpen(false);
      fetchActiveEmployees();
    } catch (e: any) {
      alert('Bulk clock-in failed: ' + e.message);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkClockOut = async () => {
    if (selectedEmployeeIds.length === 0) {
      alert('Select at least one employee');
      return;
    }
    setBulkLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/time-entries/bulk-clock-out`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          userIds: selectedEmployeeIds,
          latitude: 0,
          longitude: 0,
        }),
      });
      const data = await res.json();
      const results = data.results || [];
      const successCount = results.filter((r: any) => r.success).length;
      alert(`${successCount} of ${selectedEmployeeIds.length} employees clocked out.`);
      setBulkModalOpen(false);
      fetchActiveEmployees();
    } catch (e: any) {
      alert('Bulk clock-out failed: ' + e.message);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleForceClockOut = async (userId: string, timeEntryId: string) => {
    if (!window.confirm('Force clock out this employee?')) return;
    try {
      await fetch(`${API_BASE}/api/crew/clock-out`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId, timeEntryId }),
      });
      alert('Employee clocked out.');
      fetchActiveEmployees();
    } catch (e: any) {
      alert('Failed: ' + e.message);
    }
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
            onClick={openBulkModal}
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
                    {emp.latitude && emp.longitude
                      ? `${emp.latitude.toFixed(5)}, ${emp.longitude.toFixed(5)}`
                      : 'No GPS'}
                  </TableCell>
                  <TableCell>
                    <IconButton
                      size="small"
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
      <Dialog open={bulkModalOpen} onClose={() => setBulkModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: '#1A1A1A', color: '#FFF', display: 'flex', justifyContent: 'space-between' }}>
          Bulk Actions
          <IconButton onClick={() => setBulkModalOpen(false)} sx={{ color: '#FFF' }}>
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ bgcolor: '#0A0A0A' }}>
          <FormControl fullWidth sx={{ mb: 2, mt: 1 }}>
            <InputLabel sx={{ color: '#888' }}>Project</InputLabel>
            <Select
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
                <Checkbox
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
          <Button onClick={() => setBulkModalOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleBulkClockIn}
            disabled={bulkLoading}
            sx={{ bgcolor: '#4CAF50', color: '#FFF' }}
          >
            Clock In
          </Button>
          <Button
            variant="contained"
            onClick={handleBulkClockOut}
            disabled={bulkLoading}
            sx={{ bgcolor: '#F44336', color: '#FFF' }}
          >
            Clock Out
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}