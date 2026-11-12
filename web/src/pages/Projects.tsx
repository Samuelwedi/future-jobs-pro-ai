import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardActions, CardContent, Chip, CircularProgress,
  Container, Dialog, DialogActions, DialogContent, DialogTitle, FormControl,
  Grid, IconButton, InputAdornment, InputLabel, LinearProgress, MenuItem, Select, Snackbar,
  Stack, TextField, Typography,
} from '@mui/material';
import {
  Add, ArchiveOutlined, BusinessOutlined, EditOutlined, FolderOutlined,
  LocationOnOutlined, Refresh, RestoreOutlined, Search, WorkOutline,
} from '@mui/icons-material';
import { getAuthRevision } from '../services/authSession';
import {
  canManageProjects, confirmedProject, openProjectSession, projectOwnerKey, readProjectOwner,
  type Project, type ProjectOwner, type ProjectStatus,
} from '../services/projectSession';

const uncertainSaveNotice = 'Save not confirmed. Nothing will retry automatically. Your draft is kept on this page. Check the project list, and copy any edits you need before reopening Projects to save again.';

const emptyForm = {
  name: '', client_name: '', address: '', status: 'active' as ProjectStatus,
  latitude: '', longitude: '', geofence_radius: '100',
};

const statusStyle: Record<ProjectStatus, { label: string; color: string; background: string }> = {
  active: { label: 'Active', color: '#58D68D', background: 'rgba(88,214,141,.12)' },
  on_hold: { label: 'On hold', color: '#FFCA5C', background: 'rgba(255,202,92,.12)' },
  completed: { label: 'Completed', color: '#8FA5B8', background: 'rgba(143,165,184,.12)' },
};

function browserRouteKey() {
  return JSON.stringify([window.location.pathname, window.location.search, window.location.hash, window.history.state?.key || 'default']);
}

