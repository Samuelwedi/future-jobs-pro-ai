import { pool } from '../config/database';
import { createPeriodicWorker } from '../utils/periodicWorker';
const repository = 'Samuelwedi/future-jobs-pro-ai';
const branch = 'fix/tester-release-20261022';
const workflow = 'lucy-repair.yml';
// A run title alone is not proof that the authorized workflow checked this source.
export function matchesRepairRun(job: any, run: any): boolean {
 return !!run && /^[1-9][0-9]*$/.test(String(run.id))
  && run.display_title === `Lucy repair ${job.id}`
  && run.event === 'workflow_dispatch' && run.path === `.github/workflows/${workflow}`
  && run.head_branch === branch && run.head_sha === job.base_sha
  && run.repository?.full_name === repository
  && (!job.workflow_run_id || String(run.id) === String(job.workflow_run_id));
}
const uncertainDispatch = 'Workflow dispatch is unconfirmed. New repairs for this incident remain locked to avoid duplicate paid work. Check GitHub workflow access and history; do not retry the dispatch blindly.';
const githubToken = () => process.env.LUCY_GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
export function repairEnabled() { return process.env.LUCY_REPAIR_ENABLED === 'true' && !!githubToken(); }
export function repairScope(component: string, summary: string): string | null {
  if(component === 'mobile-ui' && /AudioRecorder|shared object|native.*audio/i.test(summary)) return 'mobile-audio';
  if(['support-portal','webdash'].includes(component)) return 'portal-app';
  if(/^(mobile|android|ios)/i.test(component)) return 'mobile';
  if(/^(web|frontend|customer)/i.test(component)) return 'customer-web';
  if(/^(portal|support)/i.test(component)) return 'portal-app';
  if(/^(backend|api|runtime|database|server|worker)/i.test(component)) return 'backend';
  return 'application';
}
export function repairFeature(component:string,summary:string) {
 const text=component+' '+summary;
 const categories:[string,RegExp][]=[['audio',/audio|record|voice/i],['payroll',/payroll|paystub|overtime|wage|tax/i],['billing',/bill|payment|stripe|subscription|payout/i],['authentication',/auth|login|permission|tenant/i],['integrations',/quickbook|integration|oauth/i],['scheduling',/schedul|shift|calendar/i],['time-tracking',/timesheet|clock|time.entry/i],['gps',/gps|location|tracking|map/i],['chat-media',/chat|message|media|upload|attachment/i],['invoices',/invoice|estimate/i],['support',/support|ticket/i],['runtime',/database|runtime|memory|server/i]];
 return categories.find(([,pattern])=>pattern.test(text))?.[0] || 'general';
}
async function github(path: string, method = 'GET', body?: unknown): Promise<any> {
 const response=await fetch(`https://api.github.com/repos/${repository}/${path}`,{
  method,headers:{Authorization:`Bearer ${githubToken()}`,Accept:'application/vnd.github+json','Content-Type':'application/json'},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000),
 });
 if(!response.ok)throw new Error(`GitHub HTTP ${response.status}`);
 return response.status===204?null:response.json();
}
// A bounded circular scan keeps uncertain dispatches locked without allowing
// them (or a failing GitHub read) to monopolize every later worker tick.
// This is scheduling state only, never dispatch/approval state. A restart
// restarts the scan; durable job status still prevents duplicate dispatch.
let repairScanCursor: {time:string;id:string}|null = null;
export async function runOwnerRepairTick() {
 if(!repairEnabled())return;
 const db=await pool.connect(); let locked=false;
 try {
  locked=Boolean((await db.query('SELECT pg_try_advisory_lock(7241026) AS locked')).rows[0].locked);
  if(!locked)return;
  const jobs=await db.query(`SELECT j.*,j.created_at::text AS repair_cursor_time,a.is_active,a.role FROM owner_repair_jobs j JOIN platform_support_agents a ON a.id=j.owner_id
   WHERE j.status IN ('queued','dispatching','running')
   ORDER BY CASE WHEN $1::timestamptz IS NULL OR (j.created_at,j.id)>($1::timestamptz,$2::uuid) THEN 0 ELSE 1 END,j.created_at,j.id LIMIT 10`,[repairScanCursor?.time??null,repairScanCursor?.id??null]);
  for(const job of jobs.rows) {
   repairScanCursor={time:job.repair_cursor_time,id:job.id};
   if(job.status==='queued') {
    if(!job.is_active||job.role!=='owner') {await db.query("UPDATE owner_repair_jobs SET status='blocked',error='Owner account is no longer eligible',completed_at=now() WHERE id=$1 AND status='queued'",[job.id]);continue;}
    const head=await github(`git/ref/heads/${branch}`);
    if(!/^[a-f0-9]{40}$/.test(head.object?.sha||''))throw new Error('Invalid branch head');
    // Record dispatch intent first. A timeout is reconciled, never blindly retried.
    const claimed=await db.query("UPDATE owner_repair_jobs SET status='dispatching',base_sha=$2,dispatch_started_at=now(),error=NULL WHERE id=$1 AND status='queued' RETURNING id",[job.id,head.object.sha]);
    if(!claimed.rowCount)continue; // Cancellation won the race before dispatch.
    try {
     await github(`actions/workflows/${workflow}/dispatches`,'POST',{ref:branch,inputs:{request_id:job.id,base_sha:head.object.sha,scope:job.scope,feature:job.feature||'general'}});
    } catch { /* The provider may have accepted it. Reconcile by run name. */ }
   } else {
    const result=job.workflow_run_id?await github(`actions/runs/${job.workflow_run_id}`):null;
    const candidates=result?[result]:((await github(`actions/workflows/${workflow}/runs?event=workflow_dispatch&branch=${encodeURIComponent(branch)}&per_page=100`)).workflow_runs || []).filter((r:any)=>r.display_title===`Lucy repair ${job.id}`);
    const run=candidates.length===1 && matchesRepairRun(job,candidates[0])?candidates[0]:null;
    if(!run) {
     // Absence from the first page, a timeout, a duplicate title, or identity
     // mismatch cannot prove that GitHub did not execute the paid repair.
     if(candidates.length || Date.now()-new Date(job.dispatch_started_at || job.created_at).getTime()>10*60*1000)
      await db.query('UPDATE owner_repair_jobs SET error=$2 WHERE id=$1',[job.id,uncertainDispatch]);
     continue;
    }
    const complete=run.status==='completed';
    let status=complete?'failed':'running';
    let error:string|null=complete?'Repair did not pass all checks. Review the workflow; no resolution has been recorded.':null;
    if(complete && run.conclusion!=='success') {
     const result=await github(`actions/runs/${run.id}/jobs?per_page=100`);
     const failed=(Array.isArray(result.jobs)?result.jobs:[]).find((j:any)=>j.conclusion==='failure');
     const reasons:Record<string,string>={admission:'Repair admission rejected an unverified repository, release ref or source commit. No model work or publication occurred.',connections:'OpenAI or deployment connection checks failed. Open the workflow to check credentials and live commit alignment. No repair was generated.',propose:'GPT repair generation or proposal screening failed. Open the workflow for the failed step. No code was deployed.',verify:'The generated repair failed build or regression checks. No code was deployed.',deploy:'Publication or deployment failed. Check the workflow for deployment and rollback status.'};
     if(failed && reasons[failed.name])error=reasons[failed.name];
    }
    if(complete && run.conclusion==='success') {
     // A successful workflow can be a deliberate no-op. Require the actual
     // publication job to succeed before claiming a deployment or native patch.
     const result=await github(`actions/runs/${run.id}/jobs?per_page=100`);
     const jobs=Array.isArray(result.jobs)?result.jobs:[];
     if(jobs.some((j:any)=>j.name==='review-required' && j.conclusion==='success')) {
      status='blocked';error='Owner approval required: a tested repair candidate is ready. Open the workflow for the candidate branch and review its exact changes before production. No deployment occurred.';
     } else if(jobs.some((j:any)=>j.name==='deploy' && j.conclusion==='success')) {
      status=['mobile-audio','mobile'].includes(job.scope)?'awaiting_store':'deployed';error=null;
     } else {
      status='blocked';
      error=jobs.some((j:any)=>j.name==='no-repair' && j.conclusion==='success')
       ?'No safe additional repair found. No code was published or deployed. The incident remains open; inspect the affected build and reproduce it on a device.'
       :'No successful publication job was verified. Review the workflow before retrying.';
     }
    }
    const url=`https://github.com/${repository}/actions/runs/${run.id}`;
    await db.query('UPDATE owner_repair_jobs SET status=$2,workflow_run_id=$3,workflow_url=$4,error=$5,completed_at=CASE WHEN $6 THEN now() ELSE NULL END WHERE id=$1',
     [job.id,status,String(run.id),url,error,complete]);
   }
  }
 } finally {
  let broken:Error|undefined;
  if(locked)await db.query('SELECT pg_advisory_unlock(7241026)').catch(()=>{broken=new Error('Unlock failed');});
  db.release(broken);
 }
}
export function startOwnerRepairWorker() {
 if(!repairEnabled())return;
 repairWorker.start(30000);
}
const repairWorker = createPeriodicWorker(runOwnerRepairTick, () => console.error('Lucy repair worker unavailable'));
export const stopOwnerRepairWorker = () => repairWorker.stop();
