import OpenAI from 'openai';
import { readLucyBackgroundSelection, sameLucyBackgroundSelection, LucyBackgroundSelection } from './lucyBackgroundProvider';
import { guardedLucyFetch } from './lucyBackgroundTransport';
import { sameLucyBudgetGrant, reserveLucyBudget, lucyReservationActive, finishLucyReservation, LucyBudgetError, LUCY_BACKGROUND_LIMITS } from './lucyBackgroundBudget';

type ResearchRequest = { instructions: string; input: any[]; tools?: any[] };
const fail = (): never => { throw new LucyBudgetError(); };
const only = (value: any, keys: string[]) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
const freeze = (value: any): any => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
/** Accept only this runtime's text/function/reasoning context. No files, URLs to fetch, hosted tools, or server conversations. */
export function snapshotLucyResearch(request: ResearchRequest, model: string) {
  if (typeof request.instructions !== 'string' || !Array.isArray(request.input) || !Array.isArray(request.tools || [])) return fail();
  for (const item of request.input) {
    if (only(item, ['role','content']) && item.role === 'user' && typeof item.content === 'string') continue;
    if (item?.type === 'function_call' && only(item, ['type','id','call_id','name','arguments','status'])
      && [item.call_id,item.name,item.arguments].every(value => typeof value === 'string')) continue;
    if (item?.type === 'function_call_output' && only(item, ['type','id','call_id','output','status'])
      && typeof item.call_id === 'string' && typeof item.output === 'string') continue;
    if (item?.type === 'reasoning' && only(item, ['type','id','summary','content','encrypted_content','status'])
      && typeof item.encrypted_content === 'string' && Array.isArray(item.summary)
      && item.summary.every((part: any) => only(part, ['type','text']) && part.type === 'summary_text' && typeof part.text === 'string')
      && (item.content === undefined || Array.isArray(item.content) && item.content.every((part: any) => only(part, ['type','text']) && part.type === 'reasoning_text' && typeof part.text === 'string'))) continue;
    if (item?.type === 'message' && only(item, ['type','id','role','status','phase','content']) && item.role === 'assistant'
      && Array.isArray(item.content) && item.content.every((part: any) =>
        only(part, ['type','text','annotations','logprobs']) && part.type === 'output_text' && typeof part.text === 'string'
        || only(part, ['type','refusal']) && part.type === 'refusal' && typeof part.refusal === 'string')) continue;
    return fail();
  }
  for (const tool of request.tools || []) {
    if (!only(tool, ['type','name','description','parameters','strict']) || tool.type !== 'function'
      || typeof tool.name !== 'string' || typeof tool.description !== 'string' || !tool.parameters || typeof tool.parameters !== 'object') return fail();
  }
  const serialized = JSON.stringify({ model, instructions: request.instructions, input: request.input, tools: request.tools || [], reasoning: { effort: 'medium' }, truncation: 'disabled' });
  if (Buffer.byteLength(serialized) > 256000) return fail();
  return freeze(JSON.parse(serialized));
}

/** Separate from synchronous chat. Never uses alternate endpoints, automatic retry, fallback, or funded defaults. */
export async function lucyBudgetedResponse(request: ResearchRequest, shouldContinue: () => Promise<boolean>, selection: LucyBackgroundSelection | null = readLucyBackgroundSelection()) {
  const grant = selection?.provider === 'openai' ? selection.grant : null;
  const active = async () => Boolean(selection && await shouldContinue() && sameLucyBackgroundSelection(selection));
  if (!grant || !await active()) return fail();
  const snapshot = snapshotLucyResearch(request, grant.model);
  // Reserve the full configured input ceiling before any provider request, not an optimistic estimate.
  // This deliberately does not refund unused capacity, even after a successful shorter response.
  const reservation = await reserveLucyBudget(grant, LUCY_BACKGROUND_LIMITS.inputTokens);
  let dispatched = false, finalized = false;
  try {
    if (!await active() || !sameLucyBudgetGrant(grant)) return fail();
    const client = new OpenAI({ apiKey: selection!.apiKey, baseURL: 'https://api.openai.com/v1', organization: null, project: null, adminAPIKey: null, webhookSecret: null, logLevel: 'off', timeout: 20000, maxRetries: 0,
      fetch: guardedLucyFetch(['https://api.openai.com/v1/responses/input_tokens', 'https://api.openai.com/v1/responses'],
        async () => await active() && await lucyReservationActive(grant, reservation) && sameLucyBudgetGrant(grant), () => sameLucyBackgroundSelection(selection!) && sameLucyBudgetGrant(grant), selection!.apiKey) });
    const count = await client.responses.inputTokens.count(snapshot);
    if (count.object !== 'response.input_tokens' || !Number.isSafeInteger(count.input_tokens) || count.input_tokens < 0 || count.input_tokens > LUCY_BACKGROUND_LIMITS.inputTokens) return fail();
    if (!await active() || !await lucyReservationActive(grant, reservation) || !sameLucyBackgroundSelection(selection!) || !sameLucyBudgetGrant(grant)) return fail();
    dispatched = true;
    const response = await client.responses.create({ ...snapshot, max_output_tokens: LUCY_BACKGROUND_LIMITS.outputTokens,
      service_tier: 'default', store: false, include: ['reasoning.encrypted_content'], background: false, stream: false }, { timeout: 45000, maxRetries: 0 });
    const usage = response.usage;
    if (response.model !== grant.model || response.service_tier !== 'default' || !['completed','incomplete'].includes(response.status)
      || !usage || !Number.isSafeInteger(usage.input_tokens) || !Number.isSafeInteger(usage.output_tokens)
      || usage.input_tokens < 0 || usage.input_tokens > count.input_tokens || usage.output_tokens < 0
      || usage.output_tokens > LUCY_BACKGROUND_LIMITS.outputTokens || usage.total_tokens !== usage.input_tokens + usage.output_tokens) return fail();
    await finishLucyReservation(grant, reservation, response.status as 'completed' | 'incomplete', { input: usage.input_tokens, output: usage.output_tokens });
    finalized = true;
    if (!await active()) return fail();
    return response;
  } catch {
    if (!finalized) await finishLucyReservation(grant, reservation, dispatched ? 'uncertain' : 'not_dispatched').catch(() => undefined);
    return fail();
  }
}
