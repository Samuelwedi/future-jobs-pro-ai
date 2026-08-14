import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardActions, CardContent, Chip, CircularProgress,
  Container, Dialog, DialogActions, DialogContent, DialogTitle, FormControl,
  Grid, IconButton, InputAdornment, InputLabel, MenuItem, Select, Snackbar,
  Stack, TextField, Typography,
} from '@mui/material';
import {
  Add, ArchiveOutlined, BusinessOutlined, EditOutlined, FolderOutlined,
  LocationOnOutlined, Refresh, Search, WorkOutline,
} from '@mui/icons-material';
import { api } from '../services/api';

type ProjectStatus = 'active' | 'on_hold' | 'completed';

interface Project {
  id: string;
  name: string;
  client_name?: string | null;
  address?: string | null;
  status: ProjectStatus;
  latitude?: number | null;
  longitude?: number | null;
  geofence_radius?: number | null;
}

const emptyForm = {
  name: '', client_name: '', address: '', status: 'active' as ProjectStatus,
  latitude: '', longitude: '', geofence_radius: '100',
};

const statusStyle: Record<ProjectStatus, { label: string; color: string; background: string }> = {
  active: { label: 'Active', color: '#58D68D', background: 'rgba(88,214,141,.12)' },
  on_hold: { label: 'On hold', color: '#FFCA5C', background: 'rgba(255,202,92,.12)' },
  completed: { label: 'Completed', color: '#8FA5B8', background: 'rgba(143,165,184,.12)' },
};

