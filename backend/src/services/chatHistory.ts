import { pool } from '../config/database';
import { hasComplimentaryAccess } from './complimentaryAccess';

const MAX_PAGE_SIZE = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type HistoryOptions = { paginated: boolean; limit: number; beforeId: string | null };
type HistoryIdentity = {
  userId: string; roomId: string; requestCompanyId: string | null; claimedCompanyId: string | null;
};

export class ChatHistoryError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
function invalidCursor(): never {
  // Deliberately identical for malformed, missing, deleted and out-of-scope anchors.
  throw new ChatHistoryError(400, 'CHAT_CURSOR_INVALID', 'History cursor is invalid. Refresh the conversation.');
}
function encodeCursor(id: string): string {
  return Buffer.from(JSON.stringify({ v: 1, id })).toString('base64url');
}
function decodeCursor(value: unknown): string {
  if (typeof value !== 'string' || value.length > 128 || !/^[A-Za-z0-9_-]+$/.test(value)) return invalidCursor();
  try {
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (cursor?.v === 1 && typeof cursor.id === 'string' && UUID.test(cursor.id)
      && encodeCursor(cursor.id) === value) return cursor.id;
  } catch { /* All decoding failures share one non-disclosing response. */ }
  return invalidCursor();
}

export function parseChatHistoryQuery(query: Record<string, unknown>): HistoryOptions {
  const keys = Object.keys(query);
  if (keys.some(key => key !== 'limit' && key !== 'before')) {
    throw new ChatHistoryError(400, 'CHAT_QUERY_INVALID', 'Only limit and before are supported.');
  }
  let limit = MAX_PAGE_SIZE;
  if (Object.prototype.hasOwnProperty.call(query, 'limit')) {
    if (typeof query.limit !== 'string' || !/^[1-9][0-9]{0,2}$/.test(query.limit)
      || Number(query.limit) > MAX_PAGE_SIZE) {
      throw new ChatHistoryError(400, 'CHAT_QUERY_INVALID', 'limit must be an integer from 1 to 200.');
    }
    limit = Number(query.limit);
  }
  const beforeId = Object.prototype.hasOwnProperty.call(query, 'before') ? decodeCursor(query.before) : null;
  return { paginated: keys.length > 0, limit, beforeId };
}

