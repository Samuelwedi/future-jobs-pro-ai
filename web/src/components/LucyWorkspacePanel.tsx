import React, { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { api } from '../services/api';

type Job = {id:string;prompt:string;status:string;result?:{text?:string};error?:string;createdAt:string};
type Preference = {key:string;value:string;expiresAt:string};
type Preferences = {preferences:Preference[];options:Record<string,string[]>;limit:number};
const label = (value:string) => value.replace(/_/g,' ');
const activeJob = (job:Job) => ['queued','running'].includes(job.status);

export default function LucyWorkspacePanel({open,onClose}:{open:boolean;onClose:()=>void}) {
  const [jobs,setJobs]=useState<Job[]>([]),[enabled,setEnabled]=useState<boolean|null>(null);
  const [preferences,setPreferences]=useState<Preferences>({preferences:[],options:{},limit:6});
  const [prompt,setPrompt]=useState(''),[key,setKey]=useState('response_style'),[value,setValue]=useState('concise');
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const epoch=useRef(0),reads=useRef(0),lock=useRef(false),session=useRef('');
  const refreshing=useRef<object|null>(null);
  const pending=useRef<{prompt:string;requestKey:string}|null>(null);
  const current=(generation:number)=>epoch.current===generation && session.current===localStorage.getItem('token');

  const refresh=async(generation:number,initial=false)=>{
    if(lock.current||refreshing.current||!current(generation))return;
    const request={};refreshing.current=request;
    const sequence=++reads.current;
    if(initial)setLoading(true);
    try {
      const results=await Promise.allSettled([api.get<{enabled:boolean;jobs:Job[]}>('/api/lucy-v2/work'),api.get<Preferences>('/api/lucy-v2/preferences')]);
      if(!current(generation)||sequence!==reads.current)return;
      if(results[0].status==='fulfilled'){setJobs(results[0].value.jobs);setEnabled(results[0].value.enabled);}
      if(results[1].status==='fulfilled')setPreferences(results[1].value);
      const failed=results.find(result=>result.status==='rejected');
      if(failed?.status==='rejected')setError(failed.reason?.message||'Lucy workspace could not be loaded.');
    } finally {
      if(refreshing.current===request)refreshing.current=null;
      if(current(generation))setLoading(false);
    }
  };
  useEffect(()=>{
    const generation=++epoch.current;
    const token=localStorage.getItem('token')||'';
    const changedSession=session.current!==token;
    session.current=token;lock.current=false;refreshing.current=null;setBusy(false);
    setJobs([]);setPreferences({preferences:[],options:{},limit:6});setEnabled(null);setError('');setNotice('');setLoading(false);
    // Request keys and drafts never carry across account sessions.
    if(changedSession){setPrompt('');pending.current=null;}
    if(!open)return;
    void refresh(generation,true);
    const timer=setInterval(()=>{
      if(!current(generation)){setJobs([]);setPreferences({preferences:[],options:{},limit:6});onClose();return;}
      if(document.visibilityState==='visible')void refresh(generation);
    },5000);
    return()=>{clearInterval(timer);epoch.current++;};
  },[open]);

  const changePrompt=(next:string)=>{
    if(lock.current)return;
    if(pending.current?.prompt!==next.trim())pending.current=null;
    setPrompt(next);
  };
  const mutate=async(work:()=>Promise<void>)=>{
    if(lock.current)return;
    const generation=epoch.current;if(!current(generation))return;
    lock.current=true;reads.current++;setLoading(false);setBusy(true);setError('');setNotice('');
    try {await work();}
    catch(cause:any){if(current(generation))setError(cause.message||'Request was not confirmed. Refresh before retrying.');}
    finally {if(epoch.current===generation){lock.current=false;if(current(generation))setBusy(false);}}
  };
  const start=()=>mutate(async()=>{
    const text=prompt.trim();if(!text||!enabled)return;
    const generation=epoch.current;
    pending.current ||= {prompt:text,requestKey:crypto.randomUUID()};
    const result=await api.post<{job:Job}>('/api/lucy-v2/work',pending.current);
    if(!current(generation))return;
    setJobs(previous=>[result.job,...previous.filter(job=>job.id!==result.job.id)]);setPrompt('');pending.current=null;
    setNotice('Read-only task saved. You can close this page and return for its result.');
  });
  const cancel=(job:Job)=>mutate(async()=>{
    const generation=epoch.current;
    const result=await api.post<{job:Job}>(`/api/lucy-v2/work/${encodeURIComponent(job.id)}/cancel`);
    if(current(generation))setJobs(previous=>previous.map(item=>item.id===job.id?result.job:item));
  });
  const savePreference=()=>mutate(async()=>{
    const generation=epoch.current;
    const result=await api.put<{preference:Preference}>(`/api/lucy-v2/preferences/${encodeURIComponent(key)}`,{value,expiresAt:new Date(Date.now()+90*86400000).toISOString()});
    if(current(generation)){setPreferences(previous=>({...previous,preferences:[...previous.preferences.filter(item=>item.key!==key),result.preference]}));setNotice('Preference saved for 90 days. You can change or forget it at any time.');}
  });
  const forget=(item:Preference)=>mutate(async()=>{
    const generation=epoch.current;await api.delete(`/api/lucy-v2/preferences/${encodeURIComponent(item.key)}`);
    if(current(generation))setPreferences(previous=>({...previous,preferences:previous.preferences.filter(saved=>saved.key!==item.key)}));
  });
  return <Dialog open={open} onClose={()=>{if(!lock.current)onClose();}} fullWidth maxWidth="md" aria-labelledby="lucy-workspace-title">
    <DialogTitle id="lucy-workspace-title">Lucy tasks and preferences</DialogTitle>
    <DialogContent dividers><Stack spacing={2}>
      {error&&<Alert severity="error">{error}</Alert>}{notice&&<Alert severity="success">{notice}</Alert>}
      <Typography variant="h6">Background research</Typography>
      <Typography variant="body2">Lucy can investigate your accessible work records in the background. These tasks cannot change records, send messages, browse external sites, or make payments.</Typography>
      {enabled===false&&!loading&&<Alert severity="info">Background research is not enabled for this deployment.</Alert>}
      <TextField label="Research task" multiline minRows={2} value={prompt} onChange={event=>changePrompt(event.target.value)} inputProps={{maxLength:4000}} disabled={busy||loading||!enabled}/>
      <Box><Button variant="contained" disabled={busy||loading||!enabled||!prompt.trim()} onClick={()=>void start()}>Start read-only task</Button></Box>
      {jobs.map(job=><Paper key={job.id} variant="outlined" sx={{p:2}}><Stack spacing={1}>
        <Stack direction="row" justifyContent="space-between" spacing={1}><Typography sx={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{job.prompt}</Typography><Chip size="small" label={job.status}/></Stack>
        <Typography variant="caption">Created {new Date(job.createdAt).toLocaleString()}</Typography>
        {job.result?.text&&<Typography sx={{whiteSpace:'pre-wrap'}}>{job.result.text}</Typography>}
        {job.error&&<Alert severity="warning">{job.error}</Alert>}
        {activeJob(job)&&<Box><Button color="warning" disabled={busy} onClick={()=>void cancel(job)}>Cancel task</Button></Box>}
      </Stack></Paper>)}
      <Divider/><Typography variant="h6">Saved preferences</Typography>
      <Typography variant="body2">Only choices you save are remembered. They apply to your account in this company, expire after 90 days, and never grant Lucy permission to act.</Typography>
      <Stack direction={{xs:'column',sm:'row'}} spacing={1}>
        <TextField select fullWidth label="Preference" value={preferences.options[key]?key:''} onChange={event=>{setKey(event.target.value);setValue(preferences.options[event.target.value]?.[0]||'');}} disabled={busy||!Object.keys(preferences.options).length}>{Object.keys(preferences.options).map(option=><MenuItem key={option} value={option}>{label(option)}</MenuItem>)}</TextField>
        <TextField select fullWidth label="Value" value={preferences.options[key]?.includes(value)?value:''} onChange={event=>setValue(event.target.value)} disabled={busy||!preferences.options[key]?.length}>{(preferences.options[key]||[]).map(option=><MenuItem key={option} value={option}>{label(option)}</MenuItem>)}</TextField>
        <Button onClick={()=>void savePreference()} disabled={busy||!preferences.options[key]?.includes(value)}>Save preference</Button>
      </Stack>
      {preferences.preferences.map(item=><Stack key={item.key} direction="row" justifyContent="space-between" spacing={1}><Box><Typography>{label(item.key)}: {label(item.value)}</Typography><Typography variant="caption">Expires {new Date(item.expiresAt).toLocaleDateString()}</Typography></Box><Button disabled={busy} onClick={()=>void forget(item)}>Forget</Button></Stack>)}
      <Box><Button disabled={busy||loading} onClick={()=>void refresh(epoch.current,true)}>{loading?'Loading…':'Refresh'}</Button></Box>
    </Stack></DialogContent>
    <DialogActions><Button disabled={busy} onClick={onClose}>Close</Button></DialogActions>
  </Dialog>;
}
