import React,{useEffect,useRef,useState} from 'react';
import {Alert,Button,Stack,TextField,Typography} from '@mui/material';
import {taskEvidenceClient,type TaskEvidenceRow} from '../services/taskEvidence';
export default function TaskEvidence({taskId,active}:{taskId:string;active:()=>boolean}){
 const mounted=useRef(true);const [client]=useState(()=>taskEvidenceClient(taskId,()=>mounted.current&&active()));
 const [rows,setRows]=useState<TaskEvidenceRow[]>([]),[note,setNote]=useState(''),[file,setFile]=useState<File|null>(null),[pending,setPending]=useState(false),[busy,setBusy]=useState(true),[error,setError]=useState('');
 const flight=useRef(false),input=useRef<HTMLInputElement>(null);
 const run=async(work:()=>Promise<void>)=>{if(flight.current||!client.current())return;flight.current=true;setBusy(true);setError('');try{await work();}catch(e:any){if(client.current())setError(e.message);}finally{flight.current=false;if(client.current()){setPending(!!client.pending());setBusy(false);}}};
 const refresh=async()=>{const wasPending=client.pending();const data=await client.read();if(client.current()){setRows(data);if(wasPending&&!client.pending()){setNote('');setFile(null);if(input.current)input.current.value='';}}};
 useEffect(()=>{mounted.current=true;void run(refresh);return()=>{mounted.current=false;};},[]);
 const save=()=>run(async()=>{const data=await client.save(note,file);if(client.current()){setRows(data);setNote('');setFile(null);if(input.current)input.current.value='';}});
 const download=(row:TaskEvidenceRow)=>run(async()=>{const blob=await client.download(row);if(!client.current())return;const url=URL.createObjectURL(blob);try{const a=document.createElement('a');a.href=url;a.download=row.file_name||'receipt';a.click();}finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}});
 if(!client.current())return null;
 return <Stack gap={2}><Typography>Receipts and notes are visible to the assigned employee and company managers. This does not submit a reimbursement claim.</Typography>
 {error&&<Alert severity="error">{error}</Alert>}{pending?<Alert severity="warning">A save is awaiting confirmation. Check status; do not upload the same receipt again. If it remains pending, ask your manager to investigate.</Alert>:<>
 <TextField label="Expense or task note" multiline minRows={3} value={note} disabled={busy} inputProps={{maxLength:4000}} onChange={e=>setNote(e.target.value)}/>
 <Button component="label" disabled={busy}>Choose receipt (PDF or photo)<input ref={input} hidden type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e=>setFile(e.target.files?.[0]||null)}/></Button>
 {file&&<Typography>{file.name} <Button disabled={busy} onClick={()=>{setFile(null);if(input.current)input.current.value='';}}>Remove selected receipt</Button></Typography>}
 <Button disabled={busy||(!note.trim()&&!file)} variant="contained" onClick={()=>void save()}>Save receipt or note</Button></>}
 <Button disabled={busy} onClick={()=>void run(refresh)}>{pending?'Check save status':'Refresh receipts and notes'}</Button>
 {rows.map(row=><Stack key={row.id} gap={1} sx={{border:1,borderColor:'divider',p:2}}><Typography sx={{whiteSpace:'pre-wrap'}}>{row.note}</Typography>{row.file_name&&<Button disabled={busy} onClick={()=>void download(row)}>Download {row.file_name}</Button>}</Stack>)}
 {!busy&&!rows.length&&<Typography>No receipts or notes yet.</Typography>}</Stack>;
}
