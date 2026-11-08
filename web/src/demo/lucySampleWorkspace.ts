import {readLucyBriefingOptions,lucyBriefingPrompt} from '../utils/lucyWorkReport';
import type {Job, LucySampleWorkspace, LucyWorkspaceClient, Preference} from '../components/LucyWorkspacePanel';

// The only runtime import is pure validation/formatting. No network client, credentials or storage.
// Each factory call owns its entire state. Prompts are display text, never instructions.
const preferenceOptions: Record<string,string[]> = {
  response_style: ['concise', 'conversational', 'formal'],
  detail_level: ['summary', 'balanced', 'detailed'],
  focus_area: ['tasks', 'schedules', 'projects', 'approvals'],
  language: ['en', 'es', 'fr', 'pt'],
  week_start: ['monday', 'sunday'],
  time_format: ['12h', '24h'],
};
const workPath = '/api/lucy-v2/work';
const preferencesPath = '/api/lucy-v2/preferences';
const sampleJobLimit = 20;
let scopeSequence = 0;
const copy = <T,>(value:T):T => JSON.parse(JSON.stringify(value));
const bodyObject = (body:unknown):Record<string,unknown> => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid sample request.');
  return body as Record<string,unknown>;
};
const preferenceKey = (path:string) => {
  const key = path.startsWith(`${preferencesPath}/`) ? path.slice(preferencesPath.length+1) : '';
  if (!Object.prototype.hasOwnProperty.call(preferenceOptions,key)) throw new Error('Choose a supported sample preference.');
  return key;
};

function sampleResult(time:number):NonNullable<Job['result']> {
  const retrievedAt = new Date(time).toISOString();
  return {
    text: 'SAMPLE RESULT · Prepared demonstration, not AI research. No model was called and no real changes were made.\n\nIn the fictional Riverside handover, the west entrance photo is missing, the delivery confirmation is pending, and a crew-hours review is suggested. This fixed result is the same for every prompt. The sources below are synthetic examples, not customer records.',
    run: {modelCalls:0,status:'completed'},
    evidence: {incomplete:false, sources:[
      {kind:'task',id:'sample-task-west-entrance',title:'SAMPLE · West entrance photo',excerpt:'Fictional task: capture the west entrance photo before clock-out. Status: open. This record was created for the demo.',retrievedAt},
      {kind:'schedule',id:'sample-schedule-delivery',title:'SAMPLE · Riverside delivery',excerpt:'Fictional schedule: the next delivery confirmation is pending. This is an example only, not a real upcoming appointment.',retrievedAt},
      {kind:'document',id:'sample-document-handover',title:'SAMPLE · Crew handover notes',excerpt:'Fictional handover note: review crew hours before the afternoon shift ends. No real crew data was accessed.',retrievedAt},
    ]},
  };
}

function sampleBriefingResult(time:number):NonNullable<Job['result']> {
  const retrievedAt=new Date(time).toISOString();
  return {
    text:'SAMPLE WORK BRIEFING · Fixed synthetic example, no AI model. Your dates and task status are displayed only and do not filter this example. No real records are read or changed.\n\nExample counts: 2 open tasks (1 pending, 1 in progress); 1 stored shift.\nOldest tasks: West entrance photo, then Delivery confirmation.\nEarliest stored shift: Riverside afternoon shift. These prepared records do not represent any actual date range or live work.',
    run:{modelCalls:0,status:'completed',steps:[{tool:'briefing_tasks',status:'completed'},{tool:'briefing_schedules',status:'completed'}]},
    evidence:{incomplete:false,sources:[
      {kind:'task',id:'sample-briefing-photo',title:'SAMPLE · West entrance photo',excerpt:'Fictional oldest task: West entrance photo. Status: pending. Display-only example, not filtered by the selected status.',retrievedAt},
      {kind:'task',id:'sample-briefing-delivery',title:'SAMPLE · Delivery confirmation',excerpt:'Fictional second-oldest task: Delivery confirmation. Status: in_progress. Display-only example, not filtered by the selected status.',retrievedAt},
      {kind:'schedule',id:'sample-briefing-shift',title:'SAMPLE · Riverside afternoon shift',excerpt:'Fictional stored shift: Riverside afternoon shift. Display-only example, not filtered by the selected dates.',retrievedAt},
    ]},
  };
}

