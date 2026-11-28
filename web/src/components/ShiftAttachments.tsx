import React, {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Alert,Box,Button,Paper,Stack,Typography} from '@mui/material';
import {API_BASE} from '../services/api';
import {captureAuthSession,getAuthRevision} from '../services/authSession';

type Item = {id:string;file_name:string;file_url:string;preview_available:boolean};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const openable = (value?:string) => {
  try { const url=new URL(value||''); return url.protocol==='https:'&&!url.username&&!url.password?url.href:null; }
  catch {return null;}
};
function snapshot(){
  try {
    const user=JSON.parse(localStorage.getItem('user')||'null');
    const token=localStorage.getItem('token'), id=String(user?.id||''), company=String(user?.companyId??user?.company_id??'');
    if(token&&uuid.test(id)&&uuid.test(company))return {id,company,token};
  } catch {}
  return null;
}

export default function ShiftAttachments({shiftId,oldUrl}:{shiftId:string;oldUrl?:string|null}){
  const [revision,setRevision]=useState(0);
  const authRevision=getAuthRevision();
  const identity=snapshot(), auth=captureAuthSession();
  const scope=JSON.stringify([shiftId,revision,authRevision]);
  const onPage=useRef(document.visibilityState!=='hidden');
  const epoch=useRef({scope,active:true});
  const current=()=>onPage.current&&document.visibilityState!=='hidden'&&epoch.current.scope===scope&&epoch.current.active&&auth.isCurrent()&&!!identity;
  if(epoch.current.scope!==scope)epoch.current={scope,active:true};
  const [files,setFiles]=useState<{scope:string;rows:Item[]}|null>(null);
  const [image,setImage]=useState<{scope:string;name:string;url:string}|null>(null);
  const [message,setMessage]=useState<{scope:string;text:string}|null>(null);
  const input=useRef<HTMLInputElement>(null);
  const pending=useRef<AbortController|null>(null), read=useRef<AbortController|null>(null), object=useRef<string|null>(null);
  const [previewBusy,setPreviewBusy]=useState(false),[mutating,setMutating]=useState(false);
  const writeLock=useRef<symbol|null>(null);
  const resetPreview=()=>{
    pending.current?.abort();pending.current=null;
    if(object.current)URL.revokeObjectURL(object.current);
    object.current=null;
  };
  useLayoutEffect(()=>{
    const invalidate=()=>{
      epoch.current.active=false;
      writeLock.current=null;read.current?.abort();resetPreview();
      setRevision(v=>v+1);
    };
    const leave=()=>{onPage.current=false;invalidate();};
    const enter=()=>{onPage.current=document.visibilityState!=='hidden';invalidate();};
    const visible=()=>document.visibilityState==='hidden'?leave():enter();
    window.addEventListener('auth-session-changed',invalidate);
    window.addEventListener('popstate',invalidate);
    window.addEventListener('pagehide',leave);window.addEventListener('pageshow',enter);
    document.addEventListener('visibilitychange',visible);
    return ()=>{
      window.removeEventListener('auth-session-changed',invalidate);window.removeEventListener('popstate',invalidate);window.removeEventListener('pagehide',leave);window.removeEventListener('pageshow',enter);
      document.removeEventListener('visibilitychange',visible);
      if(epoch.current.scope===scope)epoch.current.active=false;
      writeLock.current=null;read.current?.abort();resetPreview();
    };
  },[scope]);
  const headers=()=>({Authorization:`Bearer ${identity!.token}`,'X-Project-Actor':identity!.id,'X-Project-Company':identity!.company});
  const path=`${API_BASE}/api/attachments/shift/${encodeURIComponent(shiftId)}`;
  const load=async()=>{
    if(!current()||!uuid.test(shiftId))return;
    read.current?.abort();
    const request=new AbortController();read.current=request;
    const eligible=()=>current()&&read.current===request&&!request.signal.aborted;
    try{
      const response=await fetch(path+'/files',{headers:headers(),signal:request.signal,cache:'no-store',redirect:'error'});
      if(!eligible())return;
      const payload=await response.json();
      if(!eligible())return;
      if(!response.ok||!payload.success||!Array.isArray(payload.files))throw Error();
      setFiles({scope,rows:payload.files.filter((item:any)=>typeof item?.id==='string'&&uuid.test(item.id)
        &&typeof item.file_name==='string'&&typeof item.file_url==='string'&&typeof item.preview_available==='boolean')});
    }catch{if(eligible())setMessage({scope,text:'Could not load files for this shift.'});}
  };
  useEffect(()=>{epoch.current.active=true;setPreviewBusy(false);setMutating(false);void load();},[scope]);
  const rows=current()&&files?.scope===scope?files.rows:[];
  const workingImage=current()&&image?.scope===scope&&image.url===object.current?image:null;
  const show=async (file:Item)=>{
    if(!current()||!rows.includes(file)||!file.preview_available||pending.current)return;
    resetPreview();setImage(null);setMessage(null);
    const request=new AbortController();pending.current=request;setPreviewBusy(true);
    const eligible=()=>current()&&pending.current===request&&!request.signal.aborted;
    try{
      const response=await fetch(path+`/file/${encodeURIComponent(file.id)}/preview`,{headers:headers(),signal:request.signal,cache:'no-store',redirect:'error'});
      if(!eligible())return;
      const length=Number(response.headers.get('content-length'));
      if(!response.ok||response.headers.get('content-type')!=='image/jpeg'||!Number.isInteger(length)||length<3||length>262144)throw Error();
      const blob=await response.blob();
      if(!eligible())return;
      if(blob.size!==length||blob.type!=='image/jpeg')throw Error();
      const url=URL.createObjectURL(blob);object.current=url;
      setImage({scope,name:file.file_name,url});
    }catch{if(eligible())setMessage({scope,text:'Preview unavailable. Use Open original instead.'});}
    finally{if(pending.current===request){pending.current=null;if(current())setPreviewBusy(false);}}
  };
  const modify=async(file?:File,remove?:Item)=>{
    if(!current()||writeLock.current||(!file&&!remove)||remove&&!rows.includes(remove))return;
    if(remove&&!window.confirm('Remove this file?'))return;
    if(!current())return;
    const op=Symbol();writeLock.current=op;
    setMutating(true);setMessage(null);resetPreview();setPreviewBusy(false);setImage(null);
    const eligible=()=>current()&&writeLock.current===op;
    try{
      const body=file?new FormData():undefined;
      if(file&&body){body.append('file',file);body.append('shiftId',shiftId);}
      const endpoint=remove?encodeURIComponent(remove.id):'upload';
      const response=await fetch(`${API_BASE}/api/attachments/${endpoint}`,{method:remove?'DELETE':'POST',headers:headers(),body,redirect:'error'});
      if(!eligible())return;
      if(!response.ok)throw Error();
      await load();
    }catch{if(eligible())setMessage({scope,text:'Could not confirm the change. Refresh the shift to check.'});}
    finally{if(eligible()){writeLock.current=null;setMutating(false);if(input.current)input.current.value='';}}
  };
  const old=current()&&oldUrl?openable(oldUrl):null;
  const pendingMessage=current()&&message?.scope===scope?message.text:null;
  return <Paper variant="outlined" sx={{p:1.5,bgcolor:'background.paper'}}>
    <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
      <Typography fontWeight={800}>Shift documents &amp; media</Typography>
      <Button size="small" disabled={mutating||!current()} onClick={()=>{if(current())input.current?.click();}}>Upload</Button>
      <input ref={input} hidden type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.rtf,.png,.jpg,.jpeg,.webp,.mp3,.m4a,.wav,.mp4,.mov,.webm" onChange={e=>void modify(e.target.files?.[0])}/>
    </Stack>
    {pendingMessage&&<Alert severity="info">{pendingMessage}</Alert>}
    {rows.map(file=>{
      const href=openable(file.file_url);
      return <Stack key={file.id} direction={{xs:'column',sm:'row'}} alignItems={{sm:'center'}} gap={.5} sx={{my:1}}>
        <Typography sx={{overflowWrap:'anywhere',flex:1}}>{file.file_name}</Typography>
        {file.preview_available&&<Button size="small" disabled={previewBusy||mutating} onClick={()=>void show(file)}>Preview image</Button>}
        {href&&<Button size="small" component="a" href={href} target="_blank" rel="noopener noreferrer"
          onClick={e=>{if(!current())e.preventDefault();}}>Open original</Button>}
        <Button size="small" color="warning" disabled={mutating} onClick={()=>void modify(undefined,file)}>Remove</Button>
      </Stack>;
    })}
    {old&&!rows.some(row=>openable(row.file_url)===old)&&<Button size="small" component="a" href={old} target="_blank" rel="noopener noreferrer"
      onClick={e=>{if(!current())e.preventDefault();}}>Open earlier attachment</Button>}
    {previewBusy&&<Typography role="status">Loading preview…</Typography>}
    {workingImage&&<Box sx={{mt:1}}>
      <Button size="small" onClick={()=>{if(current()){resetPreview();setImage(null);}}}>Close preview</Button>
      <Box component="img" alt={`Preview of ${workingImage.name}`} src={workingImage.url} sx={{display:'block',maxWidth:'100%',maxHeight:420,objectFit:'contain'}}/>
    </Box>}
  </Paper>;
}
