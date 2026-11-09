import { createHash, randomUUID } from 'crypto';
import { pool } from '../config/database';

// Verified 2026-11-08 against OpenAI model/pricing and prompt-caching documentation.
// USD nanodollars per token. Reserve the highest (12h cache-write) input rate,
// all allowed output (including reasoning), plus the regional 10% premium.
export const LUCY_BUDGET_RATE_CARD = 'openai-standard-2026-11-08-v1';
export const LUCY_BUDGET_RATE_EXPIRY = '2026-12-08T00:00:00.000Z';
export const LUCY_BACKGROUND_LIMITS = Object.freeze({ inputTokens: 20000, outputTokens: 4096 });
const rates = Object.freeze({
  'gpt-6.1-sol': { input: 5000n, output: 10000n },
  'gpt-6-astra': { input: 25000n, output: 50000n },
});
export type LucyBudgetGrant = {
  id: string; model: keyof typeof rates; maxUsd: string; approvedAt: string; expiresAt: string;
  maximum: bigint; fingerprint: string;
};
export class LucyBudgetError extends Error {
  readonly status = 503;
  constructor() { super('Background AI funding is unavailable. Ask the service operator to review the approved budget.'); }
}
const fail = (): never => { throw new LucyBudgetError(); };
const timestamp = (value: unknown): number => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value ? Date.parse(value) : fail();
/** An operator-supplied, finite, one-time grant. No funded defaults or automatic renewal. */
export function readLucyBudgetGrant(env: NodeJS.ProcessEnv = process.env, now = Date.now()): LucyBudgetGrant | null {
  if (env.LUCY_BACKGROUND_WORK_ENABLED !== 'true') return null;
  try {
    const raw = env.LUCY_BACKGROUND_BUDGET_GRANT;
    if (!raw || raw.length > 1000) return null;
    const value = JSON.parse(raw);
    if (!value || Array.isArray(value) || typeof value !== 'object'
      || Object.keys(value).sort().join(',') !== 'approvedAt,expiresAt,id,maxUsd,model') return null;
    const { id, model, maxUsd, approvedAt, expiresAt } = value;
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_.:-]{1,100}$/.test(id)
      || typeof model !== 'string' || !Object.hasOwn(rates, model) || typeof maxUsd !== 'string' || !/^(0|[1-9]\d{0,3})\.\d{2}$/.test(maxUsd)) return null;
    const maximum = BigInt(maxUsd.replace('.', '')) * 10000000n;
    const start = timestamp(approvedAt), end = timestamp(expiresAt);
    if (maximum <= 0n || maximum > 1000000000000n || start > now || end <= now || end <= start
      || end - start > 7 * 86400000 || end > Date.parse(LUCY_BUDGET_RATE_EXPIRY)) return null;
    const rate = rates[model as keyof typeof rates];
    const canonical = JSON.stringify({ id, model, maxUsd, approvedAt, expiresAt, rateCard: LUCY_BUDGET_RATE_CARD, rateExpiry: LUCY_BUDGET_RATE_EXPIRY,
      inputNanos: rate.input.toString(), outputNanos: rate.output.toString(), premiumPercent: 10, limits: LUCY_BACKGROUND_LIMITS });
    return Object.freeze({ id, model: model as keyof typeof rates, maxUsd, approvedAt, expiresAt, maximum, fingerprint: createHash('sha256').update(canonical).digest('hex') });
  } catch { return null; }
}
export const lucyBudgetConfigured = () => Boolean(readLucyBudgetGrant());
export function sameLucyBudgetGrant(grant: LucyBudgetGrant): boolean {
  const current = readLucyBudgetGrant();
  return Boolean(current && current.fingerprint === grant.fingerprint && current.id === grant.id && current.model === grant.model
    && current.maximum === grant.maximum && current.maxUsd === grant.maxUsd && current.approvedAt === grant.approvedAt && current.expiresAt === grant.expiresAt);
}
export function lucyReservationCost(grant: LucyBudgetGrant, inputTokens: number): bigint {
  if (!Number.isSafeInteger(inputTokens) || inputTokens < 0 || inputTokens > LUCY_BACKGROUND_LIMITS.inputTokens || !Object.hasOwn(rates, grant.model)) return fail();
  const rate = rates[grant.model];
  return ((BigInt(inputTokens) * rate.input + BigInt(LUCY_BACKGROUND_LIMITS.outputTokens) * rate.output) * 110n + 99n) / 100n;
}
/** Committed before dispatch. Never refund reservations, including crashes/cancelled/unknown outcomes. */
export async function reserveLucyBudget(grant: LucyBudgetGrant, inputTokens: number): Promise<string> {
  if (!sameLucyBudgetGrant(grant)) return fail();
  const amount = lucyReservationCost(grant, inputTokens), id = randomUUID();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='5s'");
    await client.query(`INSERT INTO lucy_inference_grants(id,fingerprint,model,maximum_nanos,approved_at,expires_at,rate_card)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING`,
      [grant.id, grant.fingerprint, grant.model, grant.maximum.toString(), grant.approvedAt, grant.expiresAt, LUCY_BUDGET_RATE_CARD]);
    // This atomic conditional update serializes all processes sharing the grant.
    const held = await client.query(`UPDATE lucy_inference_grants SET reserved_nanos=reserved_nanos+$3::bigint
      WHERE id=$1 AND fingerprint=$2 AND NOT blocked AND approved_at<=clock_timestamp() AND expires_at>clock_timestamp()
      AND maximum_nanos=$4::bigint AND model=$5 AND approved_at=$6::timestamptz AND expires_at=$7::timestamptz AND rate_card=$8
      AND reserved_nanos+$3::bigint<=maximum_nanos RETURNING id`, [grant.id, grant.fingerprint, amount.toString(), grant.maximum.toString(), grant.model, grant.approvedAt, grant.expiresAt, LUCY_BUDGET_RATE_CARD]);
    if (held.rows.length !== 1 || !sameLucyBudgetGrant(grant)) return fail();
    await client.query(`INSERT INTO lucy_inference_reservations(id,grant_id,reserved_nanos,input_tokens,output_limit)
      VALUES($1,$2,$3,$4,$5)`, [id, grant.id, amount.toString(), inputTokens, LUCY_BACKGROUND_LIMITS.outputTokens]);
    await client.query('COMMIT');
    return id;
  } catch {
    // An uncertain COMMIT is never followed by provider dispatch or a retry here.
    await client.query('ROLLBACK').catch(() => undefined);
    return fail();
  } finally { client.release(); }
}
/** Recheck durable revocation/expiry after token counting, immediately before inference. */
export async function lucyReservationActive(grant: LucyBudgetGrant, id: string): Promise<boolean> {
  if (!sameLucyBudgetGrant(grant)) return false;
  const result = await pool.query(`SELECT r.id FROM lucy_inference_reservations r JOIN lucy_inference_grants g ON g.id=r.grant_id
    WHERE r.id=$1 AND g.id=$2 AND g.fingerprint=$3 AND r.outcome='reserved' AND NOT g.blocked
    AND g.approved_at<=clock_timestamp() AND g.expires_at>clock_timestamp()
    AND g.maximum_nanos=$4::bigint AND g.model=$5 AND g.approved_at=$6::timestamptz AND g.expires_at=$7::timestamptz AND g.rate_card=$8`,
    [id, grant.id, grant.fingerprint, grant.maximum.toString(), grant.model, grant.approvedAt, grant.expiresAt, LUCY_BUDGET_RATE_CARD]);
  return result.rows.length === 1 && sameLucyBudgetGrant(grant);
}
/** No prompts, company data, credentials, or provider error bodies enter this operator-only ledger. */
export async function finishLucyReservation(grant: LucyBudgetGrant, id: string, outcome: 'completed' | 'incomplete' | 'uncertain' | 'not_dispatched', usage?: { input: number; output: number }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='5s'");
    // A provider anomaly blocks the whole grant. Its reservation stays consumed.
    if (outcome === 'uncertain') await client.query('UPDATE lucy_inference_grants SET blocked=true WHERE id=$1 AND fingerprint=$2', [grant.id, grant.fingerprint]);
    const result = await client.query(`UPDATE lucy_inference_reservations SET outcome=$3,observed_input_tokens=$4,observed_output_tokens=$5,finished_at=clock_timestamp()
      WHERE id=$1 AND grant_id=$2 AND outcome='reserved' RETURNING id`, [id, grant.id, outcome, usage?.input ?? null, usage?.output ?? null]);
    if (result.rows.length !== 1) return fail();
    await client.query('COMMIT');
  } catch { await client.query('ROLLBACK').catch(() => undefined); return fail(); }
  finally { client.release(); }
}
