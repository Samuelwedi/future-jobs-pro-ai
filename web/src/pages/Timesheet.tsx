import React, { useState, useEffect } from 'react';
import {
  Box, Container, Typography, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Chip,
  CircularProgress, Alert, IconButton, MenuItem, Select,
  FormControl, InputLabel, Button,
} from '@mui/material';
import { Timer, ChevronLeft, ChevronRight, Download } from '@mui/icons-material';

const API_BASE = 'https://future-jobs-pro-ai-production.up.railway.app';

interface TimeEntry {
  id: string;
  project_name: string;
  project_address: string;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  hours: string;
  regularHours: string;
  overtimeHours: string;
  alerts: string[];
  is_manual: boolean;
}

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

export default function Timesheet() {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isBossOrManager, setIsBossOrManager] = useState(false);

  // Get current user from localStorage
  useEffect(() => {
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        setCurrentUser(user);
        setSelectedUserId(user.id || '');
        const role = user.role || user.role?.toLowerCase?.() || '';
        setIsBossOrManager(role === 'boss' || role === 'manager');
      }
    } catch (e) {
      console.error('Failed to parse user:', e);
    }
  }, []);

  // Calculate week range
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + weekOffset * 7);
  const weekStart = formatDate(startOfWeek(baseDate));
  const weekEnd = formatDate(endOfWeek(baseDate));

  // Fetch employees (for managers/bosses)
  useEffect(() => {
    if (isBossOrManager && currentUser?.companyId) {
      fetch(`${API_BASE}/api/users/company/${currentUser.companyId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) setEmployees(data.users || []);
        })
        .catch(console.error);
    }
  }, [isBossOrManager, currentUser]);

  // Fetch entries when week or selected user changes
  useEffect(() => {
    if (selectedUserId) {
      fetchEntries();
    }
  }, [weekOffset, selectedUserId]);

  const fetchEntries = async () => {
    if (!selectedUserId) return;
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const url = `${API_BASE}/api/time-entries?userId=${selectedUserId}&start=${weekStart}&end=${weekEnd}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to load timesheet (${res.status})`);
      }

      const data = await res.json();
      setEntries(data.entries || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (start: string, end: string | null) => {
    if (!end) return 'In progress';
    const diff = new Date(end).getTime() - new Date(start).getTime();
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  };

  const handleExport = async () => {
    try {
      const token = localStorage.getItem('token');
      const url = `${API_BASE}/api/time-entries/export?userId=${selectedUserId}&start=${weekStart}&end=${weekEnd}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `timesheet_${weekStart}_${weekEnd}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Calculate weekly totals
  const weeklyTotal = entries.reduce((sum, e) => sum + parseFloat(e.hours || '0'), 0);
  const weeklyOT = entries.reduce((sum, e) => sum + parseFloat(e.overtimeHours || '0'), 0);

  // ─── Helpers ───
  function startOfWeek(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function endOfWeek(date: Date): Date {
    const d = startOfWeek(date);
    d.setDate(d.getDate() + 6);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  function formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  return (
    <Box sx={{ bgcolor: '#0A0A0A', minHeight: '100vh', py: 4 }}>
      <Container maxWidth="lg">
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold' }}>
            <Timer sx={{ mr: 1, verticalAlign: 'middle' }} />
            Timesheet
          </Typography>
          <Button
            startIcon={<Download />}
            onClick={handleExport}
            sx={{ color: '#00D4FF', borderColor: '#00D4FF' }}
            variant="outlined"
          >
            Export CSV
          </Button>
        </Box>
        <Typography variant="body1" sx={{ color: '#888', mb: 3 }}>
          Your time entries across all projects
        </Typography>

        {/* Week Navigation */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <IconButton onClick={() => setWeekOffset(prev => prev - 1)} sx={{ color: '#00D4FF' }}>
              <ChevronLeft />
            </IconButton>
            <Typography sx={{ color: '#00D4FF', fontWeight: '600' }}>
              {weekStart} – {weekEnd}
            </Typography>
            <IconButton onClick={() => setWeekOffset(prev => prev + 1)} sx={{ color: '#00D4FF' }}>
              <ChevronRight />
            </IconButton>
          </Box>

          {/* Employee Selector (Managers/Bosses) */}
          {isBossOrManager && employees.length > 0 && (
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel sx={{ color: '#888' }}>Employee</InputLabel>
              <Select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                sx={{ color: '#FFF', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }}
              >
                {employees.map((emp) => (
                  <MenuItem key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Box>

        {/* Weekly Summary */}
        <Box sx={{ display: 'flex', gap: 4, mb: 3, flexWrap: 'wrap' }}>
          <Box>
            <Typography sx={{ color: '#888', fontSize: 14 }}>Total Hours</Typography>
            <Typography sx={{ color: '#FFF', fontSize: 24, fontWeight: 'bold' }}>
              {weeklyTotal.toFixed(1)}h
            </Typography>
          </Box>
          <Box>
            <Typography sx={{ color: '#888', fontSize: 14 }}>Overtime</Typography>
            <Typography sx={{ color: '#FF9800', fontSize: 24, fontWeight: 'bold' }}>
              {weeklyOT.toFixed(1)}h
            </Typography>
          </Box>
          <Box>
            <Typography sx={{ color: '#888', fontSize: 14 }}>Shifts</Typography>
            <Typography sx={{ color: '#FFF', fontSize: 24, fontWeight: 'bold' }}>
              {entries.length}
            </Typography>
          </Box>
        </Box>

        {loading && <CircularProgress sx={{ color: '#00D4FF' }} />}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {!loading && !error && (
          <Paper sx={{ bgcolor: '#1A1A1A', borderRadius: 3, border: '1px solid #333', overflow: 'hidden' }}>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ color: '#888' }}>Date</TableCell>
                    <TableCell sx={{ color: '#888' }}>Project</TableCell>
                    <TableCell sx={{ color: '#888' }}>Clock In</TableCell>
                    <TableCell sx={{ color: '#888' }}>Clock Out</TableCell>
                    <TableCell sx={{ color: '#888' }}>Duration</TableCell>
                    <TableCell sx={{ color: '#888' }}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {entries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} sx={{ color: '#888', textAlign: 'center', py: 4 }}>
                        No time entries this week. Start a shift from the mobile app!
                      </TableCell>
                    </TableRow>
                  ) : (
                    entries.map((entry: TimeEntry, i: number) => (
                      <TableRow key={entry.id || i} hover>
                        <TableCell sx={{ color: '#FFF' }}>
                          {new Date(entry.clock_in).toLocaleDateString()}
                        </TableCell>
                        <TableCell sx={{ color: '#CCC' }}>
                          {entry.project_name || '—'}
                        </TableCell>
                        <TableCell sx={{ color: '#CCC' }}>
                          {new Date(entry.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </TableCell>
                        <TableCell sx={{ color: '#CCC' }}>
                          {entry.clock_out
                            ? new Date(entry.clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : '—'}
                        </TableCell>
                        <TableCell sx={{ color: '#FFF', fontWeight: 'bold' }}>
                          {formatDuration(entry.clock_in, entry.clock_out)}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={entry.clock_out ? 'Completed' : 'Active'}
                            size="small"
                            sx={{
                              bgcolor: entry.clock_out ? '#4CAF5020' : '#FF980020',
                              color: entry.clock_out ? '#4CAF50' : '#FF9800',
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}
      </Container>
    </Box>
  );
}