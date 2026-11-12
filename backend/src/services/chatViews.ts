import type { PoolClient } from 'pg';
import { pool } from '../config/database';
import { hasComplimentaryAccess } from './complimentaryAccess';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export type ViewIdentity = {
  userId: string; requestCompanyId: string | null; claimedCompanyId: string | null;
  expiresAt?: number; notBefore?: number;
};
type ViewScope = { expectedActorId: string; expectedCompanyId: string };
type ViewedMessage = { id: string; viewVersion: string };
type ViewRequest = ViewScope & { roomId: string; membershipInstanceId: string; messages: ViewedMessage[] };
export class ChatViewError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
const uuid = (value: unknown): value is string => typeof value === 'string' && value.length === 36 && UUID.test(value);
function invalid(): never {
  throw new ChatViewError(400, 'CHAT_VIEW_INVALID', 'A valid private view scope and exact message versions are required.');
}
function stale(): never {
  // Never distinguish a foreign, deleted, edited, self-sent or inaccessible ID.
  throw new ChatViewError(409, 'CHAT_VIEW_STALE', 'The conversation changed. Refresh it before recording viewed messages.');
}
function parseScope(value: any): ViewScope {
  if (!value || !uuid(value.expectedActorId) || !uuid(value.expectedCompanyId)) return invalid();
  return { expectedActorId: value.expectedActorId, expectedCompanyId: value.expectedCompanyId };
}
export function parseViewStateQuery(value: Record<string, unknown>): ViewScope {
  if (Object.keys(value).length !== 2 || Object.keys(value).some(k => !['expectedActorId','expectedCompanyId'].includes(k))) return invalid();
  return parseScope(value);
}
export function parseViewRequest(roomId: unknown, value: any): ViewRequest {
  if (typeof roomId !== 'string' || !roomId || roomId.length > 255 || roomId.trim() !== roomId
    || roomId.includes('\0') || Buffer.from(roomId, 'utf8').toString('utf8') !== roomId
    || roomId.startsWith('support-ticket-') || !value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(k => !['expectedActorId','expectedCompanyId','membershipInstanceId','messages'].includes(k))
    || !uuid(value.membershipInstanceId) || !Array.isArray(value.messages) || value.messages.length < 1 || value.messages.length > 100
    || value.messages.some((m: any) => !m || typeof m !== 'object' || Array.isArray(m)
      || Object.keys(m).length !== 2 || Object.keys(m).some(k => !['id','viewVersion'].includes(k))
      || !uuid(m.id) || !uuid(m.viewVersion))
    || new Set(value.messages.map((m: any) => m.id)).size !== value.messages.length) return invalid();
  return { ...parseScope(value), roomId, membershipInstanceId: value.membershipInstanceId,
    messages: value.messages.map((m: ViewedMessage) => ({ id: m.id, viewVersion: m.viewVersion })) };
}
function assertIdentity(identity: ViewIdentity, input: ViewScope) {
  const now = Date.now() / 1000;
  if (!uuid(identity.userId) || (identity.expiresAt !== undefined && (!Number.isFinite(identity.expiresAt) || now >= identity.expiresAt))
    || (identity.notBefore !== undefined && (!Number.isFinite(identity.notBefore) || now < identity.notBefore))) {
    throw new ChatViewError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
  }
  if (identity.userId !== input.expectedActorId) {
    throw new ChatViewError(403, 'CHAT_VIEW_SCOPE_MISMATCH', 'This view state does not match the signed-in account.');
  }
}
function sponsorFor(companyId: string) {
  const [id, company, extra] = (process.env.COMPLIMENTARY_TESTER_IDENTITY || '').trim().toLowerCase().split(':');
  return !extra && id && company === companyId && hasComplimentaryAccess(id, company) ? id : null;
}
async function authorize(client: PoolClient, identity: ViewIdentity, input: ViewRequest) {
  assertIdentity(identity, input);
  // Lock order matches saved-text requests: actor/company, sponsor, room,
  // membership, ascending message IDs, ascending view rows. No lock upgrades.
  const row = (await client.query(`SELECT u.id,u.company_id,
      COALESCE((to_jsonb(u)->>'must_change_password')::boolean,FALSE) AS password_required,
      LOWER(COALESCE(c.subscription_status,'inactive')) AS subscription_status,
      COALESCE(c.subscription_current_period_end,c.subscription_expires_at) AS entitlement_ends_at
    FROM users u JOIN companies c ON c.id=u.company_id
    WHERE u.id=$1::uuid AND COALESCE(u.is_active,TRUE)=TRUE
      AND COALESCE(NULLIF(to_jsonb(c)->>'is_active','')::boolean,TRUE)=TRUE
      AND u.company_id=$2::uuid AND ($3::text IS NULL OR u.company_id::text=$3)
      AND ($4::text IS NULL OR u.company_id::text=$4)
    FOR SHARE OF u,c`, [identity.userId,input.expectedCompanyId,identity.requestCompanyId,identity.claimedCompanyId])).rows[0];
  if (!row) throw new ChatViewError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
  if (row.password_required) throw new ChatViewError(403, 'PASSWORD_CHANGE_REQUIRED', 'Change your temporary password before continuing.');
  const sponsor = sponsorFor(input.expectedCompanyId);
  const complimentary = sponsor ? Boolean((await client.query(`SELECT id FROM users
    WHERE id=$1::uuid AND company_id=$2::uuid AND COALESCE(is_active,TRUE)=TRUE
      AND LOWER(role) IN ('boss','owner') FOR SHARE`, [sponsor,input.expectedCompanyId])).rowCount) : false;
  const recheck = () => {
    assertIdentity(identity, input);
    const end = row.entitlement_ends_at ? new Date(row.entitlement_ends_at) : null;
    if (!(complimentary || (['active','trialing'].includes(row.subscription_status)
      && (end ? Number.isFinite(end.getTime()) && end.getTime() > Date.now() : row.subscription_status === 'active')))) {
      throw new ChatViewError(402, 'SUBSCRIPTION_REQUIRED', 'An active subscription or trial is required to use this feature.');
    }
  };
  recheck();
  const room = (await client.query('SELECT company_id FROM chat_rooms WHERE id=$1 FOR SHARE', [input.roomId])).rows[0];
  if (!room || room.company_id !== input.expectedCompanyId) throw new ChatViewError(403, 'CHAT_ACCESS_DENIED', 'Forbidden');
  const member = (await client.query(`SELECT membership_instance_id FROM chat_room_members
    WHERE room_id=$1 AND user_id=$2::uuid FOR SHARE`, [input.roomId,identity.userId])).rows;
  if (member.length !== 1 || member[0].membership_instance_id !== input.membershipInstanceId) return stale();
  recheck();
  return recheck;
}
function context(identity: ViewIdentity, input: ViewRequest) {
  return { actorId: identity.userId, companyId: input.expectedCompanyId, roomId: input.roomId,
    membershipInstanceId: input.membershipInstanceId };
}
export async function acknowledgeChatViews(identity: ViewIdentity, input: ViewRequest) {
  assertIdentity(identity, input);
  const client = await pool.connect();
  let begun = false, commitAttempted = false, discard = false;
  try {
    await client.query('BEGIN'); begun = true;
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    const recheck = await authorize(client, identity, input);
    const requested = [...input.messages].sort((a,b) => a.id.localeCompare(b.id));
    // Match history visibility: sender must exist, but need not still be active,
    // in the company or a room member. Those facts are not historical visibility.
    const messages = (await client.query(`SELECT cm.id,cm.view_version FROM chat_messages cm
      JOIN users sender ON sender.id=cm.sender_id
      WHERE cm.room_id=$1 AND cm.company_id=$2::uuid AND cm.sender_id<>$3::uuid
        AND cm.id=ANY($4::uuid[]) ORDER BY cm.id FOR SHARE OF cm`,
    [input.roomId,input.expectedCompanyId,identity.userId,requested.map(m => m.id)])).rows;
    recheck();
    if (messages.length !== requested.length || messages.some((m,i) => m.id !== requested[i].id || m.view_version !== requested[i].viewVersion)) return stale();
    await client.query(`INSERT INTO chat_message_views(membership_instance_id,message_id,view_version)
      SELECT $1::uuid,requested.id,requested.version FROM unnest($2::uuid[],$3::uuid[]) AS requested(id,version)
      ORDER BY requested.id ON CONFLICT(membership_instance_id,message_id)
      DO UPDATE SET view_version=EXCLUDED.view_version`,
    [input.membershipInstanceId,requested.map(m => m.id),requested.map(m => m.viewVersion)]);
    recheck();
    commitAttempted = true;
    await client.query('COMMIT');
    return { success: true as const, viewContext: context(identity,input), acknowledged: input.messages };
  } catch (error) {
    if (commitAttempted) {
      discard = true;
      throw new ChatViewError(503, 'CHAT_VIEW_UNCERTAIN', 'View confirmation was lost. Retry the same observed message versions or refresh.');
    }
    if (begun) { try { await client.query('ROLLBACK'); } catch { discard = true; } }
    else discard = true;
    throw error;
  } finally { client.release(discard); }
}

