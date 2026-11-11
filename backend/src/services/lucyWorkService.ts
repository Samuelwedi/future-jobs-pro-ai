import { randomUUID } from 'crypto';
import { lucyBackgroundConfigured, readLucyBackgroundSelection, sameLucyBackgroundSelection, LucyBackgroundSelection } from './lucyBackgroundProvider';
import { pool } from '../config/database';
import { CompanyActor } from '../middleware/companyActor';
import { loadSubscriptionActor, hasCompanyEntitlement } from '../middleware/trialMiddleware';
import { runLucyRecordSearch } from './lucyRecordSearch';
import { runLucyWorkBriefing, parseLucyBriefingOptions, lucyBriefingPrompt, LucyBriefingOptions } from './lucyWorkBriefing';

export type LucyWorkMode = 'ai_research' | 'record_search' | 'work_briefing';
export const lucyRecordSearchEnabled = () => process.env.LUCY_RECORD_SEARCH_ENABLED !== 'false';
export const lucyWorkBriefingEnabled = () => process.env.LUCY_WORK_BRIEFING_ENABLED !== 'false';
export const lucyWorkModes = () => ({ai_research:lucyWorkEnabled(),record_search:lucyRecordSearchEnabled(),work_briefing:lucyWorkBriefingEnabled()});
export type LucyWorkResult = { text: string; run?: unknown };
export type LucyWorkProcessor = (input: {actor: CompanyActor; prompt: string; options?: LucyBriefingOptions; backgroundSelection?: LucyBackgroundSelection; shouldContinue: () => Promise<boolean>}) => Promise<LucyWorkResult>;
let processor: LucyWorkProcessor | undefined;
export const lucyWorkEnabled = () => lucyBackgroundConfigured();
export function configureLucyWorkProcessor(value: LucyWorkProcessor) { processor = value; }
export class LucyWorkError extends Error { constructor(public status: number, message: string) { super(message); } }
export function publicLucyWork(row: any) {
 return { id: row.id, mode: row.mode || 'ai_research', prompt: row.prompt, status: row.status, result: ['completed','partial'].includes(row.status) ? row.result : null,
  ...(row.mode==='work_briefing'?{options:row.options}:{}),
  error: row.error, attempts: row.attempts, createdAt: row.created_at, updatedAt: row.updated_at, completedAt: row.completed_at };
}
/** Also protect direct service calls and retained results, not just the API's outer gate. */
async function ensureWorkAccess(actor: CompanyActor): Promise<void> {
 let current;
 try { current = await loadSubscriptionActor(actor.id,actor.company_id); }
 catch (error) {
  if (/account or company was not found|does not match the current company/.test((error as Error)?.message || '')) throw new LucyWorkError(401,'Not authenticated');
  throw new LucyWorkError(503,'Current access could not be verified');
 }
 if (current.role !== actor.role) throw new LucyWorkError(401,'Your access has changed');
 if (current.mustChangePassword) throw new LucyWorkError(403,'Change your temporary password before continuing');
 if (!hasCompanyEntitlement(current)) throw new LucyWorkError(402,'An active subscription or trial is required');
}
export function parseLucyWorkRequest(body: unknown) {
 if (!body || typeof body !== 'object' || Array.isArray(body)) throw new LucyWorkError(400,'Expected a work request object');
 const {prompt,requestKey,mode,options} = body as Record<string,unknown>;
 const keys=mode==='work_briefing'?['mode','requestKey','options']:['prompt','requestKey','mode'];
 if(Object.keys(body).some(key=>!keys.includes(key)))throw new LucyWorkError(400,mode==='work_briefing'?'Expected mode, requestKey and briefing options only':'Expected prompt, requestKey and optional mode');
 return validateWorkRequest(prompt,requestKey,mode,options);
}
function validateWorkRequest(prompt: unknown, requestKey: unknown, requestedMode: unknown, requestedOptions?:unknown) {
 const mode = requestedMode === undefined ? 'ai_research' : requestedMode;
 if (mode !== 'ai_research' && mode !== 'record_search' && mode !== 'work_briefing') throw new LucyWorkError(400,'Unsupported work mode');
 if (typeof requestKey !== 'string' || !/^[a-zA-Z0-9_.:-]{1,100}$/.test(requestKey)) throw new LucyWorkError(400,'A valid requestKey is required');
 if(mode==='work_briefing') {
  let options:LucyBriefingOptions;
  try{options=parseLucyBriefingOptions(requestedOptions);}catch{throw new LucyWorkError(400,'Choose explicit valid dates covering at most 31 days and a supported task status');}
  const label=lucyBriefingPrompt(options);
  if(prompt!==undefined&&prompt!==label)throw new LucyWorkError(400,'Briefing labels are generated from options');
  return {prompt:label,requestKey,mode,options};
 }
 if(requestedOptions!==undefined)throw new LucyWorkError(400,'Options are supported only for work briefings');
 const limit = mode === 'record_search' ? 200 : 4000;
 if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > limit) throw new LucyWorkError(400,`Prompt must contain 1–${limit} characters`);
 return {prompt:prompt.trim(),requestKey,mode,options:undefined};
}
export async function createLucyWork(actor: CompanyActor, requestedPrompt: unknown, requestedKey: unknown, requestedMode: unknown = 'ai_research', requestedOptions?:unknown) {
 if (stopping) throw new LucyWorkError(503, 'Backend is shutting down. Please retry shortly.');
 const {prompt,requestKey,mode,options} = validateWorkRequest(requestedPrompt,requestedKey,requestedMode,requestedOptions);
 if (mode === 'record_search' && !lucyRecordSearchEnabled()) throw new LucyWorkError(503, 'Record search is disabled');
 if (mode === 'ai_research' && !lucyWorkEnabled()) throw new LucyWorkError(503, 'Background work is disabled');
 if (mode === 'work_briefing' && !lucyWorkBriefingEnabled()) throw new LucyWorkError(503, 'Work briefings are disabled');
 await ensureWorkAccess(actor);
 const client = await pool.connect();
 try {
  await client.query('BEGIN');
  // Serialize submissions per actor, including count checks and duplicate retries.
  const user = await client.query('SELECT id FROM users WHERE id=$1 AND company_id=$2 AND LOWER(role)=$3 AND COALESCE(is_active,TRUE)=TRUE FOR UPDATE', [actor.id, actor.company_id, actor.role]);
  if (!user.rows.length) throw new LucyWorkError(401, 'Not authenticated');
  const prior = await client.query('SELECT * FROM lucy_background_work WHERE company_id=$1 AND user_id=$2 AND request_key=$3', [actor.company_id, actor.id, requestKey]);
  if (prior.rows[0]) {
   if (prior.rows[0].actor_role !== actor.role) throw new LucyWorkError(409, 'requestKey belongs to a previous authorization context');
   if (prior.rows[0].mode !== mode) throw new LucyWorkError(409,'requestKey already used for a different mode');
   if (prior.rows[0].prompt !== prompt.trim()) throw new LucyWorkError(409, 'requestKey already used for a different prompt');
   if (mode==='work_briefing') {
    let same=false;
    try{same=JSON.stringify(parseLucyBriefingOptions(prior.rows[0].options))===JSON.stringify(options);}catch{}
    if(!same)throw new LucyWorkError(409,'requestKey already used for different briefing options');
   }
   await client.query('COMMIT'); return {job: publicLucyWork(prior.rows[0]), replayed: true};
  }
  const counts = await client.query(`SELECT count(*) FILTER (WHERE status IN ('queued','running')) AS active,
   count(*) FILTER (WHERE created_at > now()-interval '24 hours') AS daily FROM lucy_background_work WHERE company_id=$1 AND user_id=$2`, [actor.company_id, actor.id]);
  if (Number(counts.rows[0].active) >= 10 || Number(counts.rows[0].daily) >= 50) throw new LucyWorkError(429, 'Background work limit reached');
  if (stopping) throw new LucyWorkError(503, 'Backend is shutting down. Please retry shortly.');
  const inserted = await client.query(`INSERT INTO lucy_background_work(id,company_id,user_id,actor_role,prompt,request_key,mode,options) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING *`, [randomUUID(),actor.company_id,actor.id,actor.role,prompt.trim(),requestKey,mode,JSON.stringify(options||{})]);
  if (stopping) throw new LucyWorkError(503, 'Backend is shutting down. Please retry shortly.');
  await client.query('COMMIT'); return {job: publicLucyWork(inserted.rows[0]), replayed: false};
 } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
export async function listLucyWork(actor: CompanyActor) {
 await ensureWorkAccess(actor);
 const result = await pool.query('SELECT * FROM lucy_background_work WHERE company_id=$1 AND user_id=$2 AND actor_role=$3 ORDER BY created_at DESC,id DESC LIMIT 50', [actor.company_id,actor.id,actor.role]);
 return result.rows.map(publicLucyWork);
}
export async function getLucyWork(actor: CompanyActor, id: string, cancel = false) {
 await ensureWorkAccess(actor);
 if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new LucyWorkError(404, 'Work not found');
 if (cancel) await pool.query(`UPDATE lucy_background_work SET status='cancelled',result=NULL,error=NULL,lease_token=NULL,lease_until=NULL,updated_at=now(),completed_at=now() WHERE id=$1 AND company_id=$2 AND user_id=$3 AND actor_role=$4 AND status IN ('queued','running')`, [id,actor.company_id,actor.id,actor.role]);
 const result = await pool.query('SELECT * FROM lucy_background_work WHERE id=$1 AND company_id=$2 AND user_id=$3 AND actor_role=$4',[id,actor.company_id,actor.id,actor.role]);
 if (!result.rows[0]) throw new LucyWorkError(404, 'Work not found');
 return publicLucyWork(result.rows[0]);
}
const validActor = `EXISTS (SELECT 1 FROM users u WHERE u.id=w.user_id AND u.company_id=w.company_id AND LOWER(u.role)=w.actor_role AND COALESCE(u.is_active,TRUE)=TRUE)`;
let busy = false;
const activeExecutions = new Set<Promise<unknown>>();
const activeRuns = new Set<Promise<boolean>>();
let stopping = false;
let draining: Promise<void> | undefined;
/** One bounded local slot; SQL leases fence other processes and restart recovery. */
export function runLucyWorkOnce(): Promise<boolean> {
 const run = executeLucyWorkOnce();
 activeRuns.add(run);
 void run.then(() => activeRuns.delete(run), () => activeRuns.delete(run));
 return run;
}
async function executeLucyWorkOnce(): Promise<boolean> {
 if (stopping || busy || activeExecutions.size > 0) return false;
 busy = true;
 try {
  const backgroundSelection = readLucyBackgroundSelection();
  const allowAI = lucyWorkEnabled() && Boolean(backgroundSelection) && Boolean(processor), allowRecords = lucyRecordSearchEnabled(), allowBriefing=lucyWorkBriefingEnabled();
  if (!allowAI && !allowRecords && !allowBriefing) return false;
  await pool.query(`UPDATE lucy_background_work w SET status='failed',error='Actor unavailable or retry limit reached',result=NULL,lease_token=NULL,lease_until=NULL,updated_at=now(),completed_at=now()
   WHERE ((w.mode='record_search' AND $1::boolean) OR (w.mode='ai_research' AND $2::boolean) OR (w.mode='work_briefing' AND $3::boolean)) AND status IN ('queued','running') AND (NOT ${validActor} OR (status='running' AND lease_until<=now() AND attempts>=3))`,[allowRecords,allowAI,allowBriefing]);
  if (stopping) return false;
  const token = randomUUID();
  const claimed = await pool.query(`WITH candidate AS (
   SELECT w.id FROM lucy_background_work w WHERE ((w.mode='record_search' AND $2::boolean) OR (w.mode='ai_research' AND $3::boolean) OR (w.mode='work_briefing' AND $4::boolean)) AND (status='queued' OR (status='running' AND lease_until<=now())) AND attempts<3 AND ${validActor}
   ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
   UPDATE lucy_background_work w SET status='running',attempts=attempts+1,lease_token=$1,lease_until=now()+interval '120 seconds',updated_at=now()
   FROM candidate WHERE w.id=candidate.id RETURNING w.*`,[token,allowRecords,allowAI,allowBriefing]);
  const job = claimed.rows[0]; if (!job) return false;
  const actor: CompanyActor = {id:job.user_id,company_id:job.company_id,role:job.actor_role};
  let finished = false;
  const modeEnabled=()=>job.mode==='ai_research'?Boolean(backgroundSelection && sameLucyBackgroundSelection(backgroundSelection)):job.mode==='record_search'?lucyRecordSearchEnabled():job.mode==='work_briefing'?lucyWorkBriefingEnabled():false;
  const shouldContinue = async () => {
   if (stopping || finished || !modeEnabled()) return false;
   const r = await pool.query(`SELECT id FROM lucy_background_work w WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_until>now() AND ${validActor}`,[job.id,token]);
   if (r.rows.length !== 1) return false;
   try { await ensureWorkAccess(actor); } catch { return false; }
   // Shutdown or a mode kill switch may change during either asynchronous access check.
   return !stopping && !finished && modeEnabled();
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
   if (!(await shouldContinue()) || stopping || !modeEnabled()) throw new Error('Work no longer authorized');
   // A timed-out provider may still be in flight. Keep the execution slot occupied
   // until it settles; never accumulate overlapping inference calls.
   const execute = job.mode === 'record_search' ? runLucyRecordSearch : job.mode === 'work_briefing' ? runLucyWorkBriefing : job.mode === 'ai_research' ? processor : undefined;
   if (!execute) throw new Error('Unavailable work mode');
   const execution = Promise.resolve().then(() => {
    if (stopping || !modeEnabled()) throw new Error('Worker stopped or provider changed');
    return execute({actor,prompt:job.prompt,...(job.mode==='ai_research'?{backgroundSelection}:{}),...(job.mode==='work_briefing'?{options:job.options}:{}),shouldContinue});
   }).finally(() => { activeExecutions.delete(execution); });
   activeExecutions.add(execution);
   const output = await Promise.race([execution,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Deadline exceeded')),90000);})]);
   if (!output || typeof output.text !== 'string') throw new Error('Invalid result');
   const serialized = JSON.stringify(output);
   if (Buffer.byteLength(serialized)>128000) throw new Error('Result too large');
   if (!(await shouldContinue()) || stopping || !modeEnabled()) throw new Error('Work no longer authorized');
   await pool.query(`UPDATE lucy_background_work w SET status=$4,result=$3::jsonb,error=NULL,lease_token=NULL,lease_until=NULL,updated_at=now(),completed_at=now() WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_until>now() AND ${validActor}`,[job.id,token,serialized,(output.run as any)?.status === 'partial' ? 'partial' : 'completed']);
  } catch {
   // Shutdown interrupts read-only work, not its durable intent. Leave the
   // original lease in place for bounded expiry recovery on another process;
   // never release it while an old provider may still be in flight.
   // Never store provider error strings (which may contain credentials or private context).
   if (!stopping) await pool.query(`UPDATE lucy_background_work SET status='failed',error='Work could not complete safely. Submit a new request to retry.',result=NULL,lease_token=NULL,lease_until=NULL,updated_at=now(),completed_at=now() WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_until>now()`,[job.id,token]);
  } finally { finished = true; if (timer) clearTimeout(timer); }
  return true;
 } finally { busy = false; }
}
let timer: ReturnType<typeof setInterval> | undefined;
let pending: Promise<unknown> | undefined;
export function startLucyWorkWorker(): void {
 if (timer || draining) return;
 stopping = false;
 const tick = () => { if (!pending) pending = runLucyWorkOnce().catch(()=>undefined).finally(()=>{pending=undefined;}); };
 timer=setInterval(tick,2000); timer.unref(); tick();
}
/** Drains even a processor that outlived its deadline. Its provider must have a timeout. */
export function stopLucyWorkWorker(): Promise<void> {
 if (draining) return draining;
 stopping = true;
 if (timer) clearInterval(timer); timer=undefined;
 draining = (async () => {
  await Promise.allSettled([...activeRuns]);
  await Promise.allSettled([...activeExecutions]);
  await pending;
 })().finally(() => { draining=undefined; });
 return draining;
}
