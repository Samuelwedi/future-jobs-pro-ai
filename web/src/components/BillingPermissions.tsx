import React,{useEffect,useState} from 'react';
import {Alert,Box,Button,Typography} from '@mui/material';
import {API_BASE} from '../services/api';
export function useBillingAccess(){
 const [access,setAccess]=useState<any>(null),[error,setError]=useState('');
 useEffect(()=>{let live=true;fetch(`${API_BASE}/api/subscriptions/capabilities`,{headers:{Authorization:`Bearer ${localStorage.getItem('token')}`},cache:'no-store'})
 .then(async r=>{const b=await r.json();if(!r.ok)throw Error(b.message||'Unable to check company access');if(live)setAccess(b);})
 .catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[]);
 return {access,error};
}
export default function BillingPermissions(){
 const {access}=useBillingAccess();const [managers,setManagers]=useState<any[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const headers={Authorization:`Bearer ${localStorage.getItem('token')}`,'Content-Type':'application/json'};
 const load=async()=>{const r=await fetch(`${API_BASE}/api/subscriptions/billing-managers`,{headers,cache:'no-store'});const b=await r.json();if(!r.ok)throw Error(b.message);setManagers(b.managers);};
 useEffect(()=>{if(access?.canDelegateBilling)void load().catch(e=>setError(e.message));},[access]);
 if(!access?.canDelegateBilling)return null;
 const change=async(id:string,enabled:boolean)=>{setBusy(true);setError('');try{const r=await fetch(`${API_BASE}/api/subscriptions/billing-managers/${id}`,{method:'PUT',headers,body:JSON.stringify({enabled})});const b=await r.json();if(!r.ok)throw Error(b.message);await load();}catch(e:any){setError(e.message);}finally{setBusy(false);}};
 return <Box sx={{my:3,p:2,border:'1px solid',borderColor:'divider',borderRadius:2}}><Typography variant="h6">Manager billing permissions</Typography><Typography>Only you can authorize managers to purchase plans and manage company billing. Employees never pay individually.</Typography>{error&&<Alert severity="error">{error}</Alert>}{managers.length===0?<Typography>No active managers.</Typography>:managers.map(m=><Box key={m.id} sx={{my:2}}><Typography>{m.first_name} {m.last_name} — {m.email}</Typography><Button disabled={busy} onClick={()=>void change(m.id,!m.canManageBilling)}>{m.canManageBilling?'Revoke billing permission':'Authorize company billing'}</Button></Box>)}</Box>;
}