export async function readChatViewState(identity: ViewIdentity, input: ViewScope) {
  assertIdentity(identity,input);
  const sponsor = sponsorFor(input.expectedCompanyId);
  // Policy, membership incarnation, current messages and matching versions are
  // read in ONE SQL snapshot. No count is joined onto an earlier room-list read.
  const result = await pool.query(`WITH actor AS (
    SELECT u.id,u.company_id,
      COALESCE(c.subscription_current_period_end,c.subscription_expires_at) AS entitlement_ends_at,
      EXISTS (SELECT 1 FROM users sponsor WHERE sponsor.id=$5::uuid
        AND sponsor.company_id=u.company_id AND COALESCE(sponsor.is_active,TRUE)=TRUE
        AND LOWER(sponsor.role) IN ('boss','owner')) AS complimentary,
      COALESCE((to_jsonb(u)->>'must_change_password')::boolean,FALSE) AS password_required,
      ((EXISTS (SELECT 1 FROM users sponsor WHERE sponsor.id=$5::uuid
          AND sponsor.company_id=u.company_id AND COALESCE(sponsor.is_active,TRUE)=TRUE
          AND LOWER(sponsor.role) IN ('boss','owner')))
        OR (LOWER(COALESCE(c.subscription_status,'inactive')) IN ('active','trialing') AND (
          (COALESCE(c.subscription_current_period_end,c.subscription_expires_at) IS NULL AND LOWER(c.subscription_status)='active')
          OR (isfinite(COALESCE(c.subscription_current_period_end,c.subscription_expires_at))
            AND floor(extract(epoch FROM COALESCE(c.subscription_current_period_end,c.subscription_expires_at))*1000)<=8640000000000000
            AND date_trunc('milliseconds',COALESCE(c.subscription_current_period_end,c.subscription_expires_at))
              > date_trunc('milliseconds',statement_timestamp()))))) AS entitled
    FROM users u JOIN companies c ON c.id=u.company_id
    WHERE u.id=$1::uuid AND u.company_id=$2::uuid AND COALESCE(u.is_active,TRUE)=TRUE
      AND COALESCE(NULLIF(to_jsonb(c)->>'is_active','')::boolean,TRUE)=TRUE
      AND ($3::text IS NULL OR u.company_id::text=$3) AND ($4::text IS NULL OR u.company_id::text=$4)
  ), rooms AS (
    SELECT cr.id,member.membership_instance_id,counts.n
    FROM actor JOIN chat_rooms cr ON cr.company_id=actor.company_id
    JOIN chat_room_members member ON member.room_id=cr.id AND member.user_id=actor.id
    CROSS JOIN LATERAL (
      SELECT count(*)::integer AS n FROM (
        SELECT cm.id FROM chat_messages cm JOIN users sender ON sender.id=cm.sender_id
        WHERE cm.room_id=cr.id AND cm.company_id=cr.company_id AND cm.sender_id<>actor.id
          AND NOT EXISTS (SELECT 1 FROM chat_message_views v
            WHERE v.membership_instance_id=member.membership_instance_id AND v.message_id=cm.id AND v.view_version=cm.view_version)
        LIMIT 100
      ) unviewed
    ) counts
    WHERE NOT actor.password_required AND actor.entitled AND cr.id NOT LIKE 'support-ticket-%'
  ) SELECT EXISTS(SELECT 1 FROM actor) AS actor_exists,
    COALESCE((SELECT password_required FROM actor),FALSE) AS password_required,
    COALESCE((SELECT entitled FROM actor),FALSE) AS entitled,
    (SELECT entitlement_ends_at FROM actor) AS entitlement_ends_at,
    COALESCE((SELECT complimentary FROM actor),FALSE) AS complimentary,rooms.*
    FROM (SELECT 1) seed LEFT JOIN rooms ON TRUE ORDER BY rooms.id`,
  [identity.userId,input.expectedCompanyId,identity.requestCompanyId,identity.claimedCompanyId,sponsor]);
  assertIdentity(identity,input);
  const policy = result.rows[0];
  if (!policy?.actor_exists) throw new ChatViewError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
  if (policy.password_required) throw new ChatViewError(403, 'PASSWORD_CHANGE_REQUIRED', 'Change your temporary password before continuing.');
  const end = policy.entitlement_ends_at ? new Date(policy.entitlement_ends_at) : null;
  if (!policy.entitled || (!policy.complimentary && end && (!Number.isFinite(end.getTime()) || end.getTime() <= Date.now()))) throw new ChatViewError(402, 'SUBSCRIPTION_REQUIRED', 'An active subscription or trial is required to use this feature.');
  const rooms = result.rows.filter(r => r.id).map(r => ({ roomId: r.id, membershipInstanceId: r.membership_instance_id,
    unviewedCount: Math.min(r.n,99), unviewedCountCapped: r.n > 99 }));
  return { success: true as const, viewState: { actorId: identity.userId, companyId: input.expectedCompanyId,
    rooms, historyPolicy: 'unmarked_until_viewed' as const } };
}
export function chatViewFailure(error: any) {
  if (error instanceof ChatViewError) return { status: error.status, body: { success: false, code: error.code,
    message: error.message, ...(error.code === 'CHAT_VIEW_STALE' ? { refreshRequired: true } : {}) } };
  return { status: 503, body: { success: false, code: 'CHAT_VIEW_UNAVAILABLE',
    message: 'Private view state is unavailable. Refresh or retry the same observed message versions later.' } };
}
