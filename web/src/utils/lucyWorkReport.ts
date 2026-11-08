import type {LucyEvidence, LucySource} from './lucyEvidence';

export type LucyWorkMode = 'ai_research' | 'record_search' | 'work_briefing';
export type LucyBriefingOptions = {from:string;to:string;taskStatus:'open'|'pending'|'in_progress'|'completed'|'all'};

/** Explicit Gregorian dates only; parsing must never normalize an impossible date. */
export function readLucyBriefingOptions(value:unknown):LucyBriefingOptions|null {
  if (!record(value)||Object.keys(value).sort().join(',')!=='from,taskStatus,to'
    || typeof value.taskStatus!=='string'||!['open','pending','in_progress','completed','all'].includes(value.taskStatus)) return null;
  const day=(input:unknown):number|null=>{
    if(typeof input!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(input)||input.startsWith('0000-'))return null;
    const time=Date.parse(`${input}T00:00:00.000Z`);
    return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===input?time:null;
  };
  const from=day(value.from),to=day(value.to);
  if(from===null||to===null||to<from||(to-from)/86400000+1>31)return null;
  return {from:value.from as string,to:value.to as string,taskStatus:value.taskStatus as LucyBriefingOptions['taskStatus']};
}
export function lucyBriefingPrompt(options:LucyBriefingOptions):string {
  return `Work briefing (no AI): ${options.taskStatus} tasks; shifts ${options.from} through ${options.to}`;
}
export function lucyBriefingPreview(options:LucyBriefingOptions):string {
  const status=options.taskStatus==='open'?'open (pending or in progress)':options.taskStatus.replace(/_/g,' ');
  return `Work briefing: ${status} tasks across all dates; stored shifts from ${options.from} through ${options.to} (inclusive).`;
}
export function lucyWorkModeLabel(mode:unknown,sample=false):string {
  if(mode==='work_briefing')return `${sample?'Sample':'Work'} briefing (no AI model)`;
  if(mode==='record_search')return `${sample?'Sample record':'Company-record'} search (no AI model)`;
  if(mode==='ai_research')return 'AI research';
  if(mode===undefined)return 'AI research (legacy server mode)';
  return 'Unavailable work mode';
}
export const knownLucyWorkMode=(mode:unknown)=>mode===undefined||mode==='ai_research'||mode==='record_search'||mode==='work_briefing';
export type LucyWorkJob = {
  id:string; prompt:string; status:string; mode?:LucyWorkMode; options?:LucyBriefingOptions;
  result?:{text?:string; evidence?:LucyEvidence; run?:{modelCalls?:number; status?:string;steps?:unknown[];stopReason?:string}};
  error?:string; createdAt:string; updatedAt?:string; completedAt?:string|null;
};
export type LucyWorkModes = {ai_research:boolean; record_search:boolean; work_briefing:boolean; explicit:boolean};

/** Missing capability metadata means an older AI-only server. Malformed metadata fails closed. */
export function readLucyWorkModes(value:{enabled?:unknown; modes?:unknown}):LucyWorkModes {
  if (!Object.prototype.hasOwnProperty.call(value,'modes')) {
    return {ai_research:value.enabled===true,record_search:false,work_briefing:false,explicit:false};
  }
  const modes=value.modes;
  if (!modes || typeof modes!=='object' || Array.isArray(modes) || !('ai_research' in modes) || !('record_search' in modes)
    || typeof modes.ai_research!=='boolean' || typeof modes.record_search!=='boolean'
    || ('work_briefing' in modes && typeof modes.work_briefing!=='boolean')) {
    return {ai_research:false,record_search:false,work_briefing:false,explicit:true};
  }
  return {ai_research:modes.ai_research,record_search:modes.record_search,work_briefing:'work_briefing' in modes && modes.work_briefing===true,explicit:true};
}