export default function Projects() {
  const navigate = useNavigate();
  const user = useMemo(() => JSON.parse(localStorage.getItem('user') || '{}'), []);
  const canManage = ['boss', 'manager', 'admin'].includes(String(user.role || ''));
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ProjectStatus>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState(emptyForm);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.get<{ success: boolean; projects: Project[] }>('/api/projects', { cache: 'no-store' });
      setProjects(data.projects || []);
    } catch (requestError: any) {
      setError(requestError.message || 'Projects could not be loaded');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadProjects(); }, [loadProjects]);

  const filtered = useMemo(() => projects.filter((project) => {
    const matchesQuery = `${project.name} ${project.client_name || ''} ${project.address || ''}`
      .toLowerCase().includes(query.trim().toLowerCase());
    return matchesQuery && (statusFilter === 'all' || project.status === statusFilter);
  }), [projects, query, statusFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (project: Project) => {
    setEditing(project);
    setForm({
      name: project.name,
      client_name: project.client_name || '',
      address: project.address || '',
      status: project.status || 'active',
      latitude: project.latitude == null ? '' : String(project.latitude),
      longitude: project.longitude == null ? '' : String(project.longitude),
      geofence_radius: String(project.geofence_radius || 100),
    });
    setDialogOpen(true);
  };

  const saveProject = async () => {
    if (!form.name.trim()) {
      setError('Project name is required');
      return;
    }
    setSaving(true);
    setError('');
    const payload = {
      ...form,
      name: form.name.trim(),
      client_name: form.client_name.trim() || null,
      address: form.address.trim() || null,
      latitude: form.latitude === '' ? null : Number(form.latitude),
      longitude: form.longitude === '' ? null : Number(form.longitude),
      geofence_radius: Number(form.geofence_radius) || 100,
    };
    try {
      if (editing) await api.put(`/api/projects/${encodeURIComponent(editing.id)}`, payload);
      else await api.post('/api/projects', payload);
      setDialogOpen(false);
      setNotice(editing ? 'Project updated' : 'Project created');
      await loadProjects();
    } catch (requestError: any) {
      setError(requestError.message || 'Project could not be saved');
    } finally {
      setSaving(false);
    }
  };

  const archiveProject = async (project: Project) => {
    if (!window.confirm(`Archive “${project.name}”? Its history will be preserved.`)) return;
    try {
      await api.delete(`/api/projects/${encodeURIComponent(project.id)}`);
      setNotice('Project archived');
      await loadProjects();
    } catch (requestError: any) {
      setError(requestError.message || 'Project could not be archived');
    }
  };

  const counts = useMemo(() => ({
    all: projects.length,
    active: projects.filter((p) => p.status === 'active').length,
    onHold: projects.filter((p) => p.status === 'on_hold').length,
    completed: projects.filter((p) => p.status === 'completed').length,
  }), [projects]);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#080B10', py: { xs: 2, md: 4 } }}>
      <Container maxWidth="xl">
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2} mb={3}>
          <Box>
            <Typography variant="overline" sx={{ color: '#00D4FF', letterSpacing: 2 }}>OPERATIONS</Typography>
            <Typography variant="h3" sx={{ color: '#F7FAFC', fontWeight: 800, fontSize: { xs: 32, md: 44 } }}>Projects</Typography>
            <Typography sx={{ color: '#91A0B2', mt: 1 }}>Manage job sites, clients, locations and project media in one workspace.</Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <IconButton onClick={() => void loadProjects()} sx={{ color: '#8FA5B8', border: '1px solid #263241' }}><Refresh /></IconButton>
            {canManage && <Button variant="contained" startIcon={<Add />} onClick={openCreate} sx={{ bgcolor: '#00D4FF', color: '#041016', fontWeight: 800, px: 2.5 }}>New project</Button>}
          </Stack>
        </Stack>

        {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}

        <Grid container spacing={2} mb={3}>
          {[
            ['Total projects', counts.all, <WorkOutline />],
            ['Active', counts.active, <FolderOutlined />],
            ['On hold', counts.onHold, <ArchiveOutlined />],
            ['Completed', counts.completed, <BusinessOutlined />],
          ].map(([label, value, icon]) => (
            <Grid item xs={6} md={3} key={String(label)}>
              <Card sx={{ bgcolor: '#10161E', border: '1px solid #202C39', borderRadius: 3 }}>
                <CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box><Typography sx={{ color: '#8292A6', fontSize: 13 }}>{label}</Typography><Typography variant="h4" sx={{ color: '#FFF', fontWeight: 800 }}>{value}</Typography></Box>
                  <Box sx={{ color: '#00D4FF' }}>{icon}</Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mb={3}>
          <TextField
            fullWidth value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects, clients or addresses"
            InputProps={{ startAdornment: <InputAdornment position="start"><Search sx={{ color: '#6F8194' }} /></InputAdornment> }}
            sx={{ '& .MuiOutlinedInput-root': { color: '#FFF', bgcolor: '#10161E', '& fieldset': { borderColor: '#263241' } } }}
          />
          <FormControl sx={{ minWidth: 180 }}>
            <InputLabel sx={{ color: '#8292A6' }}>Status</InputLabel>
            <Select value={statusFilter} label="Status" onChange={(event) => setStatusFilter(event.target.value as any)} sx={{ color: '#FFF', bgcolor: '#10161E', '& fieldset': { borderColor: '#263241' } }}>
              <MenuItem value="all">All statuses</MenuItem><MenuItem value="active">Active</MenuItem><MenuItem value="on_hold">On hold</MenuItem><MenuItem value="completed">Completed</MenuItem>
            </Select>
          </FormControl>
        </Stack>

        {loading ? (
          <Box display="grid" sx={{ placeItems: 'center', minHeight: 280 }}><CircularProgress sx={{ color: '#00D4FF' }} /></Box>
        ) : filtered.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 10, bgcolor: '#10161E', border: '1px dashed #2A3948', borderRadius: 3 }}>
            <FolderOutlined sx={{ color: '#526579', fontSize: 56 }} />
            <Typography variant="h6" sx={{ color: '#FFF', mt: 2 }}>No matching projects</Typography>
            <Typography sx={{ color: '#8292A6', mb: 2 }}>Adjust the filters or create your first project.</Typography>
            {canManage && <Button onClick={openCreate} startIcon={<Add />} sx={{ color: '#00D4FF' }}>Create project</Button>}
          </Box>
        ) : (
          <Grid container spacing={2.5}>
            {filtered.map((project) => {
              const style = statusStyle[project.status] || statusStyle.active;
              return (
                <Grid item xs={12} sm={6} lg={4} key={project.id}>
                  <Card sx={{ height: '100%', bgcolor: '#10161E', border: '1px solid #202C39', borderRadius: 3, transition: '.2s', '&:hover': { borderColor: '#00D4FF66', transform: 'translateY(-2px)' } }}>
                    <CardContent>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
                        <Box sx={{ minWidth: 0 }}><Typography variant="h6" noWrap sx={{ color: '#FFF', fontWeight: 750 }}>{project.name}</Typography><Typography sx={{ color: '#8FA0B4', mt: .5 }}>{project.client_name || 'No client assigned'}</Typography></Box>
                        <Chip size="small" label={style.label} sx={{ color: style.color, bgcolor: style.background, border: `1px solid ${style.color}44` }} />
                      </Stack>
                      <Stack direction="row" spacing={1} mt={3} alignItems="flex-start"><LocationOnOutlined sx={{ color: '#00D4FF', fontSize: 19, mt: .2 }} /><Typography sx={{ color: '#A5B1BF', minHeight: 45 }}>{project.address || 'No job-site address'}</Typography></Stack>
                      <Typography variant="caption" sx={{ color: '#63758A' }}>Geofence: {project.geofence_radius || 100} m</Typography>
                    </CardContent>
                    <CardActions sx={{ px: 2, pb: 2, justifyContent: 'space-between' }}>
                      <Button startIcon={<FolderOutlined />} onClick={() => navigate(`/media/project/${project.id}`)} sx={{ color: '#00D4FF' }}>Open workspace</Button>
                      {canManage && <Box><IconButton aria-label="Edit project" onClick={() => openEdit(project)} sx={{ color: '#A9B7C6' }}><EditOutlined /></IconButton><IconButton aria-label="Archive project" onClick={() => void archiveProject(project)} sx={{ color: '#E37A7A' }}><ArchiveOutlined /></IconButton></Box>}
                    </CardActions>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        )}
      </Container>

      <Dialog open={dialogOpen} onClose={() => !saving && setDialogOpen(false)} fullWidth maxWidth="sm" PaperProps={{ sx: { bgcolor: '#111821', color: '#FFF', border: '1px solid #293746' } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>{editing ? 'Edit project' : 'Create project'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField required label="Project name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <TextField label="Client name" value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
            <TextField label="Job-site address" multiline minRows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            <FormControl><InputLabel>Status</InputLabel><Select value={form.status} label="Status" onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}><MenuItem value="active">Active</MenuItem><MenuItem value="on_hold">On hold</MenuItem><MenuItem value="completed">Completed</MenuItem></Select></FormControl>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField label="Latitude" type="number" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} /><TextField label="Longitude" type="number" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} /><TextField label="Radius (m)" type="number" value={form.geofence_radius} onChange={(e) => setForm({ ...form, geofence_radius: e.target.value })} /></Stack>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}><Button onClick={() => setDialogOpen(false)} disabled={saving} sx={{ color: '#AAB6C4' }}>Cancel</Button><Button variant="contained" onClick={() => void saveProject()} disabled={saving} sx={{ bgcolor: '#00D4FF', color: '#031016', fontWeight: 800 }}>{saving ? 'Saving…' : 'Save project'}</Button></DialogActions>
      </Dialog>
      <Snackbar open={Boolean(notice)} autoHideDuration={3500} onClose={() => setNotice('')} message={notice} />
    </Box>
  );
}
