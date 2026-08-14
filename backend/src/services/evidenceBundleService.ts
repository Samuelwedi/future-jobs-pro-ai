import crypto from 'crypto';
import { pool } from '../config/database';

type ZipEntry = { name: string; data: Buffer };
type Selection = { photoIds?: string[]; voiceNoteIds?: string[]; attachmentIds?: string[] };
const crcTable = Array.from({ length: 256 }, (_, n) => { let c=n; for(let k=0;k<8;k++) c=(c&1)?0xedb88320^(c>>>1):c>>>1; return c>>>0; });
function crc32(data: Buffer) { let c=0xffffffff; for(const byte of data)c=crcTable[(c^byte)&255]^(c>>>8); return (c^0xffffffff)>>>0; }
function zip(entries: ZipEntry[]): Buffer {
  const local: Buffer[]=[]; const central: Buffer[]=[]; let offset=0;
  for(const entry of entries){ const name=Buffer.from(entry.name.replace(/[^\w.\-/ ]/g,'_')); const crc=crc32(entry.data); const h=Buffer.alloc(30); h.writeUInt32LE(0x04034b50); h.writeUInt16LE(20,4); h.writeUInt16LE(0,6); h.writeUInt16LE(0,8); h.writeUInt32LE(crc,14); h.writeUInt32LE(entry.data.length,18); h.writeUInt32LE(entry.data.length,22); h.writeUInt16LE(name.length,26); local.push(h,name,entry.data); const ch=Buffer.alloc(46); ch.writeUInt32LE(0x02014b50); ch.writeUInt16LE(20,4); ch.writeUInt16LE(20,6); ch.writeUInt32LE(crc,16); ch.writeUInt32LE(entry.data.length,20); ch.writeUInt32LE(entry.data.length,24); ch.writeUInt16LE(name.length,28); ch.writeUInt32LE(offset,42); central.push(ch,name); offset+=h.length+name.length+entry.data.length; }
  const center=Buffer.concat(central); const end=Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length,8); end.writeUInt16LE(entries.length,10); end.writeUInt32LE(center.length,12); end.writeUInt32LE(offset,16); return Buffer.concat([...local,center,end]);
}
function esc(value: unknown) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] || c)); }
async function fetchMedia(url: string, maxBytes = 75*1024*1024) { const response=await fetch(url,{signal:AbortSignal.timeout(30000)}); if(!response.ok)throw new Error(`Media download failed (${response.status})`); const data=Buffer.from(await response.arrayBuffer()); if(data.length>maxBytes)throw new Error('Media is larger than 75 MB'); return data; }
function ext(url:string,mime?:string){ const fromUrl=(url.split('?')[0].match(/\.[a-z0-9]{2,5}$/i)||[])[0]; if(fromUrl)return fromUrl; if(mime?.includes('pdf'))return '.pdf'; if(mime?.includes('video'))return '.mp4'; if(mime?.includes('audio'))return '.m4a'; return '.bin'; }