export const LUCY_REPORT_MAX_BYTES=128000;
const invalid=()=>{throw new Error('This report is incomplete, malformed, or too large to download safely. Refresh the task and try again.');};
const boundedText=(value:unknown,max:number,required=false):value is string=>typeof value==='string'
  && value.length<=max && (!required||Boolean(value.trim())) && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value);
const timestamp=(value:unknown):value is string=>boundedText(value,64,true)&&Number.isFinite(Date.parse(value));
const record=(value:unknown):value is Record<string,unknown>=>value!=null&&typeof value==='object'&&!Array.isArray(value);

/** Build a bounded UTF-8 snapshot from a completed or explicitly partial local job. No sources are fetched. */
export function buildLucyWorkReport(value:unknown,options:{sample:boolean}):{text:string;filename:string;bytes:number} {
  const briefing=record(value)&&value.mode==='work_briefing';
  const modelFree=record(value)&&(value.mode==='record_search'||briefing);
  const partial=record(value)&&value.status==='partial'&&modelFree;
  if (!record(value) || (value.status!=='completed'&&!partial) || !boundedText(value.id,200,true)
    || !knownLucyWorkMode(value.mode)
    || !boundedText(value.prompt,modelFree?200:4000,true) || !timestamp(value.createdAt)
    || (value.completedAt!=null && !timestamp(value.completedAt)) || (value.updatedAt!==undefined && !timestamp(value.updatedAt))
    || !record(value.result) || !boundedText(value.result.text,LUCY_REPORT_MAX_BYTES,true)) return invalid();
  const briefingOptions=briefing?readLucyBriefingOptions(value.options):null;
  if(briefing&&(!briefingOptions||value.prompt!==lucyBriefingPrompt(briefingOptions)))return invalid();
  const run=value.result.run;
  if (run!==undefined && (!record(run) || (run.status!==undefined && run.status!==value.status)
    || (run.modelCalls!==undefined && (!Number.isSafeInteger(run.modelCalls) || Number(run.modelCalls)<0)))) return invalid();
  if ((modelFree||options.sample) && (!record(run)||run.modelCalls!==0||value.result.evidence===undefined)) return invalid();
  let failedBriefingSource:string|undefined;
  if (briefing) {
    if(!record(run)||run.status!==value.status||!Array.isArray(run.steps)||run.steps.length!==2
      || run.steps.some((step,index)=>!record(step)||step.tool!==['briefing_tasks','briefing_schedules'][index]||(step.status!=='completed'&&step.status!=='failed'))
      || (partial?(run.stopReason!=='retrieval_limits'&&run.stopReason!=='source_unavailable'):run.stopReason!==undefined)
      || (!partial&&run.steps.some(step=>step.status!=='completed')))return invalid();
    const failedSteps=run.steps.filter(step=>step.status==='failed').length;
    if(partial&&(run.stopReason==='source_unavailable'?failedSteps!==1:failedSteps!==0))return invalid();
    if(failedSteps)failedBriefingSource=run.steps[0].status==='failed'?'task':'schedule';
  }
  if (partial&&(!record(run)||run.status!=='partial'||!record(value.result.evidence)||value.result.evidence.incomplete!==true)) return invalid();
  let sources:LucySource[]=[];
  let completeness='Unknown: source evidence was not supplied.';
  if (value.result.evidence!==undefined) {
    const evidence=value.result.evidence;
    if (!record(evidence)||!Array.isArray(evidence.sources)||evidence.sources.length>12||typeof evidence.incomplete!=='boolean') return invalid();
    for (const source of evidence.sources) {
      if (!record(source)||typeof source.kind!=='string'||!['document','task','project','schedule'].includes(source.kind)
        || !boundedText(source.id,200,true)||!boundedText(source.title,200)||!boundedText(source.excerpt,1200)
        || (briefing&&(!['task','schedule'].includes(source.kind)||source.kind===failedBriefingSource))
        || !timestamp(source.retrievedAt)||(source.date!==undefined&&!timestamp(source.date))) return invalid();
    }
    sources=evidence.sources as LucySource[];
    if(briefing&&(evidence.incomplete!==partial||['task','schedule'].some(kind=>sources.filter(source=>source.kind===kind).length>6)))return invalid();
    completeness=evidence.incomplete
      ? 'Incomplete: some records may be missing. This is not an exhaustive search.'
      : 'No missing evidence was reported for the retrieved records. This is not a guarantee that all company records were searched.';
  }
  const mode=lucyWorkModeLabel(value.mode,options.sample);
  const reportKind=briefing?'WORK BRIEFING':'RECORD SEARCH';
  const model=options.sample||modelFree?'No AI model was called.':record(run)&&typeof run.modelCalls==='number'?`Model calls reported by the server: ${run.modelCalls}.`:'Model-call details were not supplied.';
  const sections=[
    options.sample?`LUCY SAMPLE ${partial?'PARTIAL ':''}${briefing?'WORK BRIEFING ':partial?'RECORD SEARCH ':''}REPORT — SYNTHETIC DATA ONLY`:partial?`LUCY PARTIAL ${reportKind} REPORT`:briefing?'LUCY WORK BRIEFING REPORT':'LUCY WORK REPORT',
    ...(partial?['PARTIAL RESULTS: Retrieval was limited or a source was unavailable. Some matching records may be missing. Do not treat this report as complete or exhaustive.']:[]),
    options.sample?'Fixed sample simulation, not a researched answer. No AI model, API requests, credentials, persistent storage, or real records were used by the simulation. The input below is displayed only; dates and task status are not searched or applied to this fixed example. The result and sources are fixed synthetic examples.':'Snapshot of the saved task and evidence already available in this account. No new retrieval was performed for this download.',
    `Mode: ${mode}`,
    model,`Task ID: ${value.id}`,`Status: ${value.status}`,`Created: ${value.createdAt}`,
    `${partial?'Finished (partial)':'Completed'}: ${value.completedAt??'Not supplied'}`,`${briefing?'Briefing request':'Query'}:\n${value.prompt}`,
    ...(briefingOptions?[`${options.sample?'Displayed schedule dates (not applied)':'Schedule dates'}: ${briefingOptions.from} through ${briefingOptions.to} (inclusive, stored shifts only).`,`${options.sample?'Displayed task status (not applied)':'Task status'}: ${briefingOptions.taskStatus}. In live briefings, tasks are selected across all dates, oldest first. Open means pending or in progress. Due dates are not evaluated.`, 'Bounded briefing: counts plus at most six oldest tasks and six earliest stored shifts. Recurrence rules are not expanded. Missing or capped sources are partial.']:[]),
    `Result:\n${value.result.text}`,
    `Evidence completeness: ${completeness}`,`Sources supplied: ${sources.length}`,
    sources.length?sources.map((source,index)=>[
      `Source ${index+1}`,`Type: ${source.kind}`,`ID: ${source.id}`,`Title: ${source.title}`,
      `Retrieved: ${source.retrievedAt}`,...(source.date?[`Record date: ${source.date}`]:[]),`Excerpt:\n${source.excerpt}`,
    ].join('\n')).join('\n\n'):'No source citations were supplied. None have been inferred from the result.',
    'This plain-text file contains record excerpts, not linked files or independently verified citations.',
  ];
  const text=sections.join('\n\n')+'\n';
  const bytes=new TextEncoder().encode(text).byteLength;
  if (bytes>LUCY_REPORT_MAX_BYTES) return invalid();
  // Never put queries, titles, paths, URLs, or account details in the download filename.
  const safeId=value.id.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,48)||'task';
  const date=new Date(value.createdAt).toISOString().slice(0,10);
  const filename=`lucy-${options.sample?'sample-':''}${modelFree?`${briefing?'work-briefing':'record-search'}${partial?'-partial':''}`:'research'}-${date}-${safeId}.txt`;
  return {text,filename,bytes};
}
