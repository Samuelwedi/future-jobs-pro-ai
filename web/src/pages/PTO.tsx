import React, { useState, useEffect, useMemo } from 'react';
import {
  Box, Container, Typography, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Chip,
  CircularProgress, Alert, Stack, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Divider,
} from '@mui/material';
import { BeachAccess } from '@mui/icons-material';

const API_BASE = 'https://future-jobs-pro-ai-production.up.railway.app';

export default function PTO() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<'all' | 'upcoming' | 'past'>('all');
  const [selected,setSelected]=useState<any|null>(null);
  const [managerNote,setManagerNote]=useState('');
  const [saving,setSaving]=useState(false);
  const user=JSON.parse(localStorage.getItem('user')||'{}');
  const manager=['boss','manager','admin'].includes(String(user.role||'').toLowerCase());

  const visibleRequests = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (view === 'past') return requests.filter(request => new Date(request.end_date) < today);
    if (view === 'upcoming') return requests.filter(request => new Date(request.end_date) >= today);
    return requests;
  }, [requests, view]);

  const pastCount = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return requests.filter(request => new Date(request.end_date) < today).length;
  }, [requests]);

  useEffect(() => {
    fetchPTO();
  }, []);

  const fetchPTO = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/pto-history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 402) { window.location.href = '/payment-required'; return; }
      if (!res.ok) throw new Error('Failed to load PTO requests');
      const data = await res.json();
      setRequests(data.requests || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const decide=async(status:'approved'|'rejected')=>{if(!selected)return;setSaving(true);setError('');try{const token=localStorage.getItem('token');const response=await fetch(`${API_BASE}/api/pto-history/${selected.id}/status`,{method:'PATCH',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({status,managerNote})});const data=await response.json();if(!response.ok)throw new Error(data.message||'PTO decision failed');setSelected(null);setManagerNote('');await fetchPTO();}catch(cause:any){setError(cause.message);}finally{setSaving(false);}};

  return (
    <Box sx={{ bgcolor: '#0A0A0A', minHeight: '100vh', py: 4 }}>
      <Container maxWidth="lg">
        <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold', mb: 1 }}>
          <BeachAccess sx={{ mr: 1, verticalAlign: 'middle' }} />
          Paid Time Off
        </Typography>
        <Typography variant="body1" sx={{ color: '#888', mb: 4 }}>
          PTO requests across your company
        </Typography>

        {loading && <CircularProgress sx={{ color: '#00D4FF' }} />}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {!loading && !error && (
          <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
            <Button variant={view === 'all' ? 'contained' : 'outlined'} onClick={() => setView('all')}>All ({requests.length})</Button>
            <Button variant={view === 'upcoming' ? 'contained' : 'outlined'} onClick={() => setView('upcoming')}>Current & upcoming ({requests.length - pastCount})</Button>
            <Button variant={view === 'past' ? 'contained' : 'outlined'} onClick={() => setView('past')}>Past requests ({pastCount})</Button>
          </Stack>
        )}

        {!loading && !error && (
          <Paper sx={{ bgcolor: '#1A1A1A', borderRadius: 3, border: '1px solid #333', overflow: 'hidden' }}>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ color: '#888' }}>Employee</TableCell>
                    <TableCell sx={{ color: '#888' }}>Type</TableCell>
                    <TableCell sx={{ color: '#888' }}>Dates</TableCell>
                    <TableCell sx={{ color: '#888' }}>Reason & duration</TableCell><TableCell sx={{ color: '#888' }}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visibleRequests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} sx={{ color: '#888', textAlign: 'center', py: 4 }}>
                        No {view === 'all' ? '' : view} PTO requests found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibleRequests.map((req: any) => (
                      <TableRow key={req.id} hover onClick={()=>{setSelected(req);setManagerNote(req.manager_note||'')}}>
                        <TableCell sx={{ color: '#FFF' }}>{req.user_name}</TableCell>
                        <TableCell sx={{ color: '#CCC' }}>{req.type}</TableCell>
                        <TableCell sx={{ color: '#CCC' }}>
                          {new Date(req.start_date).toLocaleDateString()} → {new Date(req.end_date).toLocaleDateString()}
                        </TableCell>
                        <TableCell sx={{color:'#CCC'}}>{req.reason||'No reason supplied'}<Typography variant="caption" display="block" color="text.secondary">{Math.max(1,Math.round((new Date(req.end_date).getTime()-new Date(req.start_date).getTime())/86400000)+1)} calendar day(s)</Typography></TableCell>
                        <TableCell>
                          <Chip
                            label={req.status}
                            size="small"
                            sx={{
                              bgcolor: req.status === 'approved' ? '#4CAF5020' : '#FF980020',
                              color: req.status === 'approved' ? '#4CAF50' : '#FF9800',
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
      <Dialog open={Boolean(selected)} onClose={()=>!saving&&setSelected(null)} fullWidth maxWidth="sm"><DialogTitle>PTO request details</DialogTitle><DialogContent sx={{display:'grid',gap:1.5,pt:'16px!important'}}>{selected&&<><Typography variant="h6">{selected.user_name}</Typography><Typography><b>Type:</b> {selected.type}</Typography><Typography><b>Dates:</b> {new Date(selected.start_date).toLocaleDateString()} → {new Date(selected.end_date).toLocaleDateString()}</Typography><Typography><b>Reason:</b> {selected.reason||'No reason supplied'}</Typography><Typography><b>Submitted:</b> {selected.created_at?new Date(selected.created_at).toLocaleString():'Unknown'}</Typography><Typography><b>Status:</b> {selected.status}</Typography>{selected.manager_note&&<Typography><b>Manager note:</b> {selected.manager_note}</Typography>}<Divider/><TextField multiline minRows={2} label="Manager note / rejection reason" value={managerNote} onChange={e=>setManagerNote(e.target.value)}/></>}</DialogContent><DialogActions><Button onClick={()=>setSelected(null)}>Close</Button>{manager&&selected?.status==='pending'&&<><Button disabled={saving} color="error" onClick={()=>decide('rejected')}>Reject</Button><Button disabled={saving} variant="contained" color="success" onClick={()=>decide('approved')}>Approve</Button></>}</DialogActions></Dialog>
    </Box>
  );
}
