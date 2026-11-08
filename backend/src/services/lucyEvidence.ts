import type { LucyToolOutcome } from './lucyAgentRuntime';

export type LucySource = {kind:'document'|'task'|'project'|'schedule';id:string;title:string;excerpt:string;retrievedAt:string;date?:string};
export type LucyEvidence = {sources:LucySource[];incomplete:boolean};
const kinds = new Set(['task','project','schedule']);
const plain = (value:unknown) => typeof value==='string' ? value : '';
const timestamp = (value:unknown):string|undefined => {
  if(!(value instanceof Date) && typeof value!=='string')return;
  const date=new Date(value);return Number.isFinite(date.getTime())?date.toISOString():undefined;
};

/** Evidence comes only from successful authorized tool results, never model-authored citations.
 * Rendering clients must treat all titles and passages as inert text, not instructions or HTML.
 * This is retrieved evidence, not a guarantee that every claim in the answer is supported.
 */
export function collectLucyEvidence(outcomes:LucyToolOutcome[],retrievedAt=new Date().toISOString()):LucyEvidence {
  const result:LucyEvidence={sources:[],incomplete:false};
  const seen=new Set<string>();
  const add=(kind:LucySource['kind'],row:any,excerpt:string,time:string,date?:string)=>{
    const id=plain(row?.id),title=plain(row?.title).trim();
    if(!id||id.length>200){result.incomplete=true;return;}
    const key=kind+':'+id;if(seen.has(key))return;seen.add(key);
    if(result.sources.length>=12){result.incomplete=true;return;}
    if(title.length>200||excerpt.length>1200||row?.excerptTruncated===true||row?.titleTruncated===true||row?.bodyTruncated===true||row?.truncated===true)result.incomplete=true;
    result.sources.push({kind,id,title:(title||`${kind} ${id}`).slice(0,200),excerpt:excerpt.slice(0,1200),retrievedAt:time,...(date?{date}:{})});
  };
  for(const outcome of outcomes){
    if(!['company_knowledge','search_work_records'].includes(outcome.tool))continue;
    if(!outcome.success){result.incomplete=true;continue;}
    const data=outcome.result?.data;
    if(!data || typeof data!=='object'){result.incomplete=true;continue;}
    if(data.hasMore===true||data.incomplete===true||data.truncated===true)result.incomplete=true;
    const time=timestamp(data.retrievedAt)||timestamp(data.retrieval?.retrievedAt)||timestamp(retrievedAt)||new Date().toISOString();
    const rows=outcome.tool==='company_knowledge'?data.sources:data.records;
    if(!Array.isArray(rows)){result.incomplete=true;continue;}
    for(const row of rows){
      if(outcome.tool==='company_knowledge')add('document',row,plain(row?.excerpt),time,timestamp(row?.createdAt));
      else if(kinds.has(row?.kind)){
        const details=row?.details||{};
        const excerpt=[['Status',row?.status],['Assigned to',details.assignedTo],['Client',details.client],['Project',details.project],['Date',details.date],['Start',details.startTime],['End',details.endTime]]
          .filter(([,value])=>typeof value==='string'&&value.length>0).map(([label,value])=>`${label}: ${value}`).join('. ');
        add(row.kind,row,excerpt,time,timestamp(details.date)||timestamp(details.createdAt));
      }else result.incomplete=true;
    }
  }
  return result;
}
