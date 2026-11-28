import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Container, Typography, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Chip,
  CircularProgress, Alert, IconButton, Dialog, DialogTitle,
  DialogContent, TextField, Button, Stack,
} from '@mui/material';
import { Groups, Edit } from '@mui/icons-material';
import ResourceAttachments from '../components/ResourceAttachments';
import { API_BASE } from '../services/api';
import { captureAuthSession } from '../services/authSession';
import { readChatOwner } from '../services/chatSession';

type JobDetails = {job_title:string|null; department:string|null; job_description:string|null};
const fields = [['job_title','Job title',100],['department','Department',100],['job_description','Job description',500]] as const;
const detailsOf = (member: Partial<JobDetails>): JobDetails => ({
  job_title:member.job_title ?? null, department:member.department ?? null, job_description:member.job_description ?? null,
});
function canEditJob(member: { id:string; role:string }, owner: ReturnType<typeof readChatOwner>) {
  if (!owner) return false;
  if (member.role === 'boss') return owner.role === 'boss' && owner.id === member.id;
  if (['worker','employee'].includes(member.role)) return ['boss','admin','manager'].includes(owner.role);
  return ['manager','admin'].includes(member.role) && ['boss','admin'].includes(owner.role);
}

export default function Team() {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [editForm, setEditForm] = useState({ sin: '', dateOfBirth: '' });

  const [job, setJob] = useState<{ id:string; name:string; previous:JobDetails; draft:JobDetails } | null>(null);
  const [jobError, setJobError] = useState(false);
  const [jobBusy, setJobBusy] = useState(false);
  const jobLock = useRef(false), jobGeneration = useRef(0), readGeneration = useRef(0);
  const closeJob = () => { jobGeneration.current++; setJob(null); setJobError(false); };

  useEffect(() => {
    const reload = () => {
      closeJob(); setJobBusy(false); jobLock.current = false;
      setMembers([]); setSelectedMember(null); setEditDialogOpen(false);
      void fetchTeam();
    };
    void fetchTeam();
    window.addEventListener('auth-session-changed', reload);
    return () => { jobGeneration.current++; readGeneration.current++; window.removeEventListener('auth-session-changed', reload); };
  }, []);

  const fetchTeam = async () => {
    const read = ++readGeneration.current, owner = readChatOwner(), auth = captureAuthSession();
    const current = () => read === readGeneration.current && auth.isCurrent();
    setLoading(true); setError('');
    try {
      if (!owner) throw new Error('Sign in to view the team');
      const res = await fetch(`${API_BASE}/api/team/members/${encodeURIComponent(owner.companyId)}`, {
        headers: { 'Authorization': `Bearer ${owner.token}` }, cache:'no-store',
      });
      if (!res.ok) throw new Error('Failed to load team');
      const data = await res.json();
      if (current()) setMembers((data.members || []).filter((row:any) => row?.is_active !== false));
    } catch (err: any) {
      if (current()) setError(err.message);
    } finally {
      if (current()) setLoading(false);
    }
  };

  const openJob = (member: any) => {
    if (jobLock.current || !canEditJob(member, readChatOwner())) return;
    const previous = detailsOf(member);
    jobGeneration.current++;
    setJobError(false);setJob({id:member.id,name:`${member.first_name || ''} ${member.last_name || ''}`.trim(),previous,draft:{...previous}});
  };
  const saveJob = async () => {
    const owner = readChatOwner(), auth = captureAuthSession(), generation = jobGeneration.current;
    const current = () => generation === jobGeneration.current && auth.isCurrent();
    if (!job || !owner || jobError || jobLock.current) return;
    jobLock.current = true; setJobBusy(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(`${API_BASE}/api/team/${encodeURIComponent(job.id)}/job-details`, {
        method:'PUT', cache:'no-store', signal:controller.signal,
        headers: {'Content-Type':'application/json',Authorization:`Bearer ${owner.token}`},
        body:JSON.stringify({expectedActorId:owner.id,expectedCompanyId:owner.companyId,previous:job.previous,details:job.draft}),
      });
      if (!current()) return;
      const data = await res.json();
      if (!current()) return;
      if (!res.ok || data.success !== true || data.details?.id !== job.id ||
        fields.some(([key]) => data.details[key] !== null && typeof data.details[key] !== 'string')) throw new Error('Unconfirmed save');
      readGeneration.current++; setLoading(false);
      setMembers(rows => rows.map(row => row.id === job.id ? {...row,...detailsOf(data.details)} : row));
      setJobBusy(false); jobLock.current = false; closeJob();
    } catch {
      if (current()) setJobError(true);
    } finally {
      window.clearTimeout(timeout);
      if (current()) { setJobBusy(false); jobLock.current = false; }
    }
  };

  const openEditDialog = (member: any) => {
    setSelectedMember(member);
    setEditForm({
      sin: member.sin || '',
      dateOfBirth: member.date_of_birth || '',
    });
    setEditDialogOpen(true);
  };

  const saveTaxInfo = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/users/${selectedMember.id}/tax-info`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          sin: editForm.sin || null,
          dateOfBirth: editForm.dateOfBirth || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEditDialogOpen(false);
        fetchTeam();
      } else {
        alert(data.message || 'Update failed');
      }
    } catch (e) {
      alert('Error saving tax info');
    }
  };

  return (
    <Box sx={{ bgcolor: '#0A0A0A', minHeight: '100vh', py: 4 }}>
      <Container maxWidth="lg">
        <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold', mb: 1 }}>
          <Groups sx={{ mr: 1, verticalAlign: 'middle' }} />
          Team Management
        </Typography>
        <Typography variant="body1" sx={{ color: '#888', mb: 4 }}>
          View your crew’s job details and account access separately.
        </Typography>

        {loading && <CircularProgress sx={{ color: '#00D4FF' }} />}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {!loading && !error && (
          <Paper sx={{ bgcolor: '#1A1A1A', borderRadius: 3, border: '1px solid #333', overflow: 'hidden' }}>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ color: '#888' }}>Name</TableCell>
                    <TableCell sx={{ color: '#888' }}>Email</TableCell>
                    <TableCell sx={{ color: '#888' }}>Access</TableCell>
                    <TableCell sx={{ color: '#888' }}>SIN</TableCell>
                    <TableCell sx={{ color: '#888' }}>DOB</TableCell>
                    <TableCell sx={{ color: '#888' }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {members.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} sx={{ color: '#888', textAlign: 'center', py: 4 }}>
                        No team members found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    members.map((member: any) => (
                      <TableRow key={member.id} hover>
                        <TableCell sx={{ color: '#FFF' }}>
                          {member.first_name} {member.last_name}
                          {fields.map(([key,label]) => member[key] ? <Typography key={key} variant="body2"
                            sx={{ whiteSpace:'pre-wrap',overflowWrap:'anywhere',color:'#BBB' }}>
                            {label}: {member[key]}
                          </Typography> : null)}
                        </TableCell>
                        <TableCell sx={{ color: '#CCC' }}>{member.email}</TableCell>
                        <TableCell>
                          <Chip
                            label={member.role}
                            size="small"
                            sx={{
                              bgcolor: member.role === 'boss' ? '#00D4FF20' : '#4CAF5020',
                              color: member.role === 'boss' ? '#00D4FF' : '#4CAF50',
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ color: '#FFF' }}>
                          {member.sin ? '****' + member.sin.slice(-4) : '—'}
                        </TableCell>
                        <TableCell sx={{ color: '#FFF' }}>
                          {member.date_of_birth ? new Date(member.date_of_birth).toLocaleDateString() : '—'}
                        </TableCell>
                        <TableCell>
                          {canEditJob(member,readChatOwner()) && <Button size="small" disabled={jobBusy} onClick={() => openJob(member)}>Job details</Button>}
                          <IconButton size="small" aria-label="Edit tax information" onClick={() => openEditDialog(member)}>
                            <Edit sx={{ color: '#00D4FF' }} />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}

        {job && <Dialog open onClose={() => !jobBusy && closeJob()} maxWidth="sm" fullWidth>
          <DialogTitle>Job details for {job.name}</DialogTitle>
          <DialogContent>
            <Typography variant="body2">These details do not change account access.</Typography>
            {fields.map(([key,label,max]) => <TextField key={key} label={label} fullWidth
              multiline={key === 'job_description'} inputProps={{maxLength:max}}
              disabled={jobBusy || jobError} value={job.draft[key] ?? ''}
              onChange={e => {const value=e.target.value;setJob(old => old ? {...old,draft:{...old.draft,[key]:value}} : null);}} sx={{mt:2}} />)}
            {jobError && <Alert severity="error" sx={{mt:2}}>Could not confirm the save. Refresh the team before trying again.</Alert>}
            <Stack direction="row" spacing={2} sx={{mt:3,justifyContent:'flex-end'}}>
              <Button disabled={jobBusy} onClick={() => {closeJob();if (jobError) void fetchTeam();}}>Close</Button>
              <Button disabled={jobBusy || jobError} variant="contained" onClick={() => void saveJob()}>{jobBusy ? 'Saving…' : 'Save job details'}</Button>
            </Stack>
          </DialogContent>
        </Dialog>}
        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ bgcolor: '#1A1A1A', color: '#FFF' }}>
            Tax Information for {selectedMember?.first_name} {selectedMember?.last_name}
          </DialogTitle>
          <DialogContent sx={{ bgcolor: '#0A0A0A' }}>
            <TextField
              label="SIN (9 digits)"
              fullWidth
              value={editForm.sin}
              onChange={(e) => setEditForm({ ...editForm, sin: e.target.value })}
              sx={{ mt: 2, input: { color: '#FFF' }, label: { color: '#888' } }}
            />
            <TextField
              label="Date of Birth"
              type="date"
              fullWidth
              value={editForm.dateOfBirth}
              onChange={(e) => setEditForm({ ...editForm, dateOfBirth: e.target.value })}
              InputLabelProps={{ shrink: true }}
              sx={{ mt: 2, input: { color: '#FFF' }, label: { color: '#888' } }}
            />
            <Stack direction="row" spacing={2} sx={{ mt: 3, justifyContent: 'flex-end' }}>
              <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
              <Button variant="contained" onClick={saveTaxInfo} sx={{ bgcolor: '#00D4FF', color: '#0A0A0A' }}>
                Save
              </Button>
            </Stack>
            {selectedMember && <Box sx={{mt:3}}><ResourceAttachments target="subjectUserId" targetId={selectedMember.id} title="Employee documents" /></Box>}
          </DialogContent>
        </Dialog>
      </Container>
    </Box>
  );
}
