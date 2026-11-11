import { pool } from '../config/database';
import { CompanyActor, manages } from '../middleware/companyActor';
import { loadSubscriptionActor, hasCompanyEntitlement } from '../middleware/trialMiddleware';

export class LucyActivityError extends Error { constructor(public status: number, message: string) { super(message); } }
async function ensureAccess(actor: CompanyActor) {
 let current;
 try { current = await loadSubscriptionActor(actor.id, actor.company_id); }
 catch { throw new LucyActivityError(503, 'Current access could not be verified'); }
 if (current.role !== actor.role) throw new LucyActivityError(401, 'Your access has changed');
 if (current.mustChangePassword) throw new LucyActivityError(403, 'Change your temporary password before continuing');
 if (!hasCompanyEntitlement(current)) throw new LucyActivityError(402, 'An active subscription or trial is required');
}
const titles: Record<string,string> = {task:'Task creation',pto:'PTO request submission',payroll:'Draft payroll',invoice_proposal:'Invoice proposal',executive_briefing:'Operations briefing',timesheet_report:'Timesheet report',create_task:'Task creation',request_pto:'PTO request submission',prepare_payroll:'Draft payroll proposal',confirm_payroll_preparation:'Draft payroll preparation'};
const modes: Record<string,string> = {ai_research:'AI background research',record_search:'Saved record search',work_briefing:'Work briefing'};
const own = <T>(values:Record<string,T>,key:unknown):T|undefined => typeof key==='string'&&Object.prototype.hasOwnProperty.call(values,key)?values[key]:undefined;
const iso = (value: unknown) => { const time = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : NaN; return Number.isFinite(time) ? new Date(time).toISOString() : null; };
/** Metadata only: never expose prompts, summaries, provider errors, or response bodies. */
export function publicLucyActivity(row: any) {
 const source = row.source;
 const title = source === 'action' ? own(titles,row.kind) : source === 'work' ? own(modes,row.kind) : source === 'request' ? 'Chat request' : undefined;
 const statuses: Record<string,Record<string,string>> = {
  action:{completed:'Action recorded',information:'Information recorded',pending:'Awaiting confirmation',failed:'Action failed'},
  work:{queued:'Queued',running:'Running',completed:'Completed',partial:'Partially completed',failed:'Failed',cancelled:'Cancelled'},
  request:{processing:'Outcome not yet confirmed',completed:'Response recorded',uncertain:'Outcome uncertain',expired:'Response expired'},
 };
 const outcomes = own(statuses,source), outcome = outcomes && own(outcomes,row.status);
 const createdAt = iso(row.created_at), updatedAt = iso(row.updated_at);
 if (!title || !outcome || !createdAt || !updatedAt || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id)) return null;
 return {id:`${source}:${row.id}`,source,title,status:row.status,outcome,createdAt,updatedAt,completedAt:iso(row.completed_at),receiptId:row.id};
}

export async function listLucyActivity(actor: CompanyActor) {
 await ensureAccess(actor);
 const db = await pool.connect();
 let rows;
 try {
  await db.query('BEGIN READ ONLY');
  await db.query("SET LOCAL statement_timeout = '5000ms'");
  // Every source is restricted to this actor, not merely their company. Legacy
  // action receipts have no role column, so demoted actors see self PTO only.
  const result = await db.query(`SELECT * FROM (
   (SELECT 'action' AS source,id,kind,details->>'status' AS status,created_at,created_at AS updated_at,NULL::timestamptz AS completed_at
    FROM command_events WHERE company_id=$1 AND actor_id=$2 AND ($4::boolean OR kind IN ('pto','request_pto')) ORDER BY created_at DESC,id DESC LIMIT 50)
   UNION ALL
   (SELECT 'work' AS source,id,mode AS kind,status,created_at,updated_at,completed_at FROM lucy_background_work
    WHERE company_id=$1 AND user_id=$2 AND actor_role=$3 ORDER BY updated_at DESC,id DESC LIMIT 50)
   UNION ALL
   (SELECT 'request' AS source,id,'chat' AS kind,status,created_at,updated_at,completed_at FROM lucy_request_ledger
    WHERE company_id=$1 AND user_id=$2 AND actor_role=$3 ORDER BY updated_at DESC,id DESC LIMIT 50)
   ) activity ORDER BY updated_at DESC,source,id DESC LIMIT 50`,[actor.company_id,actor.id,actor.role,manages(actor)]);
  rows = result.rows;
  await db.query('COMMIT');
 } catch (error) { await db.query('ROLLBACK').catch(()=>{}); throw error; }
 finally { db.release(); }
 // Discard the entire response if access was revoked while sources were read.
 await ensureAccess(actor);
 return {entries:rows.map(publicLucyActivity).filter(Boolean),limit:50,checkedAt:new Date().toISOString(),scope:'your_current_company_activity',notice:'Recent recorded activity only. Older actions may not have receipts. A recorded chat response does not prove a business action succeeded. Platform repair and release history is available only to authorized platform support owners.'};
}
