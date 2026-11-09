import { createHash } from 'crypto';
import { readLucyBudgetGrant, LucyBudgetGrant } from './lucyBackgroundBudget';

export type LucyBackgroundSelection = Readonly<{
  provider: 'self_hosted' | 'openai'; baseURL: string; model: string; apiKey: string;
  fingerprint: string; grant?: LucyBudgetGrant;
}>;
export class LucyBackgroundError extends Error {
  readonly status = 503;
  constructor() { super('Background AI is unavailable or its configuration changed. Ask the service operator to review the selected provider.'); }
}
const secret = (value: string | undefined) => typeof value === 'string' && value.trim().length > 0
  && value.trim().length <= 4096 && !/[\x00-\x20\x7f]/.test(value.trim()) ? value.trim() : null;
/** Explicit background-only selection. Legacy synchronous/fallback variables cannot enable this path. */
export function readLucyBackgroundSelection(env: NodeJS.ProcessEnv = process.env): LucyBackgroundSelection | null {
  if (env.LUCY_BACKGROUND_WORK_ENABLED !== 'true') return null;
  try {
    let selected: Omit<LucyBackgroundSelection, 'fingerprint'>;
    if (env.LUCY_BACKGROUND_PROVIDER === 'self_hosted') {
      const raw = env.LUCY_BACKGROUND_LLM_BASE_URL, model = env.LUCY_BACKGROUND_LLM_MODEL;
      if (!raw || raw.length > 2048 || raw !== raw.trim() || /[\x00-\x20\x7f\\]/.test(raw) || !model || !/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,199}$/.test(model)) return null;
      const url = new URL(raw);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
      if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && !url.hostname.endsWith('.railway.internal')) return null;
      // This mode must not directly target OpenAI under a misleading label. A third-party proxy
      // may still have costs/upstream providers: deployment review, not a URL, establishes independence.
      if (url.hostname.replace(/\.$/, '') === 'api.openai.com' || url.hostname.replace(/\.$/, '').endsWith('.openai.com')) return null;
      const apiKey = env.LUCY_BACKGROUND_LLM_API_KEY === undefined ? 'local-no-key' : secret(env.LUCY_BACKGROUND_LLM_API_KEY);
      if (!apiKey) return null;
      selected = { provider: 'self_hosted', baseURL: url.href.replace(/\/$/, ''), model, apiKey };
    } else if (env.LUCY_BACKGROUND_PROVIDER === 'openai') {
      const grant = readLucyBudgetGrant(env), apiKey = secret(env.OPENAI_API_KEY);
      if (!grant || !apiKey) return null;
      selected = { provider: 'openai', baseURL: 'https://api.openai.com/v1', model: grant.model, apiKey, grant };
    } else return null;
    // Never expose this digest, the endpoint, model or credentials through public capabilities.
    const fingerprint = createHash('sha256').update(JSON.stringify({ ...selected, grant: selected.grant?.fingerprint })).digest('hex');
    return Object.freeze({ ...selected, fingerprint });
  } catch { return null; }
}
export const lucyBackgroundConfigured = () => Boolean(readLucyBackgroundSelection());
export const sameLucyBackgroundSelection = (selection: LucyBackgroundSelection) => {
  const current = readLucyBackgroundSelection();
  return Boolean(current && current.fingerprint === selection.fingerprint);
};
/** Configuration only, not a live health, funding-balance, local-execution or quality assertion. */
export function lucyBackgroundCapability() {
  const selection = readLucyBackgroundSelection();
  return { configured: Boolean(selection), provider: selection?.provider ?? null, automaticPaidFallback: false };
}