export async function readChatHistory(identity: HistoryIdentity, options: HistoryOptions) {
  // Use the same operator-configured identity rules as the HTTP subscription gate,
  // but recheck the sponsor, actor and company in the history statement itself.
  const [sponsorId, sponsorCompany, extra] = (process.env.COMPLIMENTARY_TESTER_IDENTITY || '').trim().toLowerCase().split(':');
  const complimentarySponsor = !extra && sponsorId && sponsorCompany
    && hasComplimentaryAccess(sponsorId, sponsorCompany) ? sponsorId : null;
  const supportTicketId = /^support-ticket-([a-zA-Z0-9-]+)$/.exec(identity.roomId)?.[1] || null;
  const result = await pool.query(`
    WITH actor AS (
      SELECT requester.id, requester.company_id, requester.role,
        COALESCE((to_jsonb(requester)->>'must_change_password')::boolean,FALSE) AS password_required,
        (
          (requester.company_id::text = $8 AND EXISTS (
            SELECT 1 FROM users sponsor WHERE sponsor.id = $7::uuid
              AND sponsor.company_id = requester.company_id AND COALESCE(sponsor.is_active,TRUE)=TRUE
              AND LOWER(sponsor.role) IN ('boss','owner')
          )) OR (
            LOWER(COALESCE(c.subscription_status,'inactive')) IN ('active','trialing')
            AND (
              (COALESCE(c.subscription_current_period_end,c.subscription_expires_at) IS NULL
                AND LOWER(c.subscription_status)='active')
              OR (
                -- Match the gate's pg/JS Date semantics, including non-finite
                -- values, the JS date ceiling and millisecond expiration.
                isfinite(COALESCE(c.subscription_current_period_end,c.subscription_expires_at))
                AND floor(extract(epoch FROM COALESCE(c.subscription_current_period_end,c.subscription_expires_at))*1000)
                  <= 8640000000000000
                AND date_trunc('milliseconds',COALESCE(c.subscription_current_period_end,c.subscription_expires_at))
                  > date_trunc('milliseconds',statement_timestamp())
              )
            )
          )
        ) AS entitled
      FROM users requester JOIN companies c ON c.id = requester.company_id
      WHERE requester.id = $2::uuid AND COALESCE(requester.is_active,TRUE)=TRUE
        AND COALESCE(NULLIF(to_jsonb(c)->>'is_active','')::boolean,TRUE)=TRUE
        AND ($3::text IS NULL OR requester.company_id::text = $3)
        AND ($9::text IS NULL OR requester.company_id::text = $9)
    ), authorized_room AS (
      SELECT cr.company_id FROM chat_rooms cr JOIN actor ON actor.company_id = cr.company_id
      WHERE $6::text IS NULL AND cr.id = $1 AND NOT actor.password_required AND actor.entitled
        AND EXISTS (SELECT 1 FROM chat_room_members crm WHERE crm.room_id=cr.id AND crm.user_id=actor.id)
      UNION ALL
      SELECT ticket.company_id FROM support_tickets ticket CROSS JOIN actor
      WHERE $6::text IS NOT NULL AND ticket.id::text = $6 AND NOT actor.password_required AND actor.entitled
        AND (ticket.user_id = actor.id OR actor.role IN ('admin','support_agent')
          OR (actor.role IN ('boss','manager') AND ticket.company_id = actor.company_id))
    ), anchor AS (
      SELECT cm.id, cm.created_at FROM chat_messages cm
      JOIN authorized_room scope ON scope.company_id = cm.company_id
      JOIN users sender ON sender.id = cm.sender_id
      WHERE cm.room_id = $1 AND cm.id = $4::uuid
    ), page AS (
      SELECT cm.*, sender.first_name || ' ' || sender.last_name AS sender_name, sender.profile_pic AS sender_avatar,
        a.filename AS attachment_name, a.mime_type AS attachment_type, a.size_bytes AS attachment_size
      FROM chat_messages cm
      JOIN authorized_room scope ON scope.company_id = cm.company_id
      JOIN users sender ON sender.id = cm.sender_id
      LEFT JOIN chat_attachments a ON a.id = cm.attachment_id AND a.room_id = cm.room_id
        AND EXISTS (SELECT 1 FROM chat_rooms attachment_room WHERE attachment_room.id=a.room_id
          AND attachment_room.company_id=cm.company_id)
      WHERE cm.room_id = $1 AND ($4::uuid IS NULL OR EXISTS (
        SELECT 1 FROM anchor WHERE
          -- Preserve legacy DESC NULLS FIRST exactly, including the null-to-date boundary.
          (anchor.created_at IS NULL AND (cm.created_at IS NOT NULL OR cm.id < anchor.id))
          OR (anchor.created_at IS NOT NULL AND (cm.created_at,cm.id) < (anchor.created_at,anchor.id))
      ))
      ORDER BY cm.created_at DESC NULLS FIRST, cm.id DESC
      LIMIT $5
    )
    SELECT EXISTS(SELECT 1 FROM actor) AS __history_actor,
      COALESCE((SELECT password_required FROM actor),FALSE) AS __history_password,
      COALESCE((SELECT entitled FROM actor),FALSE) AS __history_entitled,
      EXISTS(SELECT 1 FROM authorized_room) AS __history_allowed,
      ($4::uuid IS NULL OR EXISTS(SELECT 1 FROM anchor)) AS __history_cursor,
      page.*
    FROM (SELECT 1) seed LEFT JOIN page ON TRUE
    ORDER BY page.created_at DESC NULLS FIRST, page.id DESC`,
    [identity.roomId, identity.userId, identity.requestCompanyId, options.beforeId,
      options.limit + (options.paginated ? 1 : 0), supportTicketId, complimentarySponsor,
      complimentarySponsor ? sponsorCompany : null, identity.claimedCompanyId]);
  const state = result.rows[0];
  if (!state?.__history_actor) throw new ChatHistoryError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
  if (state.__history_password) throw new ChatHistoryError(403, 'PASSWORD_CHANGE_REQUIRED', 'Change your temporary password before continuing.');
  if (!state.__history_entitled) throw new ChatHistoryError(402, 'SUBSCRIPTION_REQUIRED', 'An active subscription or trial is required to use this feature.');
  if (!state.__history_allowed) throw new ChatHistoryError(403, 'CHAT_ACCESS_DENIED', 'Forbidden');
  if (!state.__history_cursor) return invalidCursor();
  const rows = result.rows.filter(row => row.id).map(row => {
    const { __history_actor, __history_password, __history_entitled, __history_allowed, __history_cursor, ...message } = row;
    return message;
  });
  const hasMore = rows.length > options.limit;
  const messages = rows.slice(0, options.limit).reverse();
  // Cursors refer to this page, never an accumulated client-side history list.
  return { success: true, messages, ...(options.paginated ? {
    hasMore, nextCursor: hasMore ? encodeCursor(messages[0].id) : null,
  } : {}) };
}
