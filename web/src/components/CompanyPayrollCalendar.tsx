import React, {useEffect,useState} from 'react';
import {Alert,Box,Button,CircularProgress,MenuItem,Paper,TextField,Typography} from '@mui/material';
import {api} from '../services/api';
type Calendar={schedule:string;timezone:string;anchor:string;weekStart:number};
const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
export default function CompanyPayrollCalendar(){
 const [value,setValue]=useState<Calendar>({schedule:'weekly',timezone:'UTC',anchor:'',weekStart:1});
 const [ready,setReady]=useState(false);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
 async function load(){
  const result=await api.get<{company:{schedule:string;timezone:string;anchor:string|null;week_start:number}}>('/api/command-center/overview');
  setValue({schedule:result.company.schedule,timezone:result.company.timezone,anchor:result.company.anchor||'',weekStart:result.company.week_start});setReady(true);
 }
 useEffect(()=>{load().catch(e=>setError(e.message||'Could not load payroll calendar')).finally(()=>setLoading(false));},[]);
 async function save(){
  setError('');setSuccess('');setSaving(true);
  try{
   if(value.schedule==='biweekly'&&!value.anchor)throw new Error('Biweekly payroll requires a known period start date.');
   const current=await api.get<{company:{timezone:string}}>('/api/command-center/overview');
   await api.put('/api/command-center/calendar',{...value,timezone:current.company.timezone});
   await load();setSuccess('Payroll calendar saved. Overtime workweeks remain configured separately above.');
  }catch(e:any){setError(e.message||'Could not save calendar');}finally{setSaving(false);}
 }
 return <Paper sx={{p:3,mb:3,bgcolor:'#1A1A1A',border:'1px solid #333'}}>
  <Typography variant="h6" mb={1}>Payroll calendar</Typography>
  <Typography color="text.secondary" mb={2}>Choose pay-period frequency and boundaries. A pay period can contain several overtime workweeks.</Typography>
  {loading?<CircularProgress size={24}/>:<Box sx={{display:'grid',gap:2}}>
   {error&&<Alert severity="error">{error}</Alert>}{success&&<Alert severity="success">{success}</Alert>}
   <TextField select label="Pay-period frequency" value={value.schedule} onChange={e=>setValue({...value,schedule:e.target.value})}>
    {['weekly','biweekly','semimonthly','monthly'].map(x=><MenuItem key={x} value={x}>{x}</MenuItem>)}
   </TextField>
   {(value.schedule==='weekly'||value.schedule==='biweekly')&&<TextField select label="Payroll calendar week starts" value={value.weekStart} onChange={e=>setValue({...value,weekStart:Number(e.target.value)})}>{days.map((x,i)=><MenuItem key={x} value={i}>{x}</MenuItem>)}</TextField>}
   {value.schedule==='biweekly'&&<TextField type="date" label="Known pay-period start date" InputLabelProps={{shrink:true}} value={value.anchor} onChange={e=>setValue({...value,anchor:e.target.value})}/>}
   <Typography variant="body2" color="text.secondary">Company timezone: {value.timezone}. Edit the shared timezone in Overtime Rules above. Semimonthly periods use days 1–15 and 16–month end; monthly periods use calendar months.</Typography>
   <Button variant="contained" onClick={()=>void save()} disabled={saving||!ready}>{saving?'Saving...':'Save payroll calendar'}</Button>
  </Box>}
 </Paper>;
}
