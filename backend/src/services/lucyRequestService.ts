import { createHash, randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { pool } from '../config/database';
import type { CompanyActor } from '../middleware/companyActor';

export const LUCY_REQUEST_RESPONSE_MAX_BYTES = 128000;
export const LUCY_REQUEST_RESPONSE_RETENTION_HOURS = 24;
const uncertainMessage = 'The outcome of this request could not be verified. Check existing records before starting another request; this request will not run again.';
const expiredMessage = 'The saved response has expired. This request will not run again. Check existing records before starting another request.';

/** Safe for public responses. Never includes provider errors, SQL, or user content. */
export class LucyRequestError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export type LucyRequestClaim = { requestId: string; token: string };
export type LucyRequestResponse = { statusCode: number; body: Record<string, unknown> };
export type LucyRequestStatus = {
  requestId: string;
  status: 'processing' | 'completed' | 'uncertain' | 'expired';
  replayable: boolean;
  retryAllowed: false;
  response: LucyRequestResponse | null;
  message: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  completedAt: Date | string | null;
  responseExpiresAt: Date | string | null;
};
export type LucyRequestBegin =
  | { kind: 'untracked' }
  | { kind: 'claimed'; claim: LucyRequestClaim; request: LucyRequestStatus }
  | { kind: 'replay'; response: LucyRequestResponse; request: LucyRequestStatus }
  | { kind: 'blocked'; request: LucyRequestStatus };

function requestIdOf(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_.:-]{1,100}$/.test(value)) {
    throw new LucyRequestError(400, 'invalid_request_id', 'requestId must contain 1–100 letters, numbers, underscores, periods, colons or hyphens.');
  }
  return value;
}

function payloadHash(input: { message: unknown; language?: unknown; channel?: unknown }): string {
  if (typeof input.message !== 'string' || !input.message.trim() || input.message.trim().length > 8000) {
    throw new LucyRequestError(400, 'invalid_message', 'Message must contain 1–8,000 characters.');
  }
  const optional = (value: unknown, name: string, max: number) => {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string' || value.length > max) {
      throw new LucyRequestError(400, 'invalid_request_payload', `${name} must be a short string.`);
    }
    return value;
  };
  // Explicit tuple/version avoids key-order and concatenation ambiguity. Only
  // message trimming matches the route's normalization; other differences conflict.
  return createHash('sha256').update(JSON.stringify([
    1, input.message.trim(), optional(input.language, 'language', 32), optional(input.channel, 'channel', 64),
  ])).digest('hex');
}

function publicRequest(row: any): LucyRequestStatus {
  const completed = row.status === 'completed';
  return {
    requestId: row.request_id, status: row.status, replayable: completed, retryAllowed: false,
    response: completed ? { statusCode: row.response_status, body: row.response_body } : null,
    message: row.status === 'uncertain' ? uncertainMessage : row.status === 'expired' ? expiredMessage
      : row.status === 'processing' ? 'This request is processing or its outcome has not been recorded. It will not run again. Check its status rather than submitting it as a new request.' : null,
    createdAt: row.created_at, updatedAt: row.updated_at, completedAt: row.completed_at,
    responseExpiresAt: row.response_expires_at,
  };
}

/** Short transactions only. Never hold a database lock during inference or writes. */
async function asActor<T>(actor: CompanyActor, action: (client: PoolClient) => Promise<T>): Promise<T> {
  let client: PoolClient | undefined;
  let actorVerified = false;
  let discardClient = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const result = await client.query(`SELECT id FROM users WHERE id=$1 AND company_id=$2
      AND LOWER(COALESCE(role,'employee'))=$3 AND COALESCE(is_active,TRUE)=TRUE FOR UPDATE`, [actor.id, actor.company_id, actor.role]);
    if (!result.rows.length) throw new LucyRequestError(401, 'actor_unavailable', 'Your account or access has changed. Sign in again before continuing.');
    actorVerified = true;
    const value = await action(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => { discardClient = true; });
    if (error instanceof LucyRequestError) throw error;
    if (!actorVerified) throw new LucyRequestError(503, 'actor_verification_unavailable', 'Your current access could not be verified. Check this request status when access is available; do not start the action again.');
    throw new LucyRequestError(503, 'request_store_unavailable', 'Request status could not be saved or verified. Do not resubmit this action with a new requestId; check its status first.');
  } finally { client?.release(discardClient ? new Error('Request transaction connection is unusable') : undefined); }
}

