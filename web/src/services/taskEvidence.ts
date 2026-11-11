import {API_BASE} from './api';
import {captureAuthSession} from './authSession';
export type TaskEvidenceRow={id:string;request_key:string;note:string;file_name?:string;file_type?:string;content_path?:string};
export function taskEvidenceClient(taskId:string,active:()=>boolean){
 const session=captureAuthSession(),token=localStorage.getItem('token'),user=JSON.parse(localStorage.getItem('user')||'null');
 const owner=user?.id,company=user?.companyId??user?.company_id;
 const key=`task-evidence-pending-v1:${JSON.stringify([owner,company,taskId])}`;
 const current=()=>!!token&&!!owner&&!!company&&active()&&session.isCurrent();
 const check=()=>{if(!current())throw new Error('Account or task changed. Reopen the task.');};
 const endpoint=`${API_BASE}/api/tasks/${encodeURIComponent(taskId)}/evidence`;
 let busy=false;
 const pending=()=>{check();return localStorage.getItem(key);};
 const read=async()=>{check();const response=await fetch(endpoint,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});check();const data=await response.json();check();if(!response.ok)throw new Error(data.message||'Receipts unavailable');const rows:TaskEvidenceRow[]=data.evidence||[];const saved=pending();if(saved&&rows.some(r=>r.request_key===saved))localStorage.removeItem(key);return rows;};
 const save=async(note:string,file:File|null)=>{
  check();if(busy||pending())throw new Error('Check the pending save before submitting again.');
  if(note.length>4000||(!note.trim()&&!file))throw new Error('Add a receipt or note.');
  if(file&&(!file.size||file.size>10*1024*1024||!['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type)))throw new Error('Choose a PDF, JPEG, PNG or WebP receipt up to 10 MB.');
  busy=true;const requestKey=crypto.randomUUID();
  try{const body=new FormData();body.append('requestKey',requestKey);body.append('note',note);if(file){body.append('originalFileName',file.name);body.append('file',file);}
   check();localStorage.setItem(key,requestKey);check();
   const response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${token}`},body});
   check();const data=await response.json();check();
   if(!response.ok){if([400,403].includes(response.status)&&data.retryAllowed===true)localStorage.removeItem(key);throw new Error(data.message||'Save not confirmed. Check status before submitting again.');}
   if(data.state!=='completed'||data.evidence?.request_key!==requestKey)throw new Error('Save not confirmed. Check status before submitting again.');
   return await read();
  }finally{busy=false;}
 };
 const download=async(row:TaskEvidenceRow)=>{
  check();const expected=`/tasks/${taskId}/evidence/${row.id}/content`;
  if(row.content_path!==expected)throw new Error('Receipt unavailable');
  const response=await fetch(API_BASE+'/api'+expected,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});check();
  if(!response.ok)throw new Error('Receipt unavailable');const blob=await response.blob();check();return blob;
 };
 return {current,pending,read,save,download};
}
