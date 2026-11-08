import React, { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { api } from '../services/api';
import LucySourceEvidence from './LucySourceEvidence';
import {buildLucyWorkReport, readLucyWorkModes, readLucyBriefingOptions, lucyBriefingPreview, lucyWorkModeLabel, knownLucyWorkMode, type LucyBriefingOptions, type LucyWorkJob, type LucyWorkMode, type LucyWorkModes} from '../utils/lucyWorkReport';

export type Job = LucyWorkJob;
export type Preference = {key:string;value:string;expiresAt:string};
type Preferences = {preferences:Preference[];options:Record<string,string[]>;limit:number};
export type LucyWorkspaceClient = Pick<typeof api,'get'|'post'|'put'|'delete'>;
// A sample source must supply both a client and a synthetic scope. It never uses account tokens.
export type LucySampleWorkspace = {client:LucyWorkspaceClient;scopeKey:string};
const unavailableSample = async():Promise<never>=>{throw new Error('Sample workspace unavailable. No live data connection was attempted.');};
const unavailableSampleClient:LucyWorkspaceClient = {get:unavailableSample,post:unavailableSample,put:unavailableSample,delete:unavailableSample};
const label = (value:string) => value.replace(/_/g,' ');
const activeJob = (job:Job) => ['queued','running'].includes(job.status);

export default function LucyWorkspacePanel(props:{open:boolean;onClose:()=>void;sampleWorkspace?:LucySampleWorkspace}) {
  const {open,onClose,sampleWorkspace}=props;
  const isSample=Object.prototype.hasOwnProperty.call(props,'sampleWorkspace');
  const validSample=sampleWorkspace!=null && typeof sampleWorkspace.scopeKey==='string' && Boolean(sampleWorkspace.scopeKey.trim())
    && sampleWorkspace.client!=null && sampleWorkspace.client!==api
    && ['get','post','put','delete'].every(method=>typeof sampleWorkspace.client[method as keyof LucyWorkspaceClient]==='function');
  // Even malformed sample props fail closed instead of falling back to the live API or auth.
  const client=isSample?(validSample?sampleWorkspace!.client:unavailableSampleClient):api;
  const scopeKey=isSample?(validSample?sampleWorkspace!.scopeKey:'invalid-sample-workspace'):undefined;
  const readScope=()=>{
    if(scopeKey!==undefined)return scopeKey;
    try {
      const token=localStorage.getItem('token');
      if(!token)return null;
      const user=JSON.parse(localStorage.getItem('user')||'{}');
      return JSON.stringify([token,user.id,user.companyId??user.company_id,user.role]);
    } catch {return null;}
  };
  const [jobs,setJobs]=useState<Job[]>([]),[modes,setModes]=useState<LucyWorkModes|null>(null);
  const [selectedMode,setSelectedMode]=useState<LucyWorkMode|null>(null);
  const mode=selectedMode??(modes?.record_search?'record_search':modes?.work_briefing?'work_briefing':'ai_research');
  const enabled=modes?.[mode]===true;
  const promptLimit=mode==='ai_research'?4000:200;
  const [briefing,setBriefing]=useState<LucyBriefingOptions>({from:'',to:'',taskStatus:'open'});
  const briefingOptions=readLucyBriefingOptions(briefing);
  const [preferences,setPreferences]=useState<Preferences>({preferences:[],options:{},limit:6});
  const [prompt,setPrompt]=useState(''),[key,setKey]=useState('response_style'),[value,setValue]=useState('concise');
  const inputIdentity=JSON.stringify([mode,mode==='work_briefing'?briefingOptions:prompt.trim()]);
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const epoch=useRef(0),reads=useRef(0),lock=useRef(false),session=useRef('');
  const refreshing=useRef<object|null>(null);
  const mounted=useRef(false);
  const source=useRef(client);
  // Retain uncertain receipts across edits. Returning to the same canonical input must retry, not duplicate it.
  const pending=useRef(new Map<string,string>());
  const view=useRef({open,client,scopeKey,mode,jobs,inputIdentity,enabled});
  view.current={open,client,scopeKey,mode,jobs,inputIdentity,enabled};
  const renderedEpoch=epoch.current;
  const downloads=useRef(new Map<string,ReturnType<typeof setTimeout>>());
  const current=(generation:number)=>mounted.current && view.current.open && view.current.client===client && view.current.scopeKey===scopeKey
    && epoch.current===generation && source.current===client && session.current===readScope();
  const releaseDownloads=()=>{
    for(const [url,timer] of downloads.current){clearTimeout(timer);URL.revokeObjectURL(url);}
    downloads.current.clear();
  };

  const refresh=async(generation:number,initial=false)=>{
    if(lock.current||refreshing.current||!current(generation))return;
    const request={};refreshing.current=request;
    const sequence=++reads.current;
    if(initial)setLoading(true);
    try {
      const results=await Promise.allSettled([client.get<{enabled:boolean;modes?:unknown;jobs:Job[]}>('/api/lucy-v2/work'),client.get<Preferences>('/api/lucy-v2/preferences')]);
      if(!current(generation)||sequence!==reads.current)return;
      if(results[0].status==='fulfilled'){setJobs(results[0].value.jobs);setModes(readLucyWorkModes(results[0].value));}
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
    mounted.current=open;
    const token=readScope()||'';
    const changedSession=session.current!==token||source.current!==client;
    session.current=token;source.current=client;lock.current=false;refreshing.current=null;setBusy(false);
    setJobs([]);setPreferences({preferences:[],options:{},limit:6});setModes(null);setError('');setNotice('');setLoading(false);
    // Request keys and drafts never carry across account sessions.
    if(changedSession){setPrompt('');setBriefing({from:'',to:'',taskStatus:'open'});setSelectedMode(null);pending.current.clear();}
    releaseDownloads();
    if(!open)return;
    void refresh(generation,true);
    const timer=setInterval(()=>{
      if(!current(generation)){setJobs([]);setPreferences({preferences:[],options:{},limit:6});onClose();return;}
      if(document.visibilityState==='visible')void refresh(generation);
    },5000);
    return()=>{mounted.current=false;clearInterval(timer);epoch.current++;releaseDownloads();};
  },[open,client,scopeKey]);

  const changePrompt=(next:string)=>{
    if(lock.current)return;
    const identity=JSON.stringify([view.current.mode,next.trim()]);
    view.current.inputIdentity=identity;setPrompt(next);
  };
  const changeBriefing=(field:keyof LucyBriefingOptions,next:string)=>{
    if(lock.current)return;
    const updated={...briefing,[field]:next};
    const identity=JSON.stringify(['work_briefing',readLucyBriefingOptions(updated)]);
    view.current.inputIdentity=identity;setBriefing(updated);
  };
  const changeMode=(next:LucyWorkMode)=>{
    if(lock.current||!['record_search','work_briefing','ai_research'].includes(next)||modes?.[next]!==true)return;
    view.current.mode=next;setSelectedMode(next);
  };
  const mutate=async(work:()=>Promise<void>)=>{
    if(lock.current||renderedEpoch!==epoch.current)return;
    const generation=epoch.current;if(!current(generation))return;
    lock.current=true;reads.current++;setLoading(false);setBusy(true);setError('');setNotice('');
    try {await work();}
    catch(cause:any){if(current(generation))setError(cause.message||'Request was not confirmed. Refresh before retrying.');}
    finally {if(epoch.current===generation){lock.current=false;if(current(generation))setBusy(false);}}
  };
  const start=()=>mutate(async()=>{
    const text=prompt.trim();
    if(renderedEpoch!==epoch.current||!enabled||!view.current.enabled||view.current.mode!==mode||view.current.inputIdentity!==inputIdentity)return;
    if(mode==='work_briefing'?!briefingOptions:(!text||prompt.length>promptLimit))return;
    const generation=epoch.current;
    const retainedKey=pending.current.get(inputIdentity);
    if(!retainedKey&&pending.current.size>=20)throw new Error('Too many tasks have unconfirmed responses. Retry an unchanged task to confirm it before starting another.');
    const requestKey=retainedKey??crypto.randomUUID();
    pending.current.set(inputIdentity,requestKey);
    const body=mode==='work_briefing'?{mode,requestKey,options:briefingOptions}:{prompt:text,requestKey,...(modes?.explicit?{mode}:{})};
    const result=await client.post<{job:Job}>('/api/lucy-v2/work',body);
    if(!current(generation))return;
    // A malformed acknowledgement is still uncertain: retain the exact draft and request key.
    if(!result||typeof result!=='object'||Array.isArray(result)||!result.job||typeof result.job!=='object'||Array.isArray(result.job)
      || typeof result.job.id!=='string'||!result.job.id.trim()||result.job.id.length>200) {
      throw new Error('Task submission was not confirmed. Retry the unchanged task to check it safely.');
    }
    setJobs(previous=>[result.job,...previous.filter(job=>job.id!==result.job.id)]);setPrompt('');pending.current.delete(inputIdentity);
    // Like the text draft, clear submitted briefing inputs so a later double-click cannot queue a second task.
    if(mode==='work_briefing')setBriefing({from:'',to:'',taskStatus:'open'});
    view.current.inputIdentity=JSON.stringify([mode,mode==='work_briefing'?null:'']);
    setNotice(isSample?'Sample task queued in this tab only. A fixed example result appears after a few seconds; no AI model is called.':'Read-only task saved. You can close this page and return for its result.');
  });
  const cancel=(job:Job)=>mutate(async()=>{
    const generation=epoch.current;
    if(!view.current.jobs.some(item=>item===job)||!knownLucyWorkMode(job.mode))return;
    const result=await client.post<{job:Job}>(`/api/lucy-v2/work/${encodeURIComponent(job.id)}/cancel`);
    if(current(generation))setJobs(previous=>previous.map(item=>item.id===job.id?result.job:item));
  });
  const downloadReport=(job:Job)=>mutate(async()=>{
    const generation=epoch.current;
    const authorized=()=>current(generation)&&view.current.jobs.some(item=>item===job);
    if(!authorized())return;
    const report=buildLucyWorkReport(job,{sample:isSample});
    if(!authorized())return;
    const url=URL.createObjectURL(new Blob([report.text],{type:'text/plain;charset=utf-8'}));
    let timer:ReturnType<typeof setTimeout>|undefined;
    let anchor:HTMLAnchorElement|undefined;
    try {
      anchor=document.createElement('a');
      if(!authorized())return;
      anchor.href=url;anchor.download=report.filename;anchor.hidden=true;
      document.body.appendChild(anchor);
      if(!authorized())return;
      anchor.click();
      timer=setTimeout(()=>{URL.revokeObjectURL(url);downloads.current.delete(url);},1000);
      downloads.current.set(url,timer);
      setNotice(isSample?'Sample report download requested. It includes your query and clearly labeled synthetic results.':'Report download requested. It contains the task result and available source excerpts.');
    } finally {anchor?.remove();if(timer===undefined)URL.revokeObjectURL(url);}
  });
  const savePreference=()=>mutate(async()=>{
    const generation=epoch.current;
    const result=await client.put<{preference:Preference}>(`/api/lucy-v2/preferences/${encodeURIComponent(key)}`,{value,expiresAt:new Date(Date.now()+90*86400000).toISOString()});
    if(current(generation)){setPreferences(previous=>({...previous,preferences:[...previous.preferences.filter(item=>item.key!==key),result.preference]}));setNotice(isSample?'Sample preference saved in this tab only. No account preference was changed.':'Preference saved for 90 days. You can change or forget it at any time.');}
  });
  const forget=(item:Preference)=>mutate(async()=>{
    const generation=epoch.current;await client.delete(`/api/lucy-v2/preferences/${encodeURIComponent(item.key)}`);
    if(current(generation))setPreferences(previous=>({...previous,preferences:previous.preferences.filter(saved=>saved.key!==item.key)}));
  });
  const close=()=>{
    if(lock.current)return;
    mounted.current=false;epoch.current++;releaseDownloads();onClose();
  };
  return <Dialog open={open} onClose={close} fullWidth maxWidth="md" aria-labelledby="lucy-workspace-title">
    <DialogTitle id="lucy-workspace-title">{isSample?'Sample Lucy tasks and preferences':'Lucy tasks and preferences'}</DialogTitle>
    <DialogContent dividers><Stack spacing={2}>
      {isSample&&<Alert severity="info">Sample research simulation. No AI model is called, no API requests are made, and no real records are read or changed. Your text and sample preferences stay in memory in this tab and reset when you leave Lucy AI or reload. Downloading a report saves a plain-text copy to your device.</Alert>}
      {error&&<Alert severity="error">{error}</Alert>}{notice&&<Alert severity="success">{notice}</Alert>}
      <Typography variant="h6">{isSample?'Sample background research':'Background research'}</Typography>
      <Typography variant="body2">{isSample?'Try queueing or cancelling a sample task, then inspect its example sources. Each sample mode replays its own fixed example, not a researched answer. Briefing dates and task status are displayed only, not applied to the sample result.':'Lucy can investigate your accessible work records in the background. These tasks cannot change records, send messages, browse external sites, or make payments.'}</Typography>
      {modes&&!loading&&!enabled&&<Alert severity="info">{mode==='ai_research'?'AI background research is not enabled for this deployment.':mode==='work_briefing'?'Work briefing is not enabled for this deployment.':'Company-record search is not enabled for this deployment.'}{modes.record_search?' Select company-record search to investigate without an AI model.':''}</Alert>}
      <TextField select label="Research mode" value={modes?mode:''} onChange={event=>changeMode(event.target.value as LucyWorkMode)} disabled={busy||loading||!modes}>
        {modes?.explicit&&<MenuItem value="record_search" disabled={!modes.record_search}>{isSample?'Sample record search (no AI model)':'Company-record search (no AI model)'}</MenuItem>}
        {modes?.explicit&&<MenuItem value="work_briefing" disabled={!modes.work_briefing}>{isSample?'Sample briefing (no AI model)':'Work briefing (no AI model)'}</MenuItem>}
        {!isSample&&<MenuItem value="ai_research" disabled={!modes?.ai_research}>AI research</MenuItem>}
      </TextField>
      <Typography variant="body2">{isSample?'The sample replays a fixed example. It does not search your query or filter by your briefing dates or task status.':mode==='work_briefing'?'Prepare counts, the six oldest matching tasks across all dates, and the six earliest stored shifts in an explicit date range. Open tasks are pending or in progress. Due dates are not evaluated. Recurrence rules are not expanded. No AI model is called.':mode==='record_search'?'Search accessible company work records and documents by keywords. Lucy prepares a deterministic report without calling an AI model.':'Ask Lucy to investigate accessible work records using the enabled AI research service.'}</Typography>
      {mode==='work_briefing'?<Stack spacing={1}>
        <Stack direction={{xs:'column',sm:'row'}} spacing={1}>
          <TextField fullWidth type="date" label="Shift start date" value={briefing.from} onChange={event=>changeBriefing('from',event.target.value)} InputLabelProps={{shrink:true}} disabled={busy||loading||!enabled}/>
          <TextField fullWidth type="date" label="Shift end date" value={briefing.to} onChange={event=>changeBriefing('to',event.target.value)} InputLabelProps={{shrink:true}} disabled={busy||loading||!enabled}/>
          <TextField fullWidth select label="Task status" value={briefing.taskStatus} onChange={event=>changeBriefing('taskStatus',event.target.value)} disabled={busy||loading||!enabled}>
            <MenuItem value="open">Open (pending or in progress)</MenuItem><MenuItem value="pending">Pending</MenuItem><MenuItem value="in_progress">In progress</MenuItem><MenuItem value="completed">Completed</MenuItem><MenuItem value="all">All statuses</MenuItem>
          </TextField>
        </Stack>
        <Typography variant="body2" role="status">{briefingOptions?`${isSample?'Sample inputs (display only): ':''}${lucyBriefingPreview(briefingOptions)}`:'Choose valid start and end dates, in order, spanning at most 31 days inclusive.'}</Typography>
      </Stack>:<TextField label="Research task" multiline minRows={2} value={prompt} onChange={event=>changePrompt(event.target.value)} placeholder={isSample?'Summarize the sample Riverside handover risks.':undefined} inputProps={{maxLength:promptLimit}} helperText={`${prompt.length}/${promptLimit} characters${mode==='record_search'?' · Use a short keyword query':''}`} error={prompt.length>promptLimit} disabled={busy||loading||!enabled}/>}
      <Box><Button variant="contained" disabled={busy||loading||!enabled||(mode==='work_briefing'?!briefingOptions:!prompt.trim()||prompt.length>promptLimit)} onClick={()=>void start()}>Start read-only task</Button></Box>
      {jobs.map(job=><Paper key={job.id} variant="outlined" sx={{p:2}}><Stack spacing={1}>
        <Stack direction="row" justifyContent="space-between" spacing={1}><Typography sx={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{job.prompt}</Typography><Chip size="small" label={job.status}/></Stack>
        <Typography variant="caption">{lucyWorkModeLabel(job.mode,isSample)} · Created {new Date(job.createdAt).toLocaleString()}</Typography>
        {!knownLucyWorkMode(job.mode)&&<Alert severity="warning">This task uses an unavailable work mode. Its result cannot be displayed or exported by this client.</Alert>}
        {knownLucyWorkMode(job.mode)&&job.result?.text&&<Typography sx={{whiteSpace:'pre-wrap'}}>{job.result.text}</Typography>}
        {knownLucyWorkMode(job.mode)&&<LucySourceEvidence evidence={job.result?.evidence}/>}
        {knownLucyWorkMode(job.mode)&&(job.status==='completed'||(job.status==='partial'&&(job.mode==='record_search'||job.mode==='work_briefing')))&&<Box><Button disabled={busy||loading} onClick={()=>void downloadReport(job)}>{job.status==='partial'?'Download partial report (.txt)':'Download report (.txt)'}</Button></Box>}
        {knownLucyWorkMode(job.mode)&&job.status==='partial'&&<Alert severity="warning">{job.mode==='work_briefing'?'This work briefing is partial. Counts or records may be missing because sources were unavailable or capped. Available results can be downloaded with a partial-result warning.':job.mode==='record_search'?'This record search is partial. Available results may be downloaded with an incomplete-source warning. Narrow the query to reduce retrieval limits.':'This AI task is partial. A completed result is required to download a report.'}</Alert>}
        {job.error&&<Alert severity="warning">{job.error}</Alert>}
        {knownLucyWorkMode(job.mode)&&activeJob(job)&&<Box><Button color="warning" disabled={busy} onClick={()=>void cancel(job)}>Cancel task</Button></Box>}
      </Stack></Paper>)}
      <Divider/><Typography variant="h6">Saved preferences</Typography>
      <Typography variant="body2">{isSample?'Practice saving and forgetting explicit choices. The expiry dates are examples; sample preferences do not persist or grant permission to act.':'Only choices you save are remembered. They apply to your account in this company, expire after 90 days, and never grant Lucy permission to act.'}</Typography>
      <Stack direction={{xs:'column',sm:'row'}} spacing={1}>
        <TextField select fullWidth label="Preference" value={preferences.options[key]?key:''} onChange={event=>{setKey(event.target.value);setValue(preferences.options[event.target.value]?.[0]||'');}} disabled={busy||!Object.keys(preferences.options).length}>{Object.keys(preferences.options).map(option=><MenuItem key={option} value={option}>{label(option)}</MenuItem>)}</TextField>
        <TextField select fullWidth label="Value" value={preferences.options[key]?.includes(value)?value:''} onChange={event=>setValue(event.target.value)} disabled={busy||!preferences.options[key]?.length}>{(preferences.options[key]||[]).map(option=><MenuItem key={option} value={option}>{label(option)}</MenuItem>)}</TextField>
        <Button onClick={()=>void savePreference()} disabled={busy||!preferences.options[key]?.includes(value)}>Save preference</Button>
      </Stack>
      {preferences.preferences.map(item=><Stack key={item.key} direction="row" justifyContent="space-between" spacing={1}><Box><Typography>{label(item.key)}: {label(item.value)}</Typography><Typography variant="caption">Expires {new Date(item.expiresAt).toLocaleDateString()}</Typography></Box><Button disabled={busy} onClick={()=>void forget(item)}>Forget</Button></Stack>)}
      <Box><Button disabled={busy||loading} onClick={()=>void refresh(epoch.current,true)}>{loading?'Loading…':'Refresh'}</Button></Box>
    </Stack></DialogContent>
    <DialogActions><Button disabled={busy} onClick={close}>Close</Button></DialogActions>
  </Dialog>;
}
