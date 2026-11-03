import React,{useEffect,useRef,useState} from 'react';
import {Alert,Button,Stack,Typography} from '@mui/material';
import {api} from '../services/api';
export default function LucyProviderStatus(){
 const[status,setStatus]=useState<any>(null),[error,setError]=useState(''),[expanded,setExpanded]=useState(false);const sequence=useRef(0);
 const refresh=async()=>{const current=++sequence.current;try{const result=await api.get<any>('/api/lucy-v2/status');if(current===sequence.current){setStatus(result);setError('');}}catch{if(current===sequence.current)setError('Lucy provider configuration could not be checked.');}};
 useEffect(()=>{void refresh();return()=>{sequence.current++;};},[]);
 const label=!status?'Checking Lucy configuration…':!status.configurationValid?'Inference configuration needs attention':status.provider==='compatible'?'Compatible inference configured':status.provider==='openai'?'OpenAI configured':'No inference provider configured';
 return <Alert severity={error||status&&!status.configured?'warning':'info'} sx={{mb:2}}><Stack spacing={1}><Typography variant="body2">{error||label}</Typography><Button size="small" onClick={()=>setExpanded(value=>!value)}>{expanded?'Hide provider details':'Provider details'}</Button>{expanded&&<><Typography variant="body2">Provider credits are separate from your workspace allowance. Configuration does not verify provider capacity. {status?.paidFallbackEnabled?'Paid fallback is enabled in server configuration.':''}</Typography>{status&&!status.configured&&<Typography variant="body2">Core commands remain available: show this pay period, prepare payroll and brief me.</Typography>}<Button size="small" onClick={()=>void refresh()}>Check provider configuration</Button></>}</Stack></Alert>;
}
