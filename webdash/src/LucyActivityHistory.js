import React, {useState} from 'react';
const workflowUrl = value => /^https:\/\/github\.com\/Samuelwedi\/future-jobs-pro-ai\/actions\/runs\/\d+$/.test(value || '') ? value : null;
const time = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Not recorded';
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key)?object[key]:undefined;
const repairStates = {queued:'Queued',dispatching:'Dispatch outcome pending',running:'Workflow running',deployed:'Deployment recorded; verify affected workflow',awaiting_store:'Native source prepared; store publication not verified',failed:'Repair failed',blocked:'Repair blocked',cancelled:'Cancelled before dispatch'};
const reviewStates = {queued:'Queued',running:'Investigating',review:'Recommendation ready',accepted:'Report accepted; no external action implied',dismissed:'Report dismissed',failed:'Review failed',cancelled:'Cancelled'};
export function activityRecords(data) {
 const items=[];
 for(const job of data.jobs||[]) items.push({id:`review:${job.id}`,category:'diagnosis',title:`${job.department==='it'?'IT diagnosis':job.department==='support'?'Support review':'Lucy operations review'}`,outcome:own(reviewStates,job.status)||'Unknown state',requested:job.created_at,started:job.started_at,finished:job.completed_at,sort:job.completed_at||job.started_at||job.created_at,receipt:job.id});
 for(const job of data.repairs||[]) items.push({id:`repair:${job.id}`,category:'repair',title:'Code repair',outcome:own(repairStates,job.status)||'Unknown state',requested:job.created_at,finished:job.completed_at,sort:job.completed_at||job.created_at,receipt:job.id,url:workflowUrl(job.workflow_url),commit:/^[0-9a-f]{40}$/i.test(job.base_sha||'')?job.base_sha:null});
 const labels={queued:'Review requested',accepted:'Report accepted',dismissed:'Report dismissed',cancelled:'Queued review cancelled',repair_requested:'Repair requested',repair_cancelled:'Queued repair cancelled',schedule:'Review schedule changed',lead_created:'Sales lead created',lead_stage:'Sales lead stage changed'};
 for(const event of data.audit||[]) {const type=String(event.action||'').split(':')[0];if(own(labels,type))items.push({id:`audit:${event.id}`,category:'audit',title:own(labels,type),outcome:'Audit event recorded',requested:event.created_at,sort:event.created_at,receipt:String(event.id)});}
 return items.filter(item=>Number.isFinite(Date.parse(item.sort))).sort((a,b)=>Date.parse(b.sort)-Date.parse(a.sort)||a.id.localeCompare(b.id)).slice(0,100);
}
export default function LucyActivityHistory({data}) {
 const [filter,setFilter]=useState('all');const records=activityRecords(data);const visible=records.filter(item=>filter==='all'||item.category===filter);
 return <section id="lucy-activity-history" aria-labelledby="lucy-history-heading" className="ops-card"><h2 id="lucy-history-heading">Lucy activity history</h2>
 <p>Your platform-owner diagnoses, repairs and audit events. Current outcomes come from stored records, not Lucy's narration. Customer actions remain private to their authorized company accounts.</p>
 <label>Activity <select value={filter} onChange={event=>setFilter(event.target.value)}><option value="all">All recorded activity</option><option value="diagnosis">Diagnoses and reviews</option><option value="repair">Fixes, tests and releases</option><option value="audit">Audit events</option></select></label>
 <p>Up to 100 recent records. Times use your device timezone. Checks, build and deployment evidence is available in each linked workflow. A successful workflow alone does not prove app-store submission or publication; no store outcome is inferred here.</p>
 {!visible.length&&<p>No matching activity is recorded in the received history.</p>}
 <ol>{visible.map(item=><li key={item.id} className="ops-card"><strong>{item.title} · {item.outcome}</strong><p>Requested or recorded: {time(item.requested)}{item.started?` · Started: ${time(item.started)}`:''}{item.finished?` · Finished: ${time(item.finished)}`:''}</p><small>Receipt: {item.receipt}{item.commit?` · Source commit: ${item.commit}`:''}</small>{item.url&&<p><a href={item.url} target="_blank" rel="noreferrer">Inspect workflow checks and release evidence</a></p>}</li>)}</ol>
 </section>;
}
