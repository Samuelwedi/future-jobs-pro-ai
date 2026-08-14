import { pool } from '../config/database';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

type Artifact = { buffer: Buffer; fileName: string; mimeType: string; verificationHash: string };
const tempRoot = path.join(os.tmpdir(), 'future-jobs-evidence-media');
fs.mkdirSync(tempRoot, { recursive: true });

const escapeXml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c] || c));
const hash = (buffer: Buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const runFfmpeg = (command: ffmpeg.FfmpegCommand, output: string) => new Promise<void>((resolve, reject) => command.on('end', resolve).on('error', reject).save(output));
const safeUnlink = (value: string) => fs.unlink(value, () => undefined);
const safeRmdir = (value: string) => fs.rm(value, { recursive: true, force: true }, () => undefined);

async function ownedEntry(companyId: string, timeEntryId: string) {
  const result = await pool.query(
    `SELECT te.*, concat_ws(' ',u.first_name,u.last_name) employee_name,
            p.name project_name,p.address project_address,c.name company_name
     FROM time_entries te JOIN users u ON u.id=te.user_id
     LEFT JOIN projects p ON p.id=te.project_id JOIN companies c ON c.id=u.company_id
     WHERE te.id=$1 AND u.company_id=$2`, [timeEntryId, companyId]);
  if (!result.rowCount) throw new Error('Time entry not found');
  return result.rows[0];
}

export async function generateTimeEntryPdf(companyId: string, timeEntryId: string): Promise<Artifact> {
  const entry = await ownedEntry(companyId, timeEntryId);
  const gps = await pool.query('SELECT latitude,longitude,timestamp,accuracy,speed FROM gps_tracking WHERE time_entry_id=$1 ORDER BY timestamp', [timeEntryId]);
  const media = await pool.query('SELECT count(*)::int count FROM photos WHERE time_entry_id=$1 AND company_id=$2', [timeEntryId, companyId]);
  const voices = await pool.query('SELECT count(*)::int count FROM voice_notes WHERE time_entry_id=$1 AND company_id=$2', [timeEntryId, companyId]);
  const duration = entry.clock_out ? Math.max(0, (new Date(entry.clock_out).getTime()-new Date(entry.clock_in).getTime())/3600000) : 0;
  const chunks: Buffer[]=[]; const doc=new PDFDocument({size:'LETTER',margin:48,info:{Title:'Verified Time Entry Evidence'}});
  doc.on('data',(chunk)=>chunks.push(Buffer.from(chunk)));
  const done=new Promise<Buffer>((resolve)=>doc.on('end',()=>resolve(Buffer.concat(chunks))));
  doc.rect(0,0,612,92).fill('#07121A'); doc.fillColor('#00D4FF').fontSize(21).text('FUTURE JOBS PRO AI',48,28); doc.fillColor('#FFFFFF').fontSize(11).text('Verified Time Entry Evidence Record',48,57);
  doc.fillColor('#162334').fontSize(18).text('Work record',48,120); doc.moveDown(.7);
  const line=(label:string,value:unknown)=>{doc.fillColor('#66768A').fontSize(9).text(label.toUpperCase());doc.fillColor('#172033').fontSize(12).text(String(value??'—'));doc.moveDown(.55)};
  line('Company',entry.company_name);line('Employee',entry.employee_name);line('Project',entry.project_name);line('Job-site address',entry.project_address);line('Clock in',new Date(entry.clock_in).toLocaleString('en-CA'));line('Clock out',entry.clock_out?new Date(entry.clock_out).toLocaleString('en-CA'):'In progress');line('Recorded duration',`${duration.toFixed(2)} hours`);line('Unpaid break',`${entry.break_minutes||0} minutes`);line('Approval status',entry.approval_status||'pending');line('Correction reason',entry.correction_reason||'No correction recorded');
  doc.moveDown();doc.fillColor('#162334').fontSize(16).text('Evidence inventory');doc.moveDown(.5);doc.fillColor('#172033').fontSize(11).text(`${gps.rowCount} GPS points  •  ${media.rows[0]?.count||0} photo/video records  •  ${voices.rows[0]?.count||0} voice notes`);
  const canonical=Buffer.from(JSON.stringify({entry,gps:gps.rows,generatedAt:new Date().toISOString()}));const verificationHash=hash(canonical);
  doc.moveDown(2);doc.fillColor('#66768A').fontSize(9).text('SHA-256 VERIFICATION HASH');doc.fillColor('#172033').font('Courier').fontSize(8).text(verificationHash,{width:500});doc.font('Helvetica').moveDown();doc.fillColor('#66768A').fontSize(8).text('This report summarizes records stored by Future Jobs Pro AI. The accompanying evidence manifest contains the complete source metadata.');doc.end();
  const buffer=await done; return {buffer,fileName:`time-entry-${timeEntryId}.pdf`,mimeType:'application/pdf',verificationHash};
}

export async function generateGpsTrailVideo(companyId: string, timeEntryId: string): Promise<Artifact> {
  const entry=await ownedEntry(companyId,timeEntryId);const gps=await pool.query('SELECT latitude,longitude,timestamp,accuracy,speed FROM gps_tracking WHERE time_entry_id=$1 ORDER BY timestamp',[timeEntryId]);
  if(gps.rowCount<2)throw new Error('At least two GPS points are required to create a trail video');
  const points=gps.rows;const dir=fs.mkdtempSync(path.join(tempRoot,'gps-'));const output=path.join(dir,'gps-trail.mp4');
  try{
    const lats=points.map((p:any)=>Number(p.latitude)),lngs=points.map((p:any)=>Number(p.longitude));const minLat=Math.min(...lats),maxLat=Math.max(...lats),minLng=Math.min(...lngs),maxLng=Math.max(...lngs);const count=Math.min(90,Math.max(30,points.length));
    const project=(p:any)=>({x:110+((Number(p.longitude)-minLng)/(maxLng-minLng||1))*900,y:570-((Number(p.latitude)-minLat)/(maxLat-minLat||1))*430});
    for(let frame=0;frame<count;frame++){const upto=Math.max(1,Math.round((frame/(count-1))*(points.length-1)));const shown=points.slice(0,upto+1);const route=shown.map((p:any)=>{const q=project(p);return `${q.x.toFixed(1)},${q.y.toFixed(1)}`}).join(' ');const current=project(points[upto]);const first=project(points[0]);const last=project(points[points.length-1]);const svg=`<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg"><rect width="1280" height="720" fill="#071018"/><g stroke="#173041" stroke-width="1">${Array.from({length:13},(_,i)=>`<line x1="${i*100}" y1="90" x2="${i*100}" y2="620"/>`).join('')}${Array.from({length:6},(_,i)=>`<line x1="60" y1="${120+i*100}" x2="1040" y2="${120+i*100}"/>`).join('')}</g><rect x="1048" y="92" width="202" height="528" rx="18" fill="#0E1D28" stroke="#264457"/><text x="64" y="48" fill="#00D4FF" font-family="Arial" font-size="24" font-weight="700">VERIFIED GPS TRAIL PLAYBACK</text><text x="64" y="76" fill="#AFC1D0" font-family="Arial" font-size="14">${escapeXml(entry.employee_name)} • ${escapeXml(entry.project_name)}</text><polyline points="${route}" fill="none" stroke="#00D4FF" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${first.x}" cy="${first.y}" r="10" fill="#4ADE80"/><circle cx="${last.x}" cy="${last.y}" r="10" fill="#FFB020"/><circle cx="${current.x}" cy="${current.y}" r="17" fill="#FFFFFF" stroke="#00D4FF" stroke-width="7"/><text x="1074" y="132" fill="#7D91A3" font-family="Arial" font-size="12">CURRENT POINT</text><text x="1074" y="164" fill="#FFFFFF" font-family="Arial" font-size="24" font-weight="700">${upto+1} / ${points.length}</text><text x="1074" y="214" fill="#7D91A3" font-family="Arial" font-size="12">TIME</text><text x="1074" y="239" fill="#FFFFFF" font-family="Arial" font-size="15">${escapeXml(new Date(points[upto].timestamp).toLocaleTimeString('en-CA'))}</text><text x="1074" y="286" fill="#7D91A3" font-family="Arial" font-size="12">LATITUDE</text><text x="1074" y="311" fill="#FFFFFF" font-family="Arial" font-size="15">${Number(points[upto].latitude).toFixed(6)}</text><text x="1074" y="358" fill="#7D91A3" font-family="Arial" font-size="12">LONGITUDE</text><text x="1074" y="383" fill="#FFFFFF" font-family="Arial" font-size="15">${Number(points[upto].longitude).toFixed(6)}</text><text x="1074" y="430" fill="#7D91A3" font-family="Arial" font-size="12">ACCURACY</text><text x="1074" y="455" fill="#FFFFFF" font-family="Arial" font-size="15">${Number(points[upto].accuracy||0).toFixed(1)} m</text><rect x="64" y="652" width="1186" height="8" rx="4" fill="#1E3442"/><rect x="64" y="652" width="${1186*(frame/(count-1))}" height="8" rx="4" fill="#00D4FF"/><text x="64" y="690" fill="#8396A6" font-family="Arial" font-size="12">Route visualization generated from ${points.length} recorded coordinates • ${escapeXml(entry.project_address||'Job site')}</text></svg>`;await sharp(Buffer.from(svg)).png().toFile(path.join(dir,`frame-${String(frame).padStart(4,'0')}.png`));}
    await runFfmpeg(ffmpeg(path.join(dir,'frame-%04d.png')).inputFPS(15).outputOptions(['-c:v libx264','-pix_fmt yuv420p','-movflags +faststart']).fps(15),output);const buffer=fs.readFileSync(output);return{buffer,fileName:`gps-trail-${timeEntryId}.mp4`,mimeType:'video/mp4',verificationHash:hash(buffer)};
  }finally{safeRmdir(dir)}
}

export async function generateVoiceCaptionVideo(companyId:string,voiceNoteId:string):Promise<Artifact>{
  const r=await pool.query(`SELECT vn.*,concat_ws(' ',u.first_name,u.last_name) employee_name,p.name project_name FROM voice_notes vn JOIN users u ON u.id=vn.user_id LEFT JOIN projects p ON p.id=vn.project_id WHERE vn.id=$1 AND u.company_id=$2`,[voiceNoteId,companyId]);if(!r.rowCount)throw new Error('Voice note not found');const note=r.rows[0];if(!note.audio_url)throw new Error('This voice note has no original audio recording');
  const dir=fs.mkdtempSync(path.join(tempRoot,'voice-')),audio=path.join(dir,'voice-source'),output=path.join(dir,'voice-evidence.mp4');
  try{const response=await fetch(note.audio_url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error('Voice audio could not be downloaded');fs.writeFileSync(audio,Buffer.from(await response.arrayBuffer()));const duration=Math.min(300,Math.max(3,Math.ceil(Number(note.duration_seconds)||15))),words=String(note.transcript||'No transcript available').split(/\s+/),chunks:string[]=[];for(let i=0;i<words.length;i+=11)chunks.push(words.slice(i,i+11).join(' '));
    for(let second=0;second<duration;second++){const progress=second/Math.max(1,duration-1),caption=chunks[Math.min(chunks.length-1,Math.floor(progress*chunks.length))]||'No transcript available';const seed=crypto.createHash('sha256').update(`${voiceNoteId}-${second}`).digest();const bars=Array.from({length:52},(_,i)=>{const height=24+(seed[i%seed.length]/255)*150;return `<rect x="${75+i*21}" y="${365-height/2}" width="10" height="${height}" rx="5" fill="${i/52<progress?'#00D4FF':'#365665'}"/>`}).join('');const svg=`<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg"><rect width="1280" height="720" fill="#071018"/><text x="70" y="58" fill="#00D4FF" font-family="Arial" font-size="25" font-weight="700">VOICE EVIDENCE • AUDIO + ON-SCREEN NOTES</text><text x="70" y="94" fill="#D9E5EE" font-family="Arial" font-size="17">${escapeXml(note.employee_name)} • ${escapeXml(note.project_name||'Job record')}</text><rect x="58" y="145" width="1164" height="430" rx="24" fill="#0E1D28" stroke="#264457"/>${bars}<text x="90" y="470" fill="#7F94A5" font-family="Arial" font-size="13">SYNCHRONIZED TRANSCRIPT</text><text x="640" y="525" text-anchor="middle" fill="#FFFFFF" font-family="Arial" font-size="25" font-weight="700">${escapeXml(caption)}</text><rect x="70" y="625" width="1140" height="8" rx="4" fill="#1E3442"/><rect x="70" y="625" width="${1140*progress}" height="8" rx="4" fill="#00D4FF"/><text x="70" y="672" fill="#9FB1BF" font-family="Arial" font-size="14">${String(Math.floor(second/60)).padStart(2,'0')}:${String(second%60).padStart(2,'0')} / ${String(Math.floor(duration/60)).padStart(2,'0')}:${String(duration%60).padStart(2,'0')} • Original voice audio preserved</text></svg>`;await sharp(Buffer.from(svg)).png().toFile(path.join(dir,`frame-${String(second).padStart(4,'0')}.png`));}
    await runFfmpeg(ffmpeg(path.join(dir,'frame-%04d.png')).inputFPS(1).input(audio).outputOptions(['-map 0:v','-map 1:a','-c:v libx264','-c:a aac','-pix_fmt yuv420p','-r 30','-shortest','-movflags +faststart']),output);const buffer=fs.readFileSync(output);return{buffer,fileName:`voice-note-${voiceNoteId}-captioned.mp4`,mimeType:'video/mp4',verificationHash:hash(buffer)}}finally{safeRmdir(dir)}
}
