import React, {useEffect,useRef,useState} from 'react';
import {Alert,Box,Button,Chip,Dialog,DialogActions,DialogContent,DialogTitle,Stack,Typography} from '@mui/material';
import {API_BASE} from '../services/api';

type Entry={id:string;source:'action'|'work'|'request';title:string;outcome:string;createdAt:string;updatedAt:string;completedAt:string|null;receiptId:string};
type Snapshot={entries:Entry[];notice:string;checkedAt:string};
const readScope=()=>{try{const token=localStorage.getItem('token');const user=JSON.parse(localStorage.getItem('user')||'{}');return token?JSON.stringify([token,user.id,user.companyId??user.company_id,user.role]):'';}catch{return '';}};
const time=(value:string)=>new Date(value).toLocaleString();
export default function LucyActivityPanel({open,onClose,onOpenWork}:{open:boolean;onClose:()=>void;onOpenWork:()=>void}) {
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const epoch=useRef(0),active=useRef(open),refreshRef=useRef<()=>void>(()=>{});
 active.current=open;
 useEffect(()=>{
  const generation=++epoch.current,scope=readScope();let controller:AbortController|null=null;
  setSnapshot(null);setError('');setBusy(false);
  if(!open)return;
  const current=()=>active.current&&epoch.current===generation&&scope!==''&&readScope()===scope;
  const clear=()=>{controller?.abort();setSnapshot(null);setError('');setBusy(false);onClose();};
  const refresh=async()=>{
   if(!current()){clear();return;}
   if(controller)return;
   const request=new AbortController();controller=request;setBusy(true);
   let failureMessage='Activity history is temporarily unavailable.';
   try{
    const token=JSON.parse(scope)[0];
    const response=await fetch(`${API_BASE}/api/lucy-v2/activity`,{headers:{Authorization:`Bearer ${token}`},signal:request.signal,cache:'no-store'});
    const data=await response.json();
    if(!current())return;
    if(!response.ok){setSnapshot(null);if([401,402,403].includes(response.status))failureMessage='Your access changed. Refresh this page or sign in again.';throw new Error('Activity request failed');}
    if(!Array.isArray(data.entries)||typeof data.checkedAt!=='string'){failureMessage='Activity history could not be verified.';throw new Error('Invalid activity response');}
    setSnapshot(data);setError('');
   }catch{if(current()&&!request.signal.aborted){setSnapshot(null);setError(failureMessage);}}
   finally{if(controller===request)controller=null;if(current())setBusy(false);}
  };
  refreshRef.current=()=>void refresh();void refresh();
  const check=()=>{if(!current())clear();};
  const visible=()=>{check();if(current()&&document.visibilityState==='visible')void refresh();};
  const scopeTimer=setInterval(check,1000),poll=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},15000);
  window.addEventListener('storage',check);window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);
  return()=>{epoch.current++;controller?.abort();clearInterval(scopeTimer);clearInterval(poll);window.removeEventListener('storage',check);window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible);};
 },[open]);
 return <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" aria-labelledby="lucy-activity-title"><DialogTitle id="lucy-activity-title">Lucy activity history</DialogTitle><DialogContent>
  <Typography paragraph>Your actions, chat receipts and background tasks in this company. Up to 50 recent records, newest update first.</Typography>
  {error&&<Alert severity="error">{error}</Alert>}
  {snapshot&&<><Typography variant="caption">Checked {time(snapshot.checkedAt)} · Times shown in your device timezone</Typography><Alert severity="info" sx={{my:2}}>{snapshot.notice}</Alert>
   {!snapshot.entries.length&&<Typography>No activity receipts were found for your current account and role.</Typography>}
   <Stack component="ol" spacing={2} sx={{pl:3}}>{snapshot.entries.map(entry=><Box component="li" key={entry.id} sx={{borderBottom:'1px solid',borderColor:'divider',pb:2}}>
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap"><Typography fontWeight={700}>{entry.title}</Typography><Chip size="small" label={entry.outcome}/></Stack>
    <Typography variant="body2">Requested or recorded: {time(entry.createdAt)} · Last update: {time(entry.updatedAt)}{entry.completedAt?` · Finished: ${time(entry.completedAt)}`:''}</Typography>
    <Typography variant="caption" sx={{overflowWrap:'anywhere'}}>Receipt: {entry.receiptId} · Source: {entry.source==='action'?'action log':entry.source==='work'?'background task':'request ledger'}</Typography>
    {entry.source==='work'&&<Box><Button onClick={()=>{onClose();onOpenWork();}}>Open tasks and evidence</Button></Box>}
   </Box>)}</Stack></>}
  {!snapshot&&!error&&<Typography role="status">{busy?'Loading activity…':'No activity loaded.'}</Typography>}
 </DialogContent><DialogActions><Button disabled={busy} onClick={()=>refreshRef.current()}>Refresh</Button><Button onClick={onClose}>Close</Button></DialogActions></Dialog>;
}