async function expireActorResponses(client: PoolClient, actor: CompanyActor): Promise<void> {
  await client.query(`UPDATE lucy_request_ledger SET status='expired',response_body=NULL,response_status=NULL,
    error_code='response_expired',updated_at=now() WHERE company_id=$1 AND user_id=$2
    AND status='completed' AND response_expires_at<=now()`, [actor.company_id, actor.id]);
}

/**
 * Claim BEFORE any inference, conversation insert, or business mutation. Only
 * 'claimed' authorizes this request to execute; never execute 'blocked' or 'replay'.
 * Missing IDs preserve legacy routes. A present but invalid ID is never bypassed.
 * There is deliberately no lease, automatic retry, delete, reset, or takeover API.
 */
export async function beginLucyRequest(actor: CompanyActor, input: {
  requestId?: unknown; message: unknown; language?: unknown; channel?: unknown;
}): Promise<LucyRequestBegin> {
  if (input.requestId === undefined || input.requestId === null) return { kind: 'untracked' };
  const requestId = requestIdOf(input.requestId);
  const hash = payloadHash(input);
  return asActor(actor, async client => {
    await expireActorResponses(client, actor);
    const token = randomUUID();
    const inserted = await client.query(`INSERT INTO lucy_request_ledger
      (id,company_id,user_id,actor_role,request_id,payload_hash,claim_token)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(company_id,user_id,request_id) DO NOTHING RETURNING *`,
    [randomUUID(), actor.company_id, actor.id, actor.role, requestId, hash, token]);
    if (inserted.rows[0]) return { kind: 'claimed', claim: { requestId, token }, request: publicRequest(inserted.rows[0]) };
    const prior = await client.query('SELECT * FROM lucy_request_ledger WHERE company_id=$1 AND user_id=$2 AND request_id=$3',
      [actor.company_id, actor.id, requestId]);
    const row = prior.rows[0];
    if (!row) throw new LucyRequestError(503, 'request_store_unavailable', 'Request status could not be verified. Do not start this action again.');
    if (row.actor_role !== actor.role) throw new LucyRequestError(409, 'request_scope_conflict', 'requestId belongs to a previous authorization context.');
    if (row.payload_hash !== hash) throw new LucyRequestError(409, 'request_payload_conflict', 'requestId was already used for a different request.');
    const request = publicRequest(row);
    return request.response ? { kind: 'replay', response: request.response, request } : { kind: 'blocked', request };
  });
}

/** Role-scoped GET. Never expose another user's/company's or previous-role result. */
export async function getLucyRequest(actor: CompanyActor, requestId: unknown): Promise<LucyRequestStatus> {
  const id = requestIdOf(requestId);
  return asActor(actor, async client => {
    await expireActorResponses(client, actor);
    const result = await client.query(`SELECT * FROM lucy_request_ledger
      WHERE company_id=$1 AND user_id=$2 AND actor_role=$3 AND request_id=$4`, [actor.company_id, actor.id, actor.role, id]);
    if (!result.rows[0]) throw new LucyRequestError(404, 'request_not_found', 'Request not found.');
    return publicRequest(result.rows[0]);
  });
}

/**
 * Store a successful HTTP response before publication. Partial business outcomes
 * can still be a successful response containing the original action receipts.
 * Failure to save is NOT evidence that business actions failed or can be retried.
 */
