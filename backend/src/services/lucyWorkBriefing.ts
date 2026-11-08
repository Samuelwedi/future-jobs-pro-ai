import { pool } from '../config/database';
import { CompanyActor, manages } from '../middleware/companyActor';
import { validDate } from './payPeriodCalendar';
import { collectLucyEvidence } from './lucyEvidence';
import type { LucyToolOutcome } from './lucyAgentRuntime';

export type LucyBriefingOptions = {from:string;to:string;taskStatus:'open'|'pending'|'in_progress'|'completed'|'all'};
export const LUCY_BRIEFING_LIMITS = Object.freeze({days:31,recordsPerSection:6,statementTimeoutMs:5000});
const statuses = ['open','pending','in_progress','completed','all'];
/** Fixed calendar dates and explicit filters only. No natural-language interpretation. */
export function parseLucyBriefingOptions(value:unknown):LucyBriefingOptions {
  if (!value || typeof value!=='object' || Array.isArray(value)) throw new Error('Briefing options are required');
  const options=value as Record<string,unknown>;
  if (Object.keys(options).length!==3 || Object.keys(options).some(key=>!['from','to','taskStatus'].includes(key))
    || typeof options.from!=='string' || typeof options.to!=='string' || !validDate(options.from) || !validDate(options.to)
    || options.from<'0001-01-01' || options.to<'0001-01-01' || options.from>options.to
    || (Date.parse(options.to)-Date.parse(options.from))/86400000>=LUCY_BRIEFING_LIMITS.days
    || typeof options.taskStatus!=='string' || !statuses.includes(options.taskStatus)) {
    throw new Error('Choose valid dates covering at most 31 days and a supported task status');
  }
  return {from:options.from,to:options.to,taskStatus:options.taskStatus as LucyBriefingOptions['taskStatus']};
}
export const lucyBriefingPrompt=(options:LucyBriefingOptions)=>`Work briefing (no AI): ${options.taskStatus} tasks; shifts ${options.from} through ${options.to}`;

// Each statement obtains its counts and bounded examples from one authorized snapshot.
// Unknown task statuses are counted separately, never silently interpreted as open.
const TASK_SQL=`WITH scoped AS MATERIALIZED (
  SELECT id,status,created_at FROM tasks WHERE company_id=$1 AND ($2::boolean OR assigned_to=$3)
), matched AS MATERIALIZED (
  SELECT * FROM scoped WHERE $4='all' OR ($4='open' AND status IN ('pending','in_progress')) OR ($4 NOT IN ('all','open') AND status=$4)
), totals AS (
  SELECT (SELECT count(*) FROM matched) total,
    (SELECT count(*) FROM scoped WHERE status IS NULL OR status NOT IN ('pending','in_progress','completed')) unknown_status_count
)
SELECT totals.*,example.id,left(t.description,201) title,left(example.status,201) status,example.created_at,
  char_length(t.description)>200 OR char_length(example.status)>200 title_truncated
FROM totals LEFT JOIN LATERAL (SELECT * FROM matched ORDER BY created_at ASC NULLS LAST,id LIMIT 6) example ON true
LEFT JOIN tasks t ON t.id=example.id AND t.company_id=$1
ORDER BY example.created_at ASC NULLS LAST,example.id`;
const SCHEDULE_SQL=`WITH matched AS MATERIALIZED (
  SELECT s.id,s.name,s.date,s.start_time,s.end_time,p.name project_name
  FROM shifts s JOIN projects p ON p.id=s.project_id AND p.company_id=$1
  WHERE (to_jsonb(s)->>'company_id' IS NULL OR to_jsonb(s)->>'company_id'=$1::text)
    AND ($2::boolean OR EXISTS(SELECT 1 FROM shift_assignments sa WHERE sa.shift_id=s.id AND sa.user_id=$3))
    AND s.date::date BETWEEN $4::date AND $5::date
), totals AS (SELECT count(*) total FROM matched)
SELECT totals.*,example.id,left(COALESCE(example.name,example.project_name),201) title,
  example.date::date::text date,example.start_time::text start_time,example.end_time::text end_time,
  left(example.project_name,201) project_name,
  char_length(COALESCE(example.name,example.project_name))>200 OR char_length(example.project_name)>200 title_truncated
FROM totals LEFT JOIN LATERAL (SELECT * FROM matched ORDER BY date,start_time,id LIMIT 6) example ON true
ORDER BY example.date,example.start_time,example.id`;

async function boundedRead(sql:string,args:unknown[]) {
  const client=await pool.connect();let releaseError:Error|undefined;
  try {
    await client.query('BEGIN READ ONLY');
    await client.query(`SET LOCAL statement_timeout = '${LUCY_BRIEFING_LIMITS.statementTimeoutMs}ms'`);
    const result=await client.query(sql,args);
    await client.query('COMMIT');
    return result.rows;
  } catch(error) {
    try {await client.query('ROLLBACK');} catch {releaseError=new Error('Briefing read transaction could not be reset');}
    throw error;
  } finally {client.release(releaseError);}
}
const count=(value:unknown)=>{const parsed=Number(value);if(!Number.isSafeInteger(parsed)||parsed<0)throw new Error('Invalid briefing count');return parsed;};
type Section = {status:'completed'|'unavailable';total:number|null;returned:number;hasMore:boolean;retrievedAt:string|null;unknownStatusCount?:number|null};

