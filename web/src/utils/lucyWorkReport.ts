import type {LucyEvidence, LucySource} from './lucyEvidence';

export type LucyWorkMode = 'ai_research' | 'record_search';
export type LucyWorkJob = {
  id:string; prompt:string; status:string; mode?:LucyWorkMode;
  result?:{text?:string; evidence?:LucyEvidence; run?:{modelCalls?:number; status?:string}};
  error?:string; createdAt:string; updatedAt?:string; completedAt?:string|null;
};
export type LucyWorkModes = {ai_research:boolean; record_search:boolean; explicit:boolean};

/** Missing capability metadata means an older AI-only server. Malformed metadata fails closed. */
export function readLucyWorkModes(value:{enabled?:unknown; modes?:unknown}):LucyWorkModes {
  if (!Object.prototype.hasOwnProperty.call(value,'modes')) {
    return {ai_research:value.enabled===true,record_search:false,explicit:false};
  }
  const modes=value.modes;
  if (!modes || typeof modes!=='object' || !('ai_research' in modes) || !('record_search' in modes)
    || typeof modes.ai_research!=='boolean' || typeof modes.record_search!=='boolean') {
    return {ai_research:false,record_search:false,explicit:true};
  }
  return {ai_research:modes.ai_research,record_search:modes.record_search,explicit:true};
}

export const LUCY_REPORT_MAX_BYTES=128000;
const invalid=()=>{throw new Error('This report is incomplete, malformed, or too large to download safely. Refresh the task and try again.');};
const boundedText=(value:unknown,max:number,required=false):value is string=>typeof value==='string'
  && value.length<=max && (!required||Boolean(value.trim())) && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value);
const timestamp=(value:unknown):value is string=>boundedText(value,64,true)&&Number.isFinite(Date.parse(value));
const record=(value:unknown):value is Record<string,unknown>=>value!=null&&typeof value==='object'&&!Array.isArray(value);

/** Build a bounded UTF-8 snapshot from a completed or explicitly partial local job. No sources are fetched. */
export function buildLucyWorkReport(value:unknown,options:{sample:boolean}):{text:string;filename:string;bytes:number} {
  const partial=record(value)&&value.status==='partial'&&value.mode==='record_search';
  if (!record(value) || (value.status!=='completed'&&!partial) || !boundedText(value.id,200,true)
    || (value.mode!==undefined && value.mode!=='record_search' && value.mode!=='ai_research')
    || !boundedText(value.prompt,value.mode==='record_search'?200:4000,true) || !timestamp(value.createdAt)
    || (value.completedAt!=null && !timestamp(value.completedAt)) || (value.updatedAt!==undefined && !timestamp(value.updatedAt))
    || !record(value.result) || !boundedText(value.result.text,LUCY_REPORT_MAX_BYTES,true)) return invalid();
  const run=value.result.run;
  if (run!==undefined && (!record(run) || (run.status!==undefined && run.status!==value.status)
    || (run.modelCalls!==undefined && (!Number.isSafeInteger(run.modelCalls) || Number(run.modelCalls)<0)))) return invalid();
  if ((value.mode==='record_search'||options.sample) && (!record(run)||run.modelCalls!==0||value.result.evidence===undefined)) return invalid();
  if (partial&&(!record(run)||run.status!=='partial'||!record(value.result.evidence)||value.result.evidence.incomplete!==true)) return invalid();
  let sources:LucySource[]=[];
  let completeness='Unknown: source evidence was not supplied.';
  if (value.result.evidence!==undefined) {
    const evidence=value.result.evidence;
    if (!record(evidence)||!Array.isArray(evidence.sources)||evidence.sources.length>12||typeof evidence.incomplete!=='boolean') return invalid();
    for (const source of evidence.sources) {
      if (!record(source)||typeof source.kind!=='string'||!['document','task','project','schedule'].includes(source.kind)
        || !boundedText(source.id,200,true)||!boundedText(source.title,200)||!boundedText(source.excerpt,1200)
        || !timestamp(source.retrievedAt)||(source.date!==undefined&&!timestamp(source.date))) return invalid();
    }
    sources=evidence.sources as LucySource[];
    completeness=evidence.incomplete
      ? 'Incomplete: some records may be missing. This is not an exhaustive search.'
      : 'No missing evidence was reported for the retrieved records. This is not a guarantee that all company records were searched.';
  }
  const mode=value.mode==='record_search'?'Company-record search (no AI model)':value.mode==='ai_research'?'AI research':'AI research (legacy server mode)';
  const model=options.sample||value.mode==='record_search'?'No AI model was called.':record(run)&&typeof run.modelCalls==='number'?`Model calls reported by the server: ${run.modelCalls}.`:'Model-call details were not supplied.';
  const sections=[
    options.sample?`LUCY SAMPLE ${partial?'PARTIAL RECORD SEARCH ':''}REPORT — SYNTHETIC DATA ONLY`:partial?'LUCY PARTIAL RECORD SEARCH REPORT':'LUCY WORK REPORT',
    ...(partial?['PARTIAL RESULTS: Retrieval was limited or a source was unavailable. Some matching records may be missing. Do not treat this report as complete or exhaustive.']:[]),
    options.sample?'Fixed sample simulation, not a researched answer. No AI model, API requests, credentials, persistent storage, or real records were used by the simulation. The query below is the text you entered; the result and sources are fixed synthetic examples.':'Snapshot of the saved task and evidence already available in this account. No new retrieval was performed for this download.',
    `Mode: ${options.sample?'Sample record-search simulation (no AI model)':mode}`,
    model,`Task ID: ${value.id}`,`Status: ${value.status}`,`Created: ${value.createdAt}`,
    `${partial?'Finished (partial)':'Completed'}: ${value.completedAt??'Not supplied'}`,`Query:\n${value.prompt}`,`Result:\n${value.result.text}`,
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
  const filename=`lucy-${options.sample?'sample-':''}${value.mode==='record_search'?`record-search${partial?'-partial':''}`:'research'}-${date}-${safeId}.txt`;
  return {text,filename,bytes};
}