export async function completeLucyRequest(actor: CompanyActor, claim: LucyRequestClaim, response: LucyRequestResponse): Promise<LucyRequestStatus> {
  const id = requestIdOf(claim.requestId);
  return asActor(actor, async client => {
    // Access takes precedence over serialization errors so callers cannot publish
    // fallback receipts to an actor whose permissions changed mid-request.
    let serialized: string;
    try {
      if (!Number.isInteger(response.statusCode) || response.statusCode < 200 || response.statusCode > 299
        || !response.body || typeof response.body !== 'object' || Array.isArray(response.body)) throw new Error();
      serialized = JSON.stringify(response.body);
      if (!serialized || Buffer.byteLength(serialized, 'utf8') > LUCY_REQUEST_RESPONSE_MAX_BYTES) throw new Error();
      const decoded = JSON.parse(serialized);
      if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new Error();
    } catch {
      throw new LucyRequestError(413, 'response_not_retainable', 'The response could not be retained safely. Check existing records before starting another request.');
    }
    // PostgreSQL JSONB may add spaces compared with JSON.stringify. Check the
    // stored representation too, so the database bound and the API agree.
    const size = await client.query('SELECT octet_length($1::jsonb::text) AS bytes', [serialized]);
    if (Number(size.rows[0].bytes) > LUCY_REQUEST_RESPONSE_MAX_BYTES) {
      throw new LucyRequestError(413, 'response_not_retainable', 'The response could not be retained safely. Check existing records before starting another request.');
    }
    const result = await client.query(`UPDATE lucy_request_ledger SET status='completed',response_body=$6::jsonb,
      response_status=$7,error_code=NULL,updated_at=now(),completed_at=now(),response_expires_at=now()+($8::integer*interval '1 hour')
      WHERE company_id=$1 AND user_id=$2 AND actor_role=$3 AND request_id=$4 AND claim_token=$5 AND status='processing' RETURNING *`,
    [actor.company_id, actor.id, actor.role, id, claim.token, serialized, response.statusCode, LUCY_REQUEST_RESPONSE_RETENTION_HOURS]);
    if (!result.rows[0]) throw new LucyRequestError(409, 'claim_inactive', 'This request is no longer available for completion. Check its status before taking further action.');
    return publicRequest(result.rows[0]);
  });
}

/** Never accepts an Error/message: raw provider or database details are not stored. */
export async function markLucyRequestUncertain(actor: CompanyActor, claim: LucyRequestClaim): Promise<LucyRequestStatus> {
  const id = requestIdOf(claim.requestId);
  return asActor(actor, async client => {
    await expireActorResponses(client, actor);
    await client.query(`UPDATE lucy_request_ledger SET status='uncertain',error_code='outcome_uncertain',
      response_body=NULL,response_status=NULL,updated_at=now(),completed_at=now()
      WHERE company_id=$1 AND user_id=$2 AND actor_role=$3 AND request_id=$4 AND claim_token=$5 AND status='processing'`,
    [actor.company_id, actor.id, actor.role, id, claim.token]);
    // An ambiguous COMMIT can already have saved completion. Never overwrite it.
    const result = await client.query(`SELECT * FROM lucy_request_ledger WHERE company_id=$1 AND user_id=$2
      AND actor_role=$3 AND request_id=$4 AND claim_token=$5`, [actor.company_id, actor.id, actor.role, id, claim.token]);
    if (!result.rows[0]) throw new LucyRequestError(409, 'claim_inactive', 'This request claim is no longer valid.');
    return publicRequest(result.rows[0]);
  });
}

/**
 * Optional maintenance hook for an existing scheduler. Clears response content
 * globally, but retains key/hash tombstones indefinitely. No execution is resumed.
 * Until called, TTL is enforced and content removed lazily for the requesting actor.
 */
export async function pruneExpiredLucyResponses(): Promise<number> {
  try {
    const result = await pool.query(`UPDATE lucy_request_ledger SET status='expired',response_body=NULL,response_status=NULL,
      error_code='response_expired',updated_at=now() WHERE status='completed' AND response_expires_at<=now()`);
    return result.rowCount || 0;
  } catch {
    throw new LucyRequestError(503, 'request_store_unavailable', 'Expired responses could not be removed.');
  }
}
