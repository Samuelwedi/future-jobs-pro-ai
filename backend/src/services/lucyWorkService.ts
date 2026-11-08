import { randomUUID } from 'crypto';
import { pool } from '../config/database';
import { CompanyActor } from '../middleware/companyActor';

export type LucyWorkResult = { text: string; run?: unknown };
export type LucyWorkProcessor = (input: {actor: CompanyActor; prompt: string; shouldContinue: () => Promise<boolean>}) => Promise<LucyWorkResult>;
let processor: LucyWorkProcessor | undefined;
export const lucyWorkEnabled = () => process.env.LUCY_BACKGROUND_WORK_ENABLED === 'true';
export function configureLucyWorkProcessor(value: LucyWorkProcessor) { processor = value; }
export class LucyWorkError extends Error { constructor(public status: number, message: string) { super(message); } }
export function publicLucyWork(row: any) {
 return { id: row.id, prompt: row.prompt, status: row.status, result: ['completed','partial'].includes(row.status) ? row.result : null,
  error: row.error, attempts: row.attempts, createdAt: row.created_at, updatedAt: row.updated_at, completedAt: row.completed_at };
}
export async function createLucyWork(actor: CompanyActor, prompt: unknown, requestKey: unknown) {
 if (!lucyWorkEnabled()) throw new LucyWorkError(503, 'Background work is disabled');
 if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 4000) throw new LucyWorkError(400, 'Prompt must contain 1–4000 characters');
 if (typeof requestKey !== 'string' || !/^[a-zA-Z0-9_.:-]{1,100}$/.test(requestKey)) throw new LucyWorkError(400, 'A valid requestKey is required');
 const client = await pool.connect();
 try {
  await client.query('BEGIN');
  // Serialize submissions per actor, including count checks and duplicate retries.
  const user = await client.query('SELECT id FROM users WHERE id=$1 AND company_id=$2 AND LOWER(role)=$3 AND COALESCE(is_active,TRUE)=TRUE FOR UPDATE', [actor.id, actor.company_id, actor.role]);
  if (!user.rows.length) throw new LucyWorkError(401, 'Not authenticated');
  const prior = await client.query('SELECT * FROM lucy_background_work WHERE company_id=$1 AND user_id=$2 AND request_key=$3', [actor.company_id, actor.id, requestKey]);
  if (prior.rows[0]) {
   if (prior.rows[0].actor_role !== actor.role) throw new LucyWorkError(409, 'requestKey belongs to a previous authorization context');
   if (prior.rows[0].prompt !== prompt.trim()) throw new LucyWorkError(409, 'requestKey already used for a different prompt');
   await client.query('COMMIT'); return {job: publicLucyWork(prior.rows[0]), replayed: true};
  }
  const counts = await client.query(`SELECT count(*) FILTER (WHERE status IN ('queued','running')) AS active,
   count(*) FILTER (WHERE created_at > now()-interval '24 hours') AS daily FROM lucy_background_work WHERE company_id=$1 AND user_id=$2`, [actor.company_id, actor.id]);
  if (Number(counts.rows[0].active) >= 10 || Number(counts.rows[0].daily) >= 50) throw new LucyWorkError(429, 'Background work limit reached');
  const inserted = await client.query(`INSERT INTO lucy_background_work(id,company_id,user_id,actor_role,prompt,request_key) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`, [randomUUID(),actor.company_id,actor.id,actor.role,prompt.trim(),requestKey]);
  await client.query('COMMIT'); return {job: publicLucyWork(inserted.rows[0]), replayed: false};
 } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
export async function listLucyWork(actor: CompanyActor) {
 const result = await pool.query('SELECT * FROM lucy_background_work WHERE company_id=$1 AND user_id=$2 AND actor_role=$3 ORDER BY created_at DESC,id DESC LIMIT 50', [actor.company_id,actor.id,actor.role]);
 return result.rows.map(publicLucyWork);
}
export async function getLucyWork(actor: CompanyActor, id: string, cancel = false) {
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
 if (stopping || busy || activeExecutions.size > 0 || !lucyWorkEnabled() || !processor) return false;
 busy = true;
 try {
  await pool.query(`UPDATE lucy_background_work w SET status='failed',error='Actor unavailable or retry limit reached',result=NULL,lease_token=NULL,lease_until=NULL,updated_at=now(),completed_at=now()
   WHERE status IN ('queued','running') AND (NOT ${validActor} OR (status='running' AND lease_until<=now() AND attempts>=3))`);
  const token = randomUUID();
  const claimed = await pool.query(`WITH candidate AS (
   SELECT w.id FROM lucy_background_work w WHERE (status='queued' OR (status='running' AND lease_until<=now())) AND attempts<3 AND ${validActor}
   ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
   UPDATE lucy_background_work w SET status='running',attempts=attempts+1,lease_token=$1,lease_until=now()+interval '120 seconds',updated_at=now()
   FROM candidate WHERE w.id=candidate.id RETURNING w.*`,[token]);
  const job = claimed.rows[0]; if (!job) return false;
  let finished = false;
  const shouldContinue = async () => {
   if (stopping || finished || !lucyWorkEnabled()) return false;
   const r = await pool.query(`SELECT id FROM lucy_background_work w WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_until>now() AND ${validActor}`,[job.id,token]);
   return r.rows.length === 1;
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
   if (!(await shouldContinue())) throw new Error('Work no longer authorized');
   // A timed-out provider may still be in flight. Keep the execution slot occupied
   // until it settles; never accumulate overlapping inference calls.
   const execute = processor;
   const execution = Promise.resolve().then(() => execute({actor:{id:job.user_id,company_id:job.company_id,role:job.actor_role},prompt:job.prompt,shouldContinue})).finally(() => { activeExecutions.delete(execution); });
   activeExecutions.add(execution);
   const output = await Promise.race([execution,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Deadline exceeded')),90000);})]);
   if (!output || typeof output.text !== 'string') throw new Error('Invalid result');
   const serialized = JSON.stringify(output);
   if (Buffer.byteLength(serialized)>128000) throw new Error('Result too large');
   if (!(await shouldContinue())) throw new Error('Work no longer authorized');
   await pool.query(`UPDATE lucy_background_work w SET status=$4,result=$3::jsonb,error=NULL,lease_token=NULL,lease_until=NULL,updated_at=now(),completed_at=now() WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_until>now() AND ${validActor}`,[job.id,token,serialized,(output.run as any)?.status === 'partial' ? 'partial' : 'completed']);
  } catch {
   // Never store provider error strings (which may contain credentials or private context).
   await pool.query(`UPDATE lucy_background_work SET status='failed',error='Work could not complete safely. Submit a new request to retry.',result=NULL,lease_token=NULL,lease_until=NULL,updated_at=now(),completed_at=now() WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_until>now()`,[job.id,token]);
  } finally { finished = true; if (timer) clearTimeout(timer); }
  return true;
 } finally { busy = false; }
}
let timer: ReturnType<typeof setInterval> | undefined;
let pending: Promise<unknown> | undefined;
export function startLucyWorkWorker(): void {
 if (timer || draining || !lucyWorkEnabled()) return;
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