export async function evidenceOptions(companyId:string,timeEntryId:string){
  const entry=await pool.query(`SELECT te.*, concat_ws(' ',u.first_name,u.last_name) employee_name,p.name project_name,p.address project_address,c.name company_name FROM time_entries te JOIN users u ON u.id=te.user_id LEFT JOIN projects p ON p.id=te.project_id JOIN companies c ON c.id=u.company_id WHERE te.id=$1 AND u.company_id=$2`,[timeEntryId,companyId]);
  if(!entry.rowCount)throw new Error('Time entry not found');
  const [photos,voices,attachments,gps]=await Promise.all([
    pool.query(`SELECT id,s3_key url,file_type,taken_at,verification_hash FROM photos WHERE time_entry_id=$1 AND company_id=$2 ORDER BY taken_at`,[timeEntryId,companyId]),
    pool.query(`SELECT id,audio_url url,transcript,client_summary,duration_seconds,taken_at FROM voice_notes WHERE time_entry_id=$1 AND company_id=$2 ORDER BY taken_at`,[timeEntryId,companyId]),
    pool.query(`SELECT id,file_name,file_url url,file_type,file_size,created_at FROM attachments WHERE time_entry_id=$1 AND company_id=$2 ORDER BY created_at`,[timeEntryId,companyId]),
    pool.query(`SELECT latitude,longitude,timestamp,accuracy,speed FROM gps_tracking WHERE time_entry_id=$1 ORDER BY timestamp`,[timeEntryId]),
  ]);
  return { entry:entry.rows[0], photos:photos.rows, voiceNotes:voices.rows, attachments:attachments.rows, gps:gps.rows };
}
export async function buildEvidenceZip(companyId:string,userId:string,timeEntryId:string,selection:Selection){
  const data=await evidenceOptions(companyId,timeEntryId); const choose=(rows:any[],ids?:string[])=>ids?.length?rows.filter(r=>ids.includes(String(r.id))):rows;
  const photos=choose(data.photos,selection.photoIds); const voices=choose(data.voiceNotes,selection.voiceNoteIds); const attachments=choose(data.attachments,selection.attachmentIds);
  const generatedAt=new Date().toISOString(); const packageId=crypto.randomUUID();
  const canonical={packageId,generatedAt,timeEntry:data.entry,gps:data.gps,photos,voiceNotes:voices,attachments,generatedBy:userId};
  const hash=crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  const rows=data.gps.map((p:any)=>`${p.timestamp},${p.latitude},${p.longitude},${p.accuracy??''},${p.speed??''}`).join('\n');
  const report=`<!doctype html><html><head><meta charset="utf-8"><title>Evidence ${esc(packageId)}</title><style>body{font:14px Arial;color:#172033;margin:40px}h1{color:#006b82}.card{border:1px solid #ccd7e2;border-radius:10px;padding:16px;margin:14px 0}.hash{word-break:break-all;font-family:monospace;background:#eef7fa;padding:10px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #d8e0e8;padding:8px;text-align:left}</style></head><body><h1>Future Jobs Pro AI — Verified Evidence Package</h1><p>All-in-one job record for independent review.</p><div class="card"><b>Company:</b> ${esc(data.entry.company_name)}<br><b>Employee:</b> ${esc(data.entry.employee_name)}<br><b>Project:</b> ${esc(data.entry.project_name)}<br><b>Site:</b> ${esc(data.entry.project_address)}<br><b>Clock in:</b> ${esc(data.entry.clock_in)}<br><b>Clock out:</b> ${esc(data.entry.clock_out)}</div><div class="card"><b>Included evidence:</b> ${data.gps.length} GPS points, ${photos.length} photo/video files, ${voices.length} voice notes, ${attachments.length} documents.</div><div class="card"><b>Package ID:</b> ${esc(packageId)}<br><b>Generated:</b> ${esc(generatedAt)}<div class="hash"><b>SHA-256:</b> ${hash}</div></div><p>Open manifest.json for source metadata and gps-trail.csv for the complete trail.</p></body></html>`;
  const entries:ZipEntry[]=[{name:'evidence-report.html',data:Buffer.from(report)},{name:'manifest.json',data:Buffer.from(JSON.stringify({...canonical,verificationHash:hash},null,2))},{name:'gps-trail.csv',data:Buffer.from(`timestamp,latitude,longitude,accuracy,speed\n${rows}`)}];
  let total=entries.reduce((n,e)=>n+e.data.length,0); const addRemote=async(folder:string,item:any,index:number)=>{if(!item.url)return; const body=await fetchMedia(item.url); total+=body.length;if(total>250*1024*1024)throw new Error('Selected package exceeds 250 MB'); entries.push({name:`${folder}/${String(index+1).padStart(3,'0')}-${String(item.file_name||item.id)}${ext(item.url,item.file_type)}`,data:body});};
  for(let i=0;i<photos.length;i++)await addRemote(photos[i].file_type==='video'?'videos':'photos',photos[i],i);
  for(let i=0;i<voices.length;i++){await addRemote('voice-notes',voices[i],i);entries.push({name:`voice-notes/${String(i+1).padStart(3,'0')}-${voices[i].id}.txt`,data:Buffer.from(voices[i].transcript||'No transcript')});}
  for(let i=0;i<attachments.length;i++)await addRemote('documents',attachments[i],i);
  return { packageId, hash, buffer:zip(entries), fileName:`future-jobs-evidence-${timeEntryId}-${generatedAt.slice(0,10)}.zip` };
}