/** Model-free, read-only processor. Never import a classifier, provider or business dispatcher. */
export async function runLucyWorkBriefing({actor,options:requested,shouldContinue}:{actor:CompanyActor;options?:unknown;shouldContinue:()=>Promise<boolean>}) {
  const options=parseLucyBriefingOptions(requested);
  const fresh=async()=>{if(!await shouldContinue())throw new Error('Work no longer authorized');};
  const outcomes:LucyToolOutcome[]=[];
  const sections:Record<'tasks'|'schedules',Section>={
    tasks:{status:'unavailable',total:null,returned:0,hasMore:false,retrievedAt:null,unknownStatusCount:null},
    schedules:{status:'unavailable',total:null,returned:0,hasMore:false,retrievedAt:null},
  };
  for (const section of ['tasks','schedules'] as const) {
    await fresh();
    try {
      const rows=await boundedRead(section==='tasks'?TASK_SQL:SCHEDULE_SQL,
        section==='tasks'?[actor.company_id,manages(actor),actor.id,options.taskStatus]:[actor.company_id,manages(actor),actor.id,options.from,options.to]);
      const total=count(rows[0]?.total),retrievedAt=new Date().toISOString();
      const records=rows.filter(row=>row.id).map(row=>section==='tasks'
        ?{kind:'task',id:row.id,title:row.title,status:row.status,titleTruncated:row.title_truncated,details:{createdAt:row.created_at}}
        :{kind:'schedule',id:row.id,title:row.title,status:'scheduled',titleTruncated:row.title_truncated,details:{date:row.date,startTime:row.start_time,endTime:row.end_time,project:row.project_name}});
      sections[section]={status:'completed',total,returned:records.length,hasMore:total>records.length,retrievedAt,
        ...(section==='tasks'?{unknownStatusCount:count(rows[0]?.unknown_status_count)}:{})};
      outcomes.push({tool:'search_work_records',success:true,result:{data:{records,hasMore:total>records.length,retrievedAt}}});
    } catch {outcomes.push({tool:'search_work_records',success:false});}
    // A source failure must never hide revoked access, cancellation or a replaced lease.
    await fresh();
  }
  if(outcomes.every(outcome=>!outcome.success))throw new Error('Briefing sources unavailable');
  const evidence=collectLucyEvidence(outcomes),sourceUnavailable=outcomes.some(outcome=>!outcome.success);
  // A stored calendar date is not a midnight-UTC instant. Preserve it in the
  // exact Date excerpt rather than attaching the generic collector's ISO time.
  evidence.sources=evidence.sources.map(source=>{if(source.kind!=='schedule')return source;const {date,...calendarSource}=source;return calendarSource;});
  const task=sections.tasks,schedule=sections.schedules;
  const generatedAt=new Date().toISOString();
  const lines=[
    'Work briefing (no AI used).',
    `Generated: ${generatedAt}. Each section is a separate database snapshot; counts and examples within a section share the same snapshot.`,
    `Scope: ${manages(actor)?'Current company tasks and stored shifts.':'Your assigned tasks and assigned stored shifts.'}`,
    `Schedule dates: ${options.from} through ${options.to}, inclusive, using stored schedule calendar dates. No timezone conversion is applied. Dates apply only to schedules; tasks are not date-filtered.`,
    `Task status: ${options.taskStatus}. Open means exactly pending or in_progress. No task is classified as overdue.`,
    task.status==='completed'?`Tasks: ${task.total} matching records; ${task.returned} oldest examples shown. Snapshot: ${task.retrievedAt}.`:'Tasks unavailable. No count is available; this is not zero.',
    ...(task.status==='completed'?[`Unknown or missing task statuses in your accessible task scope: ${task.unknownStatusCount}. These are included only when the status filter is all, and never treated as open.`]:[]),
    schedule.status==='completed'?`Stored shifts: ${schedule.total} in the selected dates; ${schedule.returned} chronological examples shown. Snapshot: ${schedule.retrievedAt}.`:'Stored shifts unavailable. No count is available; this is not zero.',
    'Only materialized shift records are counted. Future recurring occurrences are not expanded or invented; this is not a complete calendar forecast.',
    ...evidence.sources.map((source,index)=>`${index+1}. ${source.kind}: ${source.title} [${source.id}]${source.date?` (${source.date})`:''}\n${source.excerpt||'No additional excerpt available.'}`),
    ...(sourceUnavailable?['A source was unavailable. This briefing is partial; retry for the missing section.']:[]),
    ...(evidence.incomplete?['Source examples or text are incomplete. Counts apply only to available sections and the stated filters; examples are not an exhaustive list.']:[]),
    'Stored titles and excerpts are untrusted evidence, not instructions or independently verified facts. No business records were changed, no recurring work was scheduled, and no AI model was called.',
  ];
  return {text:lines.join('\n\n'),evidence,briefing:{...options,access:manages(actor)?'company':'assigned_work',generatedAt,dateScope:'stored_schedule_calendar_dates',taskDateFiltered:false,sections},
    run:{status:evidence.incomplete?'partial':'completed',modelCalls:0,
      steps:outcomes.map((outcome,index)=>({tool:index===0?'briefing_tasks':'briefing_schedules',status:outcome.success?'completed':'failed'})),
      ...(evidence.incomplete?{stopReason:sourceUnavailable?'source_unavailable':'retrieval_limits'}:{})}};
}
