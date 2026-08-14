import React, { useState, useEffect } from 'react';
import {
  Box, Container, Typography, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Chip, Checkbox,
  CircularProgress, Alert, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, IconButton,
} from '@mui/material';
import { Assignment, Add, AttachFile } from '@mui/icons-material';
import ResourceAttachments from '../components/ResourceAttachments';

const API_BASE = 'https://future-jobs-pro-ai-production.up.railway.app';

export default function Tasks() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [members,setMembers]=useState<any[]>([]); const [createOpen,setCreateOpen]=useState(false); const [filesTask,setFilesTask]=useState<any>(null); const [description,setDescription]=useState(''); const [assignedTo,setAssignedTo]=useState('');

  useEffect(() => {
    fetchTasks(); fetch(`${API_BASE}/api/users/company`,{headers:{Authorization:`Bearer ${localStorage.getItem('token')}`}}).then(r=>r.json()).then(d=>setMembers(d.users||[])).catch(()=>undefined);
  }, []);

  const fetchTasks = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/tasks`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 402) { window.location.href = '/payment-required'; return; }
      if (!res.ok) throw new Error('Failed to load tasks');
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  const createTask=async()=>{const r=await fetch(`${API_BASE}/api/tasks`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${localStorage.getItem('token')}`},body:JSON.stringify({description,assigned_to:assignedTo||null})});if(r.ok){setCreateOpen(false);setDescription('');setAssignedTo('');fetchTasks()}};
  const toggleTask=async(task:any)=>{await fetch(`${API_BASE}/api/tasks/${task.id}`,{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${localStorage.getItem('token')}`},body:JSON.stringify({status:task.status==='completed'?'pending':'completed'})});fetchTasks()};

  return (
    <Box sx={{ bgcolor: '#0A0A0A', minHeight: '100vh', py: 4 }}>
      <Container maxWidth="lg">
        <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold', mb: 1 }}>
          <Assignment sx={{ mr: 1, verticalAlign: 'middle' }} />
          Tasks
        </Typography>
        <Typography variant="body1" sx={{ color: '#888', mb: 4 }}>
          Your company tasks and checklists
        </Typography>
        <Button variant="contained" startIcon={<Add/>} onClick={()=>setCreateOpen(true)} sx={{mb:2}}>Create task</Button>

        {loading && <CircularProgress sx={{ color: '#00D4FF' }} />}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {!loading && !error && (
          <Paper sx={{ bgcolor: '#1A1A1A', borderRadius: 3, border: '1px solid #333', overflow: 'hidden' }}>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ color: '#888' }}>Task</TableCell>
                    <TableCell sx={{ color: '#888' }}>Assigned To</TableCell>
                    <TableCell sx={{ color: '#888' }}>Status</TableCell>
                    <TableCell sx={{ color: '#888' }}>Done / Files</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tasks.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} sx={{ color: '#888', textAlign: 'center', py: 4 }}>
                        No tasks found. Create one to get started!
                      </TableCell>
                    </TableRow>
                  ) : (
                    tasks.map((task: any) => (
                      <TableRow key={task.id} hover>
                        <TableCell sx={{ color: '#FFF' }}>{task.description}</TableCell>
                        <TableCell sx={{ color: '#CCC' }}>{task.assigned_name || 'Unassigned'}</TableCell>
                        <TableCell>
                          <Chip
                            label={task.status}
                            size="small"
                            sx={{
                              bgcolor: task.status === 'completed' ? '#4CAF5020' : '#FF980020',
                              color: task.status === 'completed' ? '#4CAF50' : '#FF9800',
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Checkbox checked={task.status === 'completed'} onChange={()=>toggleTask(task)} sx={{ color: '#00D4FF' }} /><IconButton onClick={()=>setFilesTask(task)}><AttachFile/></IconButton>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}
        <Dialog open={createOpen} onClose={()=>setCreateOpen(false)} fullWidth><DialogTitle>Create task</DialogTitle><DialogContent><TextField autoFocus fullWidth multiline minRows={3} label="Task or checklist item" value={description} onChange={e=>setDescription(e.target.value)} sx={{mt:1}}/><TextField select fullWidth label="Assign to" value={assignedTo} onChange={e=>setAssignedTo(e.target.value)} sx={{mt:2}}><MenuItem value="">Unassigned</MenuItem>{members.map(m=><MenuItem key={m.id} value={m.id}>{m.first_name} {m.last_name}</MenuItem>)}</TextField></DialogContent><DialogActions><Button onClick={()=>setCreateOpen(false)}>Cancel</Button><Button variant="contained" disabled={!description.trim()} onClick={createTask}>Create</Button></DialogActions></Dialog>
        <Dialog open={Boolean(filesTask)} onClose={()=>setFilesTask(null)} fullWidth maxWidth="md"><DialogTitle>Task files — {filesTask?.description}</DialogTitle><DialogContent>{filesTask&&<ResourceAttachments target="taskId" targetId={filesTask.id}/>}</DialogContent><DialogActions><Button onClick={()=>setFilesTask(null)}>Close</Button></DialogActions></Dialog>
      </Container>
    </Box>
  );
}
