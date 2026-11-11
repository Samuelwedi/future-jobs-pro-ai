import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../config/database';
import { hasComplimentaryAccess } from './complimentaryAccess';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const VERSION = 1;
export type TextIdentity = {
  userId: string;
  requestCompanyId: string | null;
  claimedCompanyId: string | null;
  expiresAt?: number;
  notBefore?: number;
};
type TextRequest = { roomId: string; requestKey: string; expectedCompanyId: string; expectedActorId: string; message: string };
type TextStatus = Omit<TextRequest, 'message'>;
export class ChatTextError extends Error {
  constructor(public status: number, public code: string, message: string, public request?: ReturnType<typeof receiptIdentity> & { state: 'missing' | 'unavailable' }) { super(message); }
}
function invalid(): never {
  throw new ChatTextError(400, 'CHAT_REQUEST_INVALID', 'Valid roomId, message, requestKey, expectedCompanyId and expectedActorId are required.');
}
export function hasTextRequestKey(value: unknown): boolean {
  return value !== null && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'requestKey');
}
function validString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max
    && !value.includes('\0') && Buffer.from(value, 'utf8').toString('utf8') === value;
}
function parseScope(roomId: unknown, requestKey: unknown, expectedCompanyId: unknown, expectedActorId: unknown): TextStatus {
  if (!validString(roomId, 255) || roomId.trim() !== roomId
    || typeof requestKey !== 'string' || requestKey.trim() !== requestKey || !KEY.test(requestKey)
    || typeof expectedCompanyId !== 'string' || expectedCompanyId.length !== 36 || !UUID.test(expectedCompanyId)
    || typeof expectedActorId !== 'string' || expectedActorId.length !== 36 || !UUID.test(expectedActorId)) return invalid();
  if (roomId.startsWith('support-ticket-')) {
    throw new ChatTextError(400, 'CHAT_REQUEST_SUPPORT_UNSUPPORTED', 'Request keys are not supported for support conversations.');
  }
  return { roomId, requestKey, expectedCompanyId, expectedActorId };
}
export function parseTextRequest(value: any): TextRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !['roomId', 'message', 'requestKey', 'expectedCompanyId', 'expectedActorId'].includes(key))
    || !validString(value.message, 5000) || !value.message.trim()) return invalid();
  return { ...parseScope(value.roomId, value.requestKey, value.expectedCompanyId, value.expectedActorId), message: value.message.trim() };
}
export function parseTextStatus(roomId: unknown, requestKey: unknown, query: Record<string, unknown>): TextStatus {
  if (Object.keys(query).length !== 2 || !Object.prototype.hasOwnProperty.call(query, 'expectedCompanyId')
    || !Object.prototype.hasOwnProperty.call(query, 'expectedActorId')) return invalid();
  return parseScope(roomId, requestKey, query.expectedCompanyId, query.expectedActorId);
}
function fingerprint(roomId: string, message: string): string {
  // No Unicode normalization or delimiter ambiguity. Changing this encoding needs
  // a new version and replay support for all persisted versions, never a reset.
  return createHash('sha256').update(JSON.stringify(['chat-text', VERSION, roomId, message]), 'utf8').digest('hex');
}
function assertToken(identity: TextIdentity): void {
  const now = Date.now() / 1000;
  if (typeof identity.userId !== 'string' || identity.userId.length !== 36 || !UUID.test(identity.userId) || (identity.expiresAt !== undefined
    && (!Number.isFinite(identity.expiresAt) || now >= identity.expiresAt))
    || (identity.notBefore !== undefined && (!Number.isFinite(identity.notBefore) || now < identity.notBefore))) {
    throw new ChatTextError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
  }
}
async function authorize(client: PoolClient, identity: TextIdentity, input: TextStatus): Promise<() => void> {
  assertToken(identity);
  // A persisted request belongs to its original account. A different valid token
  // from the same company must not create or recover that account's request.
  // The expected actor only constrains authenticated identity; it never sets it.
  if (identity.userId !== input.expectedActorId) {
    throw new ChatTextError(403, 'CHAT_REQUEST_OWNER_MISMATCH', 'This request does not match the signed-in account.');
  }
  // These shared row locks conflict with updates/deletes of all current policy
  // inputs. Request-start, JWT/connection and persisted company are independent
  // constraints. The caller-supplied expected company can only narrow access.
  const row = (await client.query(`SELECT u.id, u.company_id,
      COALESCE((to_jsonb(u)->>'must_change_password')::boolean,FALSE) AS password_required,
      LOWER(COALESCE(c.subscription_status,'inactive')) AS subscription_status,
      COALESCE(c.subscription_current_period_end,c.subscription_expires_at) AS entitlement_ends_at
    FROM users u JOIN companies c ON c.id=u.company_id
    WHERE u.id=$1 AND COALESCE(u.is_active,TRUE)=TRUE
      AND COALESCE(NULLIF(to_jsonb(c)->>'is_active','')::boolean,TRUE)=TRUE
      AND u.company_id=$2::uuid
      AND ($3::text IS NULL OR u.company_id::text=$3)
      AND ($4::text IS NULL OR u.company_id::text=$4)
    FOR SHARE OF u,c`, [identity.userId, input.expectedCompanyId,
    identity.requestCompanyId, identity.claimedCompanyId])).rows[0];
  if (!row) throw new ChatTextError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
  if (row.password_required) throw new ChatTextError(403, 'PASSWORD_CHANGE_REQUIRED', 'Change your temporary password before continuing.');
  const [sponsorId, sponsorCompany, extra] = (process.env.COMPLIMENTARY_TESTER_IDENTITY || '').trim().toLowerCase().split(':');
  let complimentary = false;
  if (!extra && sponsorId && sponsorCompany === input.expectedCompanyId && hasComplimentaryAccess(sponsorId, sponsorCompany)) {
    complimentary = Boolean((await client.query(`SELECT id FROM users
      WHERE id=$1 AND company_id=$2 AND COALESCE(is_active,TRUE)=TRUE
        AND LOWER(role) IN ('boss','owner') FOR SHARE`, [sponsorId, input.expectedCompanyId])).rowCount);
  }
  const recheckTime = () => {
    assertToken(identity);
    // Same JS Date/millisecond/finite semantics as the subscription gate.
    const end = row.entitlement_ends_at ? new Date(row.entitlement_ends_at) : null;
    const entitled = complimentary || (['active', 'trialing'].includes(row.subscription_status)
      && (end ? Number.isFinite(end.getTime()) && end.getTime() > Date.now() : row.subscription_status === 'active'));
    if (!entitled) throw new ChatTextError(402, 'SUBSCRIPTION_REQUIRED', 'An active subscription or trial is required to use this feature.');
  };
  recheckTime();
  // Writers touch updated_at, so take the update lock immediately instead of
  // upgrading a shared room lock (which can deadlock concurrent room sends).
  const room = (await client.query('SELECT company_id FROM chat_rooms WHERE id=$1 FOR UPDATE', [input.roomId])).rows[0];
  if (!room || String(room.company_id) !== input.expectedCompanyId) {
    throw new ChatTextError(403, 'CHAT_ACCESS_DENIED', 'Forbidden');
  }
  const member = await client.query('SELECT user_id FROM chat_room_members WHERE room_id=$1 AND user_id=$2 FOR SHARE',
    [input.roomId, identity.userId]);
  if (!member.rowCount) throw new ChatTextError(403, 'CHAT_ACCESS_DENIED', 'Forbidden');
  recheckTime();
  return recheckTime;
}
async function transaction<T>(work: (client: PoolClient) => Promise<{ value: T; recheck: () => void }>): Promise<T> {
  const client = await pool.connect();
  let begun = false, commitAttempted = false, discard = false;
  try {
    await client.query('BEGIN'); begun = true;
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    const { value, recheck } = await work(client);
    recheck();
    commitAttempted = true;
    await client.query('COMMIT');
    return value;
  } catch (error) {
    if (commitAttempted) {
      // COMMIT may already have succeeded. Discard, never compensate/delete the
      // key and never tell clients to invent another key. Same-key retry is safe.
      discard = true;
      throw new ChatTextError(503, 'CHAT_REQUEST_UNCERTAIN', 'Save confirmation was lost. Check status or retry this exact request with the same key.');
    }
    if (begun) { try { await client.query('ROLLBACK'); } catch { discard = true; } }
    else discard = true;
    throw error;
  } finally { client.release(discard); }
}
async function readSaved(client: PoolClient, identity: TextIdentity, input: TextStatus, receipt: any, recheck: () => void) {
  const saved = (await client.query(`SELECT cm.*,
      TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) AS sender_name,
      u.profile_pic AS sender_avatar, NULL::text AS attachment_name,
      NULL::text AS attachment_type, NULL::integer AS attachment_size
    FROM chat_messages cm JOIN users u ON u.id=cm.sender_id
    WHERE cm.id=$1 FOR SHARE OF cm`, [receipt.original_message_id])).rows[0];
  recheck();
  if (!saved || receipt.fingerprint_version !== VERSION || saved.company_id !== input.expectedCompanyId
    || saved.room_id !== input.roomId || saved.sender_id !== identity.userId || saved.attachment_id != null
    || typeof saved.message !== 'string' || fingerprint(input.roomId, saved.message) !== receipt.payload_hash) {
    throw new ChatTextError(410, 'CHAT_REQUEST_UNAVAILABLE', 'The saved message is no longer available. Do not resend it with a new key.', { ...receiptIdentity(identity, input), state: 'unavailable' });
  }
  return saved;
}
function receiptIdentity(identity: TextIdentity, input: TextStatus) {
  return { key: input.requestKey, actorId: identity.userId, companyId: input.expectedCompanyId, roomId: input.roomId };
}
function response(identity: TextIdentity, input: TextStatus, message: any, replayed: boolean) {
  return { success: true as const, message, request: { ...receiptIdentity(identity, input), state: 'saved' as const, replayed } };
}
export async function saveKeyedText(identity: TextIdentity, input: TextRequest) {
  return transaction(async client => {
    const recheck = await authorize(client, identity, input);
    const hash = fingerprint(input.roomId, input.message), messageId = randomUUID();
    // The claim exists only in this transaction. There is no durable processing
    // state and no provider work. Scoped uniqueness arbitrates all transports.
    const claimed = await client.query(`INSERT INTO chat_text_requests
      (company_id,actor_id,request_key,room_id,fingerprint_version,payload_hash,original_message_id)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(company_id,actor_id,request_key) DO NOTHING RETURNING request_key`,
    [input.expectedCompanyId, identity.userId, input.requestKey, input.roomId, VERSION, hash, messageId]);
    if (!claimed.rowCount) {
      const receipt = (await client.query(`SELECT room_id,fingerprint_version,payload_hash,original_message_id
        FROM chat_text_requests WHERE company_id=$1 AND actor_id=$2 AND request_key=$3 FOR SHARE`,
      [input.expectedCompanyId, identity.userId, input.requestKey])).rows[0];
      recheck();
      if (!receipt || receipt.room_id !== input.roomId || receipt.fingerprint_version !== VERSION || receipt.payload_hash !== hash) {
        throw new ChatTextError(409, 'CHAT_REQUEST_CONFLICT', 'This request key was already used for a different message.');
      }
      return { value: response(identity, input, await readSaved(client, identity, input, receipt, recheck), true), recheck };
    }
    await client.query(`INSERT INTO chat_messages(id,sender_id,company_id,message,room_id,attachment_id)
      VALUES($1,$2,$3,$4,$5,NULL)`, [messageId, identity.userId, input.expectedCompanyId, input.message, input.roomId]);
    await client.query('UPDATE chat_rooms SET updated_at=NOW() WHERE id=$1', [input.roomId]);
    const message = await readSaved(client, identity, input, {
      original_message_id: messageId, fingerprint_version: VERSION, payload_hash: hash,
    }, recheck);
    return { value: response(identity, input, message, false), recheck };
  });
}
export async function readTextRequest(identity: TextIdentity, input: TextStatus) {
  return transaction(async client => {
    const recheck = await authorize(client, identity, input);
    const receipt = (await client.query(`SELECT room_id,fingerprint_version,payload_hash,original_message_id
      FROM chat_text_requests WHERE company_id=$1 AND actor_id=$2 AND request_key=$3 AND room_id=$4 FOR SHARE`,
    [input.expectedCompanyId, identity.userId, input.requestKey, input.roomId])).rows[0];
    recheck();
    // This says only that this authorized read saw no receipt. Another request
    // might still be pending: missing status never licenses a new key.
    if (!receipt) throw new ChatTextError(404, 'CHAT_REQUEST_NOT_FOUND', 'No saved receipt was found. Retry only with the same request key.', { ...receiptIdentity(identity, input), state: 'missing' });
    return { value: response(identity, input, await readSaved(client, identity, input, receipt, recheck), true), recheck };
  });
}
export function textRequestFailure(error: any): { status: number; body: { success: false; code: string; message: string; request?: ChatTextError['request'] } } {
  if (error instanceof ChatTextError) return { status: error.status, body: { success: false, code: error.code, message: error.message, ...(error.request ? { request: error.request } : {}) } };
  if (['42P01', '42703', '42P10'].includes(error?.code)) return { status: 503, body: {
    success: false, code: 'CHAT_REQUEST_SCHEMA_UNAVAILABLE', message: 'Saved-request support is unavailable. Retry later with the same request key.',
  } };
  return { status: 503, body: { success: false, code: 'CHAT_REQUEST_RETRY', message: 'Could not confirm this request. Retry only with the same request key.' } };
}
