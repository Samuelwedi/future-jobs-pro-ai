import OpenAI from 'openai';
import { compatibleMessages, compatibleResponse } from './lucyInference';
import { lucyBudgetedResponse, snapshotLucyResearch } from './lucyBudgetedInference';
import { LucyBackgroundError, LucyBackgroundSelection, sameLucyBackgroundSelection } from './lucyBackgroundProvider';
import { guardedLucyFetch } from './lucyBackgroundTransport';
import { LUCY_BACKGROUND_LIMITS } from './lucyBackgroundBudget';

type Request = { instructions: string; input: any[]; tools?: any[] };
/** Keep assistant text and tool calls together before their tool-result messages. */
export function backgroundCompatibleMessages(instructions: string, input: any[]) {
  const messages: any[] = [];
  for (const item of compatibleMessages(instructions, input)) {
    const prior = messages.at(-1);
    if (item.role === 'assistant' && prior?.role === 'assistant') {
      prior.content = [prior.content, item.content].filter(Boolean).join('\n') || null;
      if (item.tool_calls) prior.tool_calls = [...(prior.tool_calls || []), ...item.tool_calls];
    } else messages.push(item);
  }
  return messages;
}
/** The caller pins one selection for the entire research run, including tool-result turns. */
export async function lucyBackgroundResponse(request: Request, shouldContinue: () => Promise<boolean>, selection: LucyBackgroundSelection) {
  const active = async () => Boolean(selection && await shouldContinue() && sameLucyBackgroundSelection(selection));
  if (!await active()) throw new LucyBackgroundError();
  if (selection.provider === 'openai') return lucyBudgetedResponse(request, shouldContinue, selection);
  try {
    const snapshot = snapshotLucyResearch(request, selection.model);
    // Responses-only encrypted reasoning cannot be translated to a compatible chat provider.
    if (snapshot.input.some((item: any) => item.type === 'reasoning')) throw new LucyBackgroundError();
    const client = new OpenAI({ apiKey: selection.apiKey, baseURL: selection.baseURL, organization: null, project: null, adminAPIKey: null, webhookSecret: null, logLevel: 'off',
      timeout: 45000, maxRetries: 0, fetch: guardedLucyFetch([selection.baseURL + '/chat/completions'], active, () => sameLucyBackgroundSelection(selection), selection.apiKey) });
    const response = await client.chat.completions.create({ model: selection.model, messages: backgroundCompatibleMessages(snapshot.instructions, snapshot.input),
      max_tokens: LUCY_BACKGROUND_LIMITS.outputTokens, stream: false,
      ...(snapshot.tools.length ? { tools: snapshot.tools.map(({ name, description, parameters, strict }) => ({ type: 'function' as const, function: { name, description, parameters, strict } })) } : {}) });
    if (!await active()) throw new LucyBackgroundError();
    if (response.model !== selection.model || !Array.isArray(response.choices) || response.choices.length !== 1) throw new LucyBackgroundError();
    const message = response.choices[0]?.message;
    if (!message || message.role !== 'assistant' || message.content != null && typeof message.content !== 'string'
      || message.refusal != null && typeof message.refusal !== 'string'
      || message.function_call != null || message.audio != null) throw new LucyBackgroundError();
    const calls = message.tool_calls ?? [];
    if (!Array.isArray(calls) || calls.length > 24) throw new LucyBackgroundError();
    const ids = new Set<string>();
    for (const call of calls as any[]) {
      if (call?.type !== 'function' || typeof call.id !== 'string' || !call.id || call.id.length > 200 || ids.has(call.id)
        || typeof call.function?.name !== 'string' || !call.function.name || call.function.name.length > 100
        || typeof call.function.arguments !== 'string' || call.function.arguments.length > 12000) throw new LucyBackgroundError();
      ids.add(call.id);
    }
    return compatibleResponse(response, selection.model);
  } catch { throw new LucyBackgroundError(); } // Never use lucyResponse or its legacy paid-fallback behavior.
}