export default function Projects() {
  const location = useLocation();
  const [owner, setOwner] = useState(readProjectOwner);
  const [authEpoch, setAuthEpoch] = useState(getAuthRevision);
  const route = JSON.stringify([location.pathname, location.search, location.hash, location.key]);
  const scope = JSON.stringify([projectOwnerKey(owner), authEpoch, route]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  useEffect(() => {
    const refresh = () => {
      const next = readProjectOwner(), revision = getAuthRevision();
      if (projectOwnerKey(next) !== projectOwnerKey(owner) || revision !== authEpoch) {
        currentScope.current = '';
        setOwner(next); setAuthEpoch(revision);
      }
    };
    const timer = window.setInterval(refresh, 1000);
    for (const event of ['auth-session-changed', 'auth-user-updated', 'focus', 'pageshow']) window.addEventListener(event, refresh);
    return () => {
      window.clearInterval(timer);
      for (const event of ['auth-session-changed', 'auth-user-updated', 'focus', 'pageshow']) window.removeEventListener(event, refresh);
    };
  }, [owner, authEpoch]);
  if (!owner) return <Alert severity="error">Sign in to view projects.</Alert>;
  return <OwnedProjects key={scope} owner={owner} scopeCurrent={() => currentScope.current === scope
    && browserRouteKey() === route && getAuthRevision() === authEpoch && projectOwnerKey(readProjectOwner()) === projectOwnerKey(owner)} />;
}

type ArchiveAttempt = { id: string; name: string; archived: boolean };
function OwnedProjects({ owner, scopeCurrent }: { owner: ProjectOwner; scopeCurrent: () => boolean }) {
  const navigate = useNavigate();
  const canManage = canManageProjects(owner);
  const mounted = useRef(true), leaving = useRef(false), denied = useRef(false);
  const pageHidden = useRef(false), epoch = useRef(0), sequence = useRef(0);
  const rows = useRef<Project[]>([]), archiveView = useRef(false);
  const mutation = useRef<object | null>(null), pendingArchive = useRef<ArchiveAttempt | null>(null);
  const uncertainSave = useRef(false);
  const draft = useRef({ instance: null as object | null, open: false, editing: null as Project | null, form: { ...emptyForm }, revision: 0 });
  const [projects, setProjects] = useState<Project[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ProjectStatus>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState(emptyForm);
  const dialogInstance = draft.current.instance;
  const isCurrent = () => mounted.current && !leaving.current && !denied.current && scopeCurrent();
  const canAct = () => isCurrent() && !pageHidden.current && document.visibilityState !== 'hidden';
  const accessChanged = () => {
    if (!isCurrent()) return;
    denied.current = true; sequence.current++; rows.current = []; pendingArchive.current = null; uncertainSave.current = false;
    draft.current = { instance: null, open: false, editing: null, form: { ...emptyForm }, revision: draft.current.revision + 1 };
    setProjects([]); setDialogOpen(false); setForm(emptyForm); setEditing(null); setQuery(''); setStatusFilter('all'); setLoading(false); setSaving(false); setUncertain(false); setNotice('');
    setError('Your project access changed. Reopen Projects or sign in again.');
  };
  const session = () => {
    const generation = epoch.current;
    return openProjectSession(owner, () => isCurrent() && epoch.current === generation);
  };
  const loadProjects = async () => {
    if (!canAct() || mutation.current) return;
    const request = ++sequence.current, archived = archiveView.current, transport = session();
    const current = () => transport.isCurrent() && request === sequence.current;
    setLoading(true); setError('');
    try {
      const projects = await transport.list(archived);
      if (!current()) return;
      rows.current = projects; setProjects(projects);
    } catch (caught: any) {
      if (!current()) return;
      rows.current = []; setProjects([]);
      if (caught.code === 'PROJECT_ACCESS_CHANGED') accessChanged();
      else setError(caught.message || 'Projects could not be loaded. Refresh to try again.');
    } finally { if (current()) setLoading(false); }
  };
  const reconcileArchive = async () => {
    const attempt = pendingArchive.current;
    if (!canAct() || !attempt || mutation.current) return;
    const lock = {}; mutation.current = lock; setSaving(true); setError('');
    const transport = session(), request = ++sequence.current;
    const current = () => transport.isCurrent() && request === sequence.current && pendingArchive.current === attempt;
    try {
      // Both lists distinguish a different current state from an unavailable
      // project. Never infer success from an item disappearing from one list.
      const [open, archived] = await Promise.all([transport.list(false), transport.list(true)]);
      if (!current()) return;
      const matches = [...open, ...archived].filter(p => p.id === attempt.id);
      rows.current = archiveView.current ? archived : open; setProjects(rows.current); setLoading(false);
      if (matches.length !== 1) throw new Error('Current project state could not be verified. Check again before making another change.');
      const nowArchived = Boolean(matches[0].archived_at);
      if (nowArchived === attempt.archived) {
        pendingArchive.current = null; setUncertain(false);
        setNotice(`Current state confirmed: “${attempt.name}” is ${nowArchived ? 'archived' : 'not archived'}. Records and completion status are preserved.`);
      } else {
        setError(`“${attempt.name}” is currently ${nowArchived ? 'archived' : 'not archived'}. The earlier request is still unconfirmed. Check again before making another change.`);
      }
    } catch (caught: any) {
      if (!current()) return;
      if (caught.code === 'PROJECT_ACCESS_CHANGED') accessChanged();
      else setError(caught.message || 'Current project state could not be verified. Check again before making another change.');
    } finally {
      if (mutation.current === lock) mutation.current = null;
      if (transport.isCurrent()) { setSaving(false); setLoading(false); }
    }
  };
  useLayoutEffect(() => {
    mounted.current = true; leaving.current = false;
    const leave = () => { leaving.current = true; epoch.current++; sequence.current++; };
    const hide = () => {
      pageHidden.current = true;
      if (isCurrent() && mutation.current) {
        if (pendingArchive.current) setUncertain(true);
        else { uncertainSave.current = true; setError(''); }
        setSaving(false);
      }
      mutation.current = null; leave();
    };
    const restore = (event: PageTransitionEvent) => {
      if (!event.persisted || !pageHidden.current || !mounted.current || !scopeCurrent()) return;
      pageHidden.current = false; leaving.current = false;
      if (pendingArchive.current) void reconcileArchive();
      else void loadProjects();
    };
    const routeChanged = () => { if (!scopeCurrent()) leave(); };
    window.addEventListener('popstate', routeChanged); window.addEventListener('pagehide', hide); window.addEventListener('pageshow', restore);
    void loadProjects();
    return () => {
      mounted.current = false; epoch.current++; sequence.current++;
      window.removeEventListener('popstate', routeChanged); window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', restore);
    };
  }, []);

  const changeArchiveView = (archived: boolean) => {
    if (!canAct() || mutation.current || archiveView.current === archived) return;
    archiveView.current = archived; sequence.current++; rows.current = [];
    setShowArchived(archived); setProjects([]); setNotice(''); void loadProjects();
  };
  const refresh = () => pendingArchive.current ? void reconcileArchive() : void loadProjects();
  const filtered = useMemo(() => projects.filter((project) => {
    const matchesQuery = `${project.name} ${project.client_name || ''} ${project.address || ''}`
      .toLowerCase().includes(query.trim().toLowerCase());
    return matchesQuery && (statusFilter === 'all' || project.status === statusFilter);
  }), [projects, query, statusFilter]);

  const canWrite = () => canAct() && canManage && !mutation.current && !pendingArchive.current && !uncertainSave.current;
  const openCreate = () => {
    if (!canWrite() || draft.current.open) return;
    draft.current = { instance: {}, open: true, editing: null, form: { ...emptyForm }, revision: draft.current.revision + 1 };
    setEditing(null); setForm(emptyForm); setDialogOpen(true);
  };
  const openEdit = (project: Project) => {
    if (!canWrite() || draft.current.open || !rows.current.includes(project)) return;
    const next = {
      name: project.name, client_name: project.client_name || '', address: project.address || '', status: project.status,
      latitude: project.latitude == null ? '' : String(project.latitude), longitude: project.longitude == null ? '' : String(project.longitude),
      geofence_radius: String(project.geofence_radius || 100),
    };
    draft.current = { instance: {}, open: true, editing: project, form: next, revision: draft.current.revision + 1 };
    setEditing(project); setForm(next); setDialogOpen(true);
  };
  const changeForm = (field: keyof typeof emptyForm, value: string) => {
    if (!canAct() || !canManage || !draft.current.open || draft.current.instance !== dialogInstance) return;
    draft.current = { ...draft.current, form: { ...draft.current.form, [field]: value }, revision: draft.current.revision + 1 };
    setForm(draft.current.form);
  };
  const closeDialog = () => {
    if (!canAct() || mutation.current || draft.current.instance !== dialogInstance) return;
    draft.current.instance = null; draft.current.open = false; draft.current.revision++; setDialogOpen(false);
  };
  const reopenDraft = () => {
    if (!canAct() || !canManage || !uncertainSave.current || mutation.current || draft.current.open) return;
    draft.current.instance = {}; draft.current.open = true; setDialogOpen(true);
  };
  const saveProject = async () => {
    if (!canWrite() || !draft.current.open || draft.current.instance !== dialogInstance) return;
    const { editing, form, revision } = draft.current;
    if (!form.name.trim()) { setError('Project name is required'); return; }
    const lock = {}; mutation.current = lock; sequence.current++; setSaving(true); setError('');
    const transport = session();
    const payload = { ...form, name: form.name.trim(), client_name: form.client_name.trim() || null, address: form.address.trim() || null,
      latitude: form.latitude === '' ? null : Number(form.latitude), longitude: form.longitude === '' ? null : Number(form.longitude), geofence_radius: Number(form.geofence_radius) || 100 };
    try {
      const result = await transport.save(editing?.id, payload);
      if (!transport.isCurrent()) return;
      if (!confirmedProject(result, editing?.id)) throw new Error('Save not confirmed');
      if (draft.current.revision === revision) { draft.current.open = false; draft.current.instance = null; setDialogOpen(false); }
      else if (!editing) {
        // Newer field edits now belong to the project just created. A subsequent
        // Save must update that confirmed ID, never create a duplicate.
        draft.current.editing = result.project; setEditing(result.project);
      }
      setNotice(editing ? 'Project updated' : 'Project created');
      mutation.current = null; setSaving(false); void loadProjects();
    } catch (caught: any) {
      if (!transport.isCurrent()) return;
      if (caught.code === 'PROJECT_ACCESS_CHANGED') accessChanged();
      else if (caught.code === 'PROJECT_NOT_SENT') setError(caught.message);
      else {
        uncertainSave.current = true;
        setError('');
      }
    } finally {
      if (mutation.current === lock) {
        mutation.current = null;
        if (transport.isCurrent()) setSaving(false);
      }
    }
  };
  const changeProjectArchive = async (project: Project, archived: boolean) => {
    if (!canWrite() || draft.current.open || !rows.current.includes(project) || Boolean(project.archived_at) === archived) return;
    // Acquire the lock before confirmation as well as dispatch. Retained same-
    // turn handlers cannot open duplicate confirmations or reverse the intent.
    const lock = {}; mutation.current = lock;
    const transport = session();
    const confirmed = window.confirm(archived
      ? `Archive “${project.name}”? You can restore it later. Records and completion status are kept.`
      : `Restore “${project.name}” to the project list? Records and completion status will be kept.`);
    if (!confirmed || !transport.isCurrent() || !canAct()) { if (mutation.current === lock) mutation.current = null; return; }
    const attempt = { id: project.id, name: project.name, archived }; pendingArchive.current = attempt;
    sequence.current++; setSaving(true); setError(''); setNotice('');
    let reconcile = false;
    try {
      const data = await transport.setArchived(project.id, archived);
      if (!transport.isCurrent()) return;
      if (!confirmedProject(data, project.id, archived)) throw new Error('Change not confirmed');
      pendingArchive.current = null;
      setNotice(archived ? 'Project archived. Records and completion status are preserved.' : 'Project restored. Records and completion status are preserved.');
      rows.current = rows.current.filter(row => row.id !== project.id); setProjects(rows.current);
      mutation.current = null; setSaving(false); void loadProjects();
    } catch (caught: any) {
      if (!transport.isCurrent()) return;
      if (caught.code === 'PROJECT_ACCESS_CHANGED') accessChanged();
      else if (caught.code === 'PROJECT_NOT_SENT') { pendingArchive.current = null; setError(caught.message); }
      else {
        setUncertain(true); reconcile = true;
        setError('Project change not confirmed. Checking its current state. Nothing will retry automatically.');
      }
    } finally {
      if (mutation.current === lock) {
        mutation.current = null;
        if (transport.isCurrent()) setSaving(false);
      }
    }
    if (reconcile && transport.isCurrent()) await reconcileArchive();
  };
  const openWorkspace = (project: Project) => {
    if (!canAct() || !rows.current.includes(project)) return;
    leaving.current = true; epoch.current++; sequence.current++;
    navigate(`/media/project/${encodeURIComponent(project.id)}`);
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
            <IconButton aria-label="Refresh projects" onClick={refresh} disabled={saving || denied.current} sx={{ color: '#8FA5B8', border: '1px solid #263241' }}><Refresh /></IconButton>
            {canManage && !denied.current && <Button variant="contained" startIcon={<Add />} onClick={openCreate} disabled={saving || uncertain || uncertainSave.current} sx={{ bgcolor: '#00D4FF', color: '#041016', fontWeight: 800, px: 2.5 }}>New project</Button>}
          </Stack>
        </Stack>

        {!canManage && <Alert severity="info" sx={{ mb: 2 }}>You can view projects and their workspaces. Only bosses, managers and admins can create, edit, archive or restore projects.</Alert>}
        {uncertain && <Alert severity="warning" sx={{ mb: 2 }} action={<Button onClick={() => void reconcileArchive()} disabled={saving}>Check current state</Button>}>An archive or restore request is unconfirmed. Changes are paused until its current state is confirmed.</Alert>}
        {uncertainSave.current && !dialogOpen && <Alert severity="warning" sx={{ mb: 2 }} action={<Button onClick={reopenDraft}>View draft</Button>}>{uncertainSaveNotice}</Alert>}
        {error && <Alert severity="error" onClose={() => { if (isCurrent()) setError(''); }} sx={{ mb: 2 }}>{error}</Alert>}

        <Grid container spacing={2} mb={3}>
          {[
            [showArchived ? 'Archived projects' : 'Unarchived projects', counts.all, <WorkOutline />],
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

        <Stack direction="row" spacing={1} mb={2}>
          <Button variant={!showArchived ? 'contained' : 'outlined'} aria-pressed={!showArchived} onClick={() => changeArchiveView(false)} disabled={saving}>Unarchived projects</Button>
          <Button variant={showArchived ? 'contained' : 'outlined'} aria-pressed={showArchived} onClick={() => changeArchiveView(true)} disabled={saving}>Archived projects</Button>
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mb={3}>
          <TextField
            fullWidth value={query} onChange={(event) => { if (canAct()) setQuery(event.target.value); }} placeholder="Search projects, clients or addresses" inputProps={{ 'aria-label': 'Search projects' }}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search sx={{ color: '#6F8194' }} /></InputAdornment> }}
            sx={{ '& .MuiOutlinedInput-root': { color: '#FFF', bgcolor: '#10161E', '& fieldset': { borderColor: '#263241' } } }}
          />
          <FormControl sx={{ minWidth: 180 }}>
            <InputLabel id="project-status-filter-label" sx={{ color: '#8292A6' }}>Status</InputLabel>
            <Select id="project-status-filter" labelId="project-status-filter-label" value={statusFilter} label="Status" onChange={(event) => { if (canAct()) setStatusFilter(event.target.value as any); }} sx={{ color: '#FFF', bgcolor: '#10161E', '& fieldset': { borderColor: '#263241' } }}>
              <MenuItem value="all">All statuses</MenuItem><MenuItem value="active">Active</MenuItem><MenuItem value="on_hold">On hold</MenuItem><MenuItem value="completed">Completed</MenuItem>
            </Select>
          </FormControl>
        </Stack>

        {loading && projects.length > 0 && <LinearProgress aria-label="Refreshing projects" sx={{ mb: 2 }} />}
        {loading && projects.length === 0 ? (
          <Box display="grid" sx={{ placeItems: 'center', minHeight: 280 }}><CircularProgress sx={{ color: '#00D4FF' }} /></Box>
        ) : error && projects.length === 0 ? (
          <Alert severity="info">{denied.current ? 'Reopen Projects or sign in again to check your access.' : 'The project list is unavailable. Refresh to check again.'}</Alert>
        ) : filtered.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 10, bgcolor: '#10161E', border: '1px dashed #2A3948', borderRadius: 3 }}>
            <FolderOutlined sx={{ color: '#526579', fontSize: 56 }} />
            <Typography variant="h6" sx={{ color: '#FFF', mt: 2 }}>{query.trim() || statusFilter !== 'all' ? 'No matching projects' : showArchived ? 'No archived projects' : 'No projects yet'}</Typography>
            <Typography sx={{ color: '#8292A6', mb: 2 }}>{query.trim() || statusFilter !== 'all' ? 'Try another search or status filter.' : showArchived ? 'Archived projects will appear here. Archiving keeps project records and completion status.' : canManage ? 'Create your first project to get started.' : 'Ask a boss, manager or admin to create a project for your company.'}</Typography>
            {canManage && !denied.current && !showArchived && !query.trim() && statusFilter === 'all' && <Button onClick={openCreate} disabled={saving || uncertain || uncertainSave.current} startIcon={<Add />} sx={{ color: '#00D4FF' }}>Create project</Button>}
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
                        <Stack spacing={1}>{project.archived_at && <Chip size="small" label="Archived" sx={{ color: '#FFCA5C' }} />}<Chip size="small" label={style.label} sx={{ color: style.color, bgcolor: style.background, border: `1px solid ${style.color}44` }} /></Stack>
                      </Stack>
                      <Stack direction="row" spacing={1} mt={3} alignItems="flex-start"><LocationOnOutlined sx={{ color: '#00D4FF', fontSize: 19, mt: .2 }} /><Typography sx={{ color: '#A5B1BF', minHeight: 45 }}>{project.address || 'No job-site address'}</Typography></Stack>
                      <Typography variant="caption" sx={{ color: '#63758A' }}>Geofence: {project.geofence_radius || 100} m</Typography>
                    </CardContent>
                    <CardActions sx={{ px: 2, pb: 2, justifyContent: 'space-between' }}>
                      <Button startIcon={<FolderOutlined />} onClick={() => openWorkspace(project)} sx={{ color: '#00D4FF' }}>Open workspace</Button>
                      {canManage && <Box><IconButton disabled={saving || uncertain || uncertainSave.current} aria-label="Edit project" onClick={() => openEdit(project)} sx={{ color: '#A9B7C6' }}><EditOutlined /></IconButton><IconButton disabled={saving || uncertain || uncertainSave.current} aria-label={project.archived_at ? 'Restore project' : 'Archive project'} onClick={() => void changeProjectArchive(project, !project.archived_at)} sx={{ color: project.archived_at ? '#00D4FF' : '#E37A7A' }}>{project.archived_at ? <RestoreOutlined /> : <ArchiveOutlined />}</IconButton></Box>}
                    </CardActions>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        )}
      </Container>

      <Dialog open={dialogOpen} onClose={closeDialog} fullWidth maxWidth="sm" PaperProps={{ sx: { bgcolor: '#111821', color: '#FFF', border: '1px solid #293746' } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>{editing ? 'Edit project' : 'Create project'}</DialogTitle>
        <DialogContent>
          {uncertainSave.current && <Alert severity="warning" sx={{ mb: 2 }}>{uncertainSaveNotice}</Alert>}
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Stack spacing={2} mt={1}>
            <TextField required label="Project name" value={form.name} onChange={(e) => changeForm('name', e.target.value)} />
            <TextField label="Client name" value={form.client_name} onChange={(e) => changeForm('client_name', e.target.value)} />
            <TextField label="Job-site address" multiline minRows={2} value={form.address} onChange={(e) => changeForm('address', e.target.value)} />
            <FormControl><InputLabel id="project-status-edit-label">Status</InputLabel><Select id="project-status-edit" labelId="project-status-edit-label" value={form.status} label="Status" onChange={(e) => changeForm('status', e.target.value)}><MenuItem value="active">Active</MenuItem><MenuItem value="on_hold">On hold</MenuItem><MenuItem value="completed">Completed</MenuItem></Select></FormControl>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField label="Latitude" type="number" value={form.latitude} onChange={(e) => changeForm('latitude', e.target.value)} /><TextField label="Longitude" type="number" value={form.longitude} onChange={(e) => changeForm('longitude', e.target.value)} /><TextField label="Radius (m)" type="number" value={form.geofence_radius} onChange={(e) => changeForm('geofence_radius', e.target.value)} /></Stack>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}><Button onClick={closeDialog} disabled={saving} sx={{ color: '#AAB6C4' }}>Cancel</Button><Button variant="contained" onClick={() => void saveProject()} disabled={saving || uncertain || uncertainSave.current} sx={{ bgcolor: '#00D4FF', color: '#031016', fontWeight: 800 }}>{saving ? 'Saving…' : 'Save project'}</Button></DialogActions>
      </Dialog>
      <Snackbar open={Boolean(notice)} autoHideDuration={3500} onClose={() => { if (isCurrent()) setNotice(''); }} message={notice} />
    </Box>
  );
}