/** Local-only rehearsal of the real workspace protocol. Unsupported paths fail closed. */
export function createLucySampleWorkspace(now:()=>number = Date.now):LucySampleWorkspace {
  const scopeKey = `lucy-sample-${++scopeSequence}`;
  const jobs:Job[] = [];
  const requests = new Map<string,Job>();
  const preferences = new Map<string,Preference>();
  const readyAt = new Map<string,number>();
  let nextJob = 0;

  const client:LucyWorkspaceClient = {
    async get<T>(path:string):Promise<T> {
      if (path === workPath) {
        const time = now();
        for (const job of jobs) {
          if (job.status === 'queued' && time >= (readyAt.get(job.id) ?? Infinity)) {
            job.status = 'completed';
            job.result = job.mode==='work_briefing'?sampleBriefingResult(time):sampleResult(time);
            job.completedAt = new Date(time).toISOString();
            readyAt.delete(job.id);
          }
        }
        return copy({enabled:false,modes:{record_search:true,work_briefing:true,ai_research:false},jobs}) as T;
      }
      if (path === preferencesPath) {
        for (const [key,preference] of preferences) {
          if (Date.parse(preference.expiresAt) <= now()) preferences.delete(key);
        }
        return copy({preferences:[...preferences.values()],options:preferenceOptions,limit:6}) as T;
      }
      throw new Error('This sample workspace only supports sample tasks and preferences.');
    },
    async post<T>(path:string,body?:unknown):Promise<T> {
      if (path === workPath) {
        const input = bodyObject(body);
        const briefing=input.mode==='work_briefing';
        const options=briefing?readLucyBriefingOptions(input.options):null;
        if (typeof input.requestKey !== 'string' || !/^[a-zA-Z0-9_.:-]{1,100}$/.test(input.requestKey)
          || (briefing?(Object.keys(input).sort().join(',')!=='mode,options,requestKey'||!options)
            :(Object.keys(input).sort().join(',')!=='mode,prompt,requestKey'||input.mode!=='record_search'
              || typeof input.prompt!=='string'||!input.prompt.trim()||input.prompt.length>200))) {
          throw new Error('Choose a supported sample mode with valid inputs and a request key. Briefings require explicit dates spanning at most 31 days inclusive.');
        }
        const prompt = options?lucyBriefingPrompt(options):(input.prompt as string).trim();
        const existing = requests.get(input.requestKey);
        if (existing) {
          if (existing.prompt !== prompt || existing.mode !== input.mode) throw new Error('This sample request key already belongs to another task.');
          return copy({job:existing}) as T;
        }
        if (jobs.length >= sampleJobLimit) throw new Error('Sample limit reached. Leave Lucy AI and return to reset this demo.');
        const time = now();
        const job:Job = {id:`${scopeKey}-job-${++nextJob}`,prompt,mode:briefing?'work_briefing':'record_search',...(options?{options}:{}),status:'queued',createdAt:new Date(time).toISOString()};
        jobs.unshift(job);
        requests.set(input.requestKey,job);
        readyAt.set(job.id,time+4000);
        return copy({job}) as T;
      }
      const match = /^\/api\/lucy-v2\/work\/([^/]+)\/cancel$/.exec(path);
      if (match && body === undefined) {
        const job = jobs.find(item=>item.id===match[1]);
        if (!job) throw new Error('Sample task not found in this workspace.');
        if (job.status === 'queued') {
          job.status = 'cancelled';
          readyAt.delete(job.id);
        }
        return copy({job}) as T;
      }
      throw new Error('This sample workspace cannot perform that action.');
    },
    async put<T>(path:string,body?:unknown):Promise<T> {
      const key = preferenceKey(path);
      const input = bodyObject(body);
      const expiry = typeof input.expiresAt === 'string' ? Date.parse(input.expiresAt) : NaN;
      if (Object.keys(input).sort().join(',') !== 'expiresAt,value'
        || typeof input.value !== 'string' || !preferenceOptions[key].includes(input.value)
        || !Number.isFinite(expiry) || expiry < now()+3600000 || expiry > now()+365*86400000) {
        throw new Error('Choose an allowed sample value and an expiry between one hour and 365 days.');
      }
      const preference = {key,value:input.value,expiresAt:new Date(expiry).toISOString()};
      preferences.set(key,preference);
      return copy({preference}) as T;
    },
    async delete<T>(path:string):Promise<T> {
      preferences.delete(preferenceKey(path));
      return {deleted:true} as T;
    },
  };
  return {client,scopeKey};
}
