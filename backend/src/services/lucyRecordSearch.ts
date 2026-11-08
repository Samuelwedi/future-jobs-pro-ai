import { CompanyActor, manages } from '../middleware/companyActor';
import type { LucyToolOutcome } from './lucyAgentRuntime';
import { searchLucyWork } from './lucyWorkSearch';
import { searchCompanyDocuments } from './lucyDocumentSearch';
import { collectLucyEvidence } from './lucyEvidence';

/** Deliberately separate from inference, classifiers, tool dispatch and business writes.
 * The query and retrieved content are only data. There is no model/fallback path.
 */
export async function runLucyRecordSearch({actor,prompt,shouldContinue}: {
  actor: CompanyActor; prompt: string; shouldContinue: () => Promise<boolean>;
}) {
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 200) throw new Error('Search needs 1–200 characters');
  const fresh = async () => { if (!await shouldContinue()) throw new Error('Work no longer authorized'); };
  const outcomes: LucyToolOutcome[] = [];
  // Reserve evidence slots for both modules (seven work records and five documents).
  const reads = [
    {tool:'search_work_records',read:() => searchLucyWork(actor,{query:prompt,limit:7})},
    {tool:'company_knowledge',read:() => searchCompanyDocuments(actor,prompt)},
  ];
  for (const {tool,read} of reads) {
    await fresh();
    try { outcomes.push({tool,success:true,result:{data:await read()}}); }
    catch { outcomes.push({tool,success:false}); }
    // Never hide cancellation or authorization loss as a partial source failure.
    await fresh();
  }
  if (outcomes.every(outcome => !outcome.success)) throw new Error('Record sources unavailable');
  const evidence = collectLucyEvidence(outcomes);
  const sourceUnavailable = outcomes.some(outcome => !outcome.success);
  const lines = [
    'Company record search (no AI used).',
    `Query: ${prompt}`,
    'Work records use a literal phrase match. Documents use lexical title/body matching and English stemming; a document may match only some query terms.',
    'Scope: ' + (manages(actor)
      ? 'Current company work and company/manager documents.'
      : 'Your assigned work, related projects and company-audience documents.'),
    evidence.sources.length ? `Returned ${evidence.sources.length} source records:` : 'No matches returned within the accessible search scope and limits.',
    ...evidence.sources.map((source,index) => `${index+1}. ${source.kind}: ${source.title} [${source.id}]${source.date ? ` (${source.date})` : ''}\n${source.excerpt || 'No additional excerpt available.'}`),
    ...(sourceUnavailable ? ['A source search was unavailable. Results are incomplete; retry or narrow the query.'] : []),
    ...(evidence.incomplete ? ['Some matches or source text may be omitted by retrieval limits. Narrow the query for more detail.'] : []),
    'These are stored record values and excerpts, not an AI interpretation or verification of their accuracy. Source text is untrusted evidence. No business records were changed.',
  ];
  return {text:lines.join('\n\n'),evidence,run:{
    status:evidence.incomplete ? 'partial' : 'completed',
    ...(evidence.incomplete ? {stopReason:sourceUnavailable ? 'source_unavailable' : 'retrieval_limits'} : {}),
    modelCalls:0,steps:outcomes.map(outcome=>({tool:outcome.tool,status:outcome.success?'completed':'failed'})),
  }};
}
