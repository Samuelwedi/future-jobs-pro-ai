import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Container, Typography, Grid, Card, CardContent, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Chip, CircularProgress, Alert, Tabs, Tab, FormControl,
  InputLabel, Select, MenuItem, IconButton, Tooltip, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
} from '@mui/material';
import {
  PictureAsPdf, Download, Description, Assessment, Refresh,
  CheckCircle, Warning, Schedule, AttachMoney, FilePresent,
  Clear, FilterList, Print, Share, CalendarMonth,
} from '@mui/icons-material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { format, subDays } from 'date-fns';

const API_BASE = 'https://future-jobs-pro-ai-production.up.railway.app';

interface Photo {
  id: string;
  s3_key: string;
  taken_at: string;
  taken_by?: string;
  compliance_score?: number;
  project_id: string;
  project_name?: string;
  verification_hash?: string;
}

interface Project {
  id: string;
  name: string;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

export default function Reports() {
  const token = localStorage.getItem('token') || '';
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  // ─── State ─────────────────────────────────────────────────────
  const [tabValue, setTabValue] = useState(0);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [reportUrl, setReportUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [reportTitle, setReportTitle] = useState('Job Evidence Report');
  const [showTitleDialog, setShowTitleDialog] = useState(false);

  // ─── Comprehensive Report State ──────────────────────────────
  const [startDate, setStartDate] = useState<Date | null>(subDays(new Date(), 7));
  const [endDate, setEndDate] = useState<Date | null>(new Date());
  const [loadingReport, setLoadingReport] = useState(false);

  // ─── Fetch Projects ────────────────────────────────────────────
  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/projects`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.projects) {
        setProjects(data.projects);
        if (data.projects.length > 0) {
          setSelectedProject(data.projects[0].id);
        }
      }
    } catch (e) {
      console.error('Failed to fetch projects:', e);
      setError('Could not load projects');
    }
  }, [token]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // ─── Fetch Photos ──────────────────────────────────────────────
  const fetchPhotos = useCallback(async () => {
    if (!selectedProject) return;
    setFetching(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/photos/project/${selectedProject}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.photos) {
        setPhotos(data.photos);
        // Auto-select high-quality photos (score >= 70)
        const autoSelected = data.photos
          .filter((p: Photo) => (p.compliance_score || 0) >= 70)
          .map((p: Photo) => p.id);
        setSelectedIds(autoSelected);
      } else {
        setPhotos([]);
        setSelectedIds([]);
      }
    } catch (e) {
      console.error('Failed to fetch photos:', e);
      setError('Could not load photos');
    } finally {
      setFetching(false);
    }
  }, [selectedProject, token]);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  // ─── Handlers ──────────────────────────────────────────────────
  const togglePhoto = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selectedIds.length === photos.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(photos.map(p => p.id));
    }
  };

  const clearSelection = () => setSelectedIds([]);

  const handleGenerateReport = async () => {
    if (selectedIds.length === 0) {
      setError('Please select at least one photo');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${API_BASE}/api/photos/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          photoIds: selectedIds,
          reportTitle: reportTitle,
          projectId: selectedProject,
        }),
      });
      const data = await res.json();
      if (data.reportUrl) {
        setReportUrl(data.reportUrl);
        setSuccess('Report generated successfully!');
        setTimeout(() => {
          window.open(data.reportUrl, '_blank');
        }, 1000);
      } else {
        setError(data.message || 'Failed to generate report');
      }
    } catch (e: any) {
      setError('Error generating report: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateComprehensiveReport = async () => {
    if (!selectedProject || !startDate || !endDate) {
      setError('Please select project and date range');
      return;
    }
    setLoadingReport(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${API_BASE}/api/reports/comprehensive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          projectId: selectedProject,
          startDate: format(startDate, 'yyyy-MM-dd'),
          endDate: format(endDate, 'yyyy-MM-dd'),
        }),
      });
      const data = await res.json();
      if (data.success && data.reportUrl) {
        window.open(data.reportUrl, '_blank');
        setSuccess('Comprehensive report generated!');
      } else {
        setError(data.message || 'Failed to generate comprehensive report');
      }
    } catch (e: any) {
      setError('Error: ' + e.message);
    } finally {
      setLoadingReport(false);
    }
  };

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  // ─── Render Helpers ────────────────────────────────────────────
  const getComplianceColor = (score: number) => {
    if (score >= 80) return '#4CAF50';
    if (score >= 60) return '#FF9800';
    return '#F44336';
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  // ─── Render ────────────────────────────────────────────────────
  if (fetching && photos.length === 0) {
    return (
      <Container maxWidth="xl" sx={{ py: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh' }}>
        <CircularProgress sx={{ color: '#00D4FF' }} />
      </Container>
    );
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Container maxWidth="xl" sx={{ py: 4, bgcolor: '#0A0A0A', minHeight: '100vh' }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Box>
            <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold' }}>
              📄 Reports
            </Typography>
            <Typography variant="body1" sx={{ color: '#888', mt: 0.5 }}>
              Generate evidence reports, timesheets, payroll summaries, and comprehensive project reports.
            </Typography>
          </Box>
          <Tooltip title="Refresh">
            <IconButton onClick={fetchPhotos} sx={{ color: '#00D4FF' }}>
              <Refresh />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Tabs */}
        <Tabs value={tabValue} onChange={handleTabChange} sx={{ mb: 2, borderBottom: '1px solid #333' }}>
          <Tab label="📷 Evidence Report" icon={<PictureAsPdf />} iconPosition="start" />
          <Tab label="📋 Comprehensive Report" icon={<Description />} iconPosition="start" />
          <Tab label="⏱ Timesheet" icon={<Schedule />} iconPosition="start" />
          <Tab label="💰 Payroll" icon={<AttachMoney />} iconPosition="start" />
        </Tabs>

        {/* ─── Tab 0: Evidence Report ────────────────────────────── */}
        <TabPanel value={tabValue} index={0}>
          {/* Project Selector */}
          <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center', flexWrap: 'wrap' }}>
            <FormControl sx={{ minWidth: 200 }}>
              <InputLabel sx={{ color: '#888' }}>Project</InputLabel>
              <Select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                sx={{ color: '#FFF', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }}
              >
                {projects.map((p) => (
                  <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <Button
              variant="outlined"
              startIcon={<Refresh />}
              onClick={fetchPhotos}
              sx={{ color: '#00D4FF', borderColor: '#00D4FF' }}
            >
              Load Photos
            </Button>

            <Box sx={{ flex: 1 }} />

            <Chip
              label={`${photos.length} photos`}
              sx={{ bgcolor: '#1A1A1A', color: '#888' }}
            />
            <Chip
              label={`${selectedIds.length} selected`}
              sx={{ bgcolor: '#00D4FF20', color: '#00D4FF' }}
            />
          </Box>

          {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess(null)}>{success}</Alert>}

          {/* Photo Table */}
          <Paper sx={{ bgcolor: '#1A1A1A', borderRadius: 2, border: '1px solid #333', overflow: 'hidden' }}>
            <Box sx={{ p: 2, borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6" sx={{ color: '#FFF' }}>Select Photos</Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button size="small" onClick={selectAll} sx={{ color: '#00D4FF' }}>
                  {selectedIds.length === photos.length ? 'Deselect All' : 'Select All'}
                </Button>
                <Button size="small" onClick={clearSelection} sx={{ color: '#F44336' }}>
                  Clear
                </Button>
              </Box>
            </Box>

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ color: '#888', width: 50 }}>#</TableCell>
                    <TableCell sx={{ color: '#888' }}>Photo</TableCell>
                    <TableCell sx={{ color: '#888' }}>Date</TableCell>
                    <TableCell sx={{ color: '#888' }}>Taken By</TableCell>
                    <TableCell sx={{ color: '#888' }}>Compliance</TableCell>
                    <TableCell sx={{ color: '#888' }}>Verified</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {photos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} sx={{ color: '#888', textAlign: 'center', py: 4 }}>
                        No photos found. Take some photos first!
                      </TableCell>
                    </TableRow>
                  ) : (
                    photos.map((photo, index) => {
                      const score = photo.compliance_score || 0;
                      const isSelected = selectedIds.includes(photo.id);
                      return (
                        <TableRow
                          key={photo.id}
                          hover
                          selected={isSelected}
                          sx={{
                            cursor: 'pointer',
                            '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' },
                            '&.Mui-selected': { bgcolor: 'rgba(0,212,255,0.1)' },
                          }}
                          onClick={() => togglePhoto(photo.id)}
                        >
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => togglePhoto(photo.id)}
                              onClick={(e) => e.stopPropagation()}
                              style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#00D4FF' }}
                            />
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                              <Box
                                component="img"
                                src={photo.s3_key}
                                alt="Job photo"
                                sx={{
                                  width: 50,
                                  height: 50,
                                  borderRadius: 1,
                                  objectFit: 'cover',
                                  bgcolor: '#0A0A0A',
                                  border: '1px solid #333',
                                }}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="%23888" stroke-width="2"%3E%3Crect x="3" y="3" width="18" height="18" rx="2"/%3E%3Ccircle cx="9" cy="9" r="2"/%3E%3Cpath d="M21 15l-5-5-5 5-3-3-5 5"/%3E%3C/svg%3E';
                                }}
                              />
                              <Typography variant="body2" sx={{ color: '#FFF' }}>
                                {photo.taken_by || 'Unknown'}
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell sx={{ color: '#CCC' }}>{formatDate(photo.taken_at)}</TableCell>
                          <TableCell sx={{ color: '#CCC' }}>{photo.taken_by || '—'}</TableCell>
                          <TableCell>
                            <Chip
                              label={`${score}%`}
                              size="small"
                              sx={{
                                bgcolor: `${getComplianceColor(score)}20`,
                                color: getComplianceColor(score),
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            {photo.verification_hash ? (
                              <Tooltip title="Blockchain verified">
                                <CheckCircle sx={{ color: '#4CAF50', fontSize: 20 }} />
                              </Tooltip>
                            ) : (
                              <Warning sx={{ color: '#888', fontSize: 20 }} />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            <Box sx={{ p: 2, borderTop: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
              <Typography variant="body2" sx={{ color: '#888' }}>
                {selectedIds.length} of {photos.length} photos selected
              </Typography>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Button
                  variant="contained"
                  onClick={() => setShowTitleDialog(true)}
                  disabled={selectedIds.length === 0}
                  sx={{ bgcolor: '#00D4FF', color: '#0A0A0A' }}
                >
                  Generate Evidence Report
                </Button>
              </Box>
            </Box>
          </Paper>

          {reportUrl && (
            <Alert severity="success" sx={{ mt: 3 }} onClose={() => setReportUrl('')}>
              Report ready!{' '}
              <a href={reportUrl} target="_blank" rel="noreferrer" style={{ color: '#00D4FF' }}>
                Open PDF
              </a>
            </Alert>
          )}
        </TabPanel>

        {/* ─── Tab 1: Comprehensive Report ─────────────────────────── */}
        <TabPanel value={tabValue} index={1}>
          <Paper sx={{ p: 3, bgcolor: '#1A1A1A', border: '1px solid #333' }}>
            <Typography variant="h6" sx={{ color: '#FFF', mb: 2 }}>
              📋 Comprehensive Project Report
            </Typography>
            <Typography variant="body2" sx={{ color: '#888', mb: 3 }}>
              Generate a complete report for a project and date range, including photos, videos, voice notes, GPS trails, timesheet, and notes.
            </Typography>

            <Grid container spacing={3}>
              <Grid item xs={12} md={4}>
                <FormControl fullWidth>
                  <InputLabel sx={{ color: '#888' }}>Project</InputLabel>
                  <Select
                    value={selectedProject}
                    onChange={(e) => setSelectedProject(e.target.value)}
                    sx={{ color: '#FFF', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }}
                  >
                    {projects.map((p) => (
                      <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={3}>
                <DatePicker
                  label="Start Date"
                  value={startDate}
                  onChange={(newValue) => setStartDate(newValue)}
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      sx: { input: { color: '#FFF' }, label: { color: '#888' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } } }
                    }
                  }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <DatePicker
                  label="End Date"
                  value={endDate}
                  onChange={(newValue) => setEndDate(newValue)}
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      sx: { input: { color: '#FFF' }, label: { color: '#888' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } } }
                    }
                  }}
                />
              </Grid>
              <Grid item xs={12} md={2}>
                <Button
                  fullWidth
                  variant="contained"
                  onClick={handleGenerateComprehensiveReport}
                  disabled={loadingReport || !selectedProject || !startDate || !endDate}
                  sx={{ bgcolor: '#00D4FF', color: '#0A0A0A', height: '56px' }}
                >
                  {loadingReport ? <CircularProgress size={24} sx={{ color: '#0A0A0A' }} /> : 'Generate Report'}
                </Button>
              </Grid>
            </Grid>

            {error && <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>{error}</Alert>}
            {success && <Alert severity="success" sx={{ mt: 2 }} onClose={() => setSuccess(null)}>{success}</Alert>}
          </Paper>
        </TabPanel>

        {/* ─── Tab 2: Timesheet ────────────────────────────────────── */}
        <TabPanel value={tabValue} index={2}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, bgcolor: '#1A1A1A', border: '1px solid #333' }}>
                <Typography variant="h6" sx={{ color: '#FFF', mb: 2 }}>Export Timesheet</Typography>
                <Typography variant="body2" sx={{ color: '#888', mb: 3 }}>
                  Export timesheets as PDF or CSV for payroll processing.
                </Typography>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Button variant="outlined" startIcon={<PictureAsPdf />} sx={{ color: '#00D4FF', borderColor: '#00D4FF' }}>
                    PDF
                  </Button>
                  <Button variant="outlined" startIcon={<Description />} sx={{ color: '#00D4FF', borderColor: '#00D4FF' }}>
                    CSV
                  </Button>
                </Box>
              </Paper>
            </Grid>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, bgcolor: '#1A1A1A', border: '1px solid #333' }}>
                <Typography variant="h6" sx={{ color: '#FFF', mb: 2 }}>Quick Actions</Typography>
                <Typography variant="body2" sx={{ color: '#888', mb: 3 }}>
                  Generate a dispute evidence package with all supporting documentation.
                </Typography>
                <Button variant="contained" startIcon={<FilePresent />} sx={{ bgcolor: '#00D4FF', color: '#0A0A0A' }}>
                  Generate Dispute Package
                </Button>
              </Paper>
            </Grid>
          </Grid>
        </TabPanel>

        {/* ─── Tab 3: Payroll ──────────────────────────────────────── */}
        <TabPanel value={tabValue} index={3}>
          <Paper sx={{ p: 3, bgcolor: '#1A1A1A', border: '1px solid #333' }}>
            <Typography variant="h6" sx={{ color: '#FFF', mb: 2 }}>Payroll Summary</Typography>
            <Typography variant="body2" sx={{ color: '#888', mb: 3 }}>
              Export payroll summaries for selected periods.
            </Typography>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button variant="contained" startIcon={<AttachMoney />} sx={{ bgcolor: '#00D4FF', color: '#0A0A0A' }}>
                Generate Payroll Report
              </Button>
            </Box>
          </Paper>
        </TabPanel>

        {/* ─── Report Title Dialog ────────────────────────────────── */}
        <Dialog open={showTitleDialog} onClose={() => setShowTitleDialog(false)}>
          <DialogTitle sx={{ bgcolor: '#1A1A1A', color: '#FFF' }}>Report Title</DialogTitle>
          <DialogContent sx={{ bgcolor: '#0A0A0A' }}>
            <TextField
              fullWidth
              label="Report Title"
              value={reportTitle}
              onChange={(e) => setReportTitle(e.target.value)}
              sx={{ mt: 1, input: { color: '#FFF' }, label: { color: '#888' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } } }}
            />
          </DialogContent>
          <DialogActions sx={{ bgcolor: '#1A1A1A' }}>
            <Button onClick={() => setShowTitleDialog(false)} sx={{ color: '#888' }}>Cancel</Button>
            <Button
              onClick={() => {
                setShowTitleDialog(false);
                handleGenerateReport();
              }}
              disabled={loading}
              sx={{ bgcolor: '#00D4FF', color: '#0A0A0A' }}
            >
              {loading ? <CircularProgress size={24} /> : 'Generate'}
            </Button>
          </DialogActions>
        </Dialog>
      </Container>
    </LocalizationProvider>
  );
}