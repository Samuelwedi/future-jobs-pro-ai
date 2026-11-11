import type { Server } from 'socket.io';
import { pool } from '../config/database';
import { hasCompanyEntitlement, loadSubscriptionActor, SubscriptionActor } from '../middleware/trialMiddleware';

// Customer access tokens do not authorize platform support-agent sockets.
export const socketAgentRoles: ReadonlySet<string> = new Set<string>();
export const socketGlobalAgentRoles: ReadonlySet<string> = new Set<string>();

type SocketAuthorization = Readonly<{
  userId: string;
  companyId: string;
  expiresAt?: number;
  notBefore?: number;
}>;
type AuthorizedSocket = { data: { authorization?: SocketAuthorization } };

// Only call after signature/access-token verification and the initial DB lookup.
// Socket.IO shares data with other replicas: never store the bearer token here.
export function socketAuthorization(decoded: { id: string; exp?: number; nbf?: number }, actor: SubscriptionActor): SocketAuthorization {
  return Object.freeze({ userId: actor.id, companyId: actor.companyId, expiresAt: decoded.exp, notBefore: decoded.nbf });
}

export function assertSocketTokenCurrent(socket: AuthorizedSocket): SocketAuthorization {
  const auth = socket.data.authorization;
  if (!auth || !auth.userId || !auth.companyId) throw new Error('Authentication is required');
  const now = Date.now() / 1000;
  if (auth.expiresAt !== undefined && (!Number.isFinite(auth.expiresAt) || now >= auth.expiresAt)) throw new Error('Token expired');
  if (auth.notBefore !== undefined && (!Number.isFinite(auth.notBefore) || now < auth.notBefore)) throw new Error('Token is not active');
  return auth;
}

export async function loadSocketActor(socket: AuthorizedSocket): Promise<SubscriptionActor> {
  const auth = assertSocketTokenCurrent(socket);
  // Bind even older tokens without a company claim to the company at connection.
  const actor = await loadSubscriptionActor(auth.userId, auth.companyId);
  assertSocketTokenCurrent(socket);
  return actor;
}

export async function socketRoomAccess(socket: AuthorizedSocket, roomId: string): Promise<{ allowed: boolean; companyId: string; actor: SubscriptionActor }> {
  const actor = await loadSocketActor(socket);
  const supportMatch = /^support-ticket-([a-zA-Z0-9-]+)$/.exec(roomId);
  if (supportMatch) {
    const ticket = await pool.query('SELECT company_id, user_id FROM support_tickets WHERE id = $1', [supportMatch[1]]);
    assertSocketTokenCurrent(socket);
    const row = ticket.rows[0];
    return {
      // Preserve support for owners without a paid entitlement, including the
      // existing support exception for temporary-password accounts.
      allowed: Boolean(row) && (String(row.user_id) === actor.id
        || socketGlobalAgentRoles.has(actor.role)
        || (socketAgentRoles.has(actor.role) && String(row.company_id) === actor.companyId)),
      companyId: row ? String(row.company_id) : '', actor,
    };
  }
  if (!hasCompanyEntitlement(actor)) return { allowed: false, companyId: '', actor };
  const room = await pool.query(
    `SELECT cr.company_id,
            EXISTS(SELECT 1 FROM chat_room_members crm WHERE crm.room_id = cr.id AND crm.user_id = $2) AS member
       FROM chat_rooms cr WHERE cr.id = $1`, [roomId, actor.id],
  );
  assertSocketTokenCurrent(socket);
  const row = room.rows[0];
  return {
    allowed: Boolean(row?.member) && String(row.company_id) === actor.companyId && hasCompanyEntitlement(actor),
    companyId: row ? String(row.company_id) : '', actor,
  };
}

async function emitAuthorized(io: Server | undefined, room: string, event: string, payload: unknown,
  authorize: (socket: AuthorizedSocket) => Promise<boolean>, excludeSocketId?: string): Promise<void> {
  if (!io) return;
  try {
    // fetchSockets includes remote recipients when the Redis adapter is active.
    // A room membership is only a delivery subscription, never authorization.
    const sockets = await io.in(room).fetchSockets();
    for (let offset = 0; offset < sockets.length; offset += 20) {
      await Promise.all(sockets.slice(offset, offset + 20).map(async socket => {
        if (socket.id === excludeSocketId) return;
        try {
          if (!await authorize(socket)) return;
          assertSocketTokenCurrent(socket);
          // RemoteSocket.emit targets this socket through its adapter. Never
          // fall back to a room broadcast, even on lookup/transport failure.
          socket.emit(event, payload);
        } catch {
          console.warn('Socket notification recipient authorization or delivery failed');
        }
      }));
    }
  } catch {
    // Notification failure must not turn an already-committed message into an
    // apparent send failure. Normal history/reconnect remains authoritative.
    console.warn('Socket notification recipient lookup failed');
  }
}

export function emitAuthorizedRoom(io: Server | undefined, roomId: string, event: string, payload: unknown, excludeSocketId?: string): Promise<void> {
  return emitAuthorized(io, `room-${roomId}`, event, payload,
    async socket => (await socketRoomAccess(socket, roomId)).allowed, excludeSocketId);
}

export function emitAuthorizedSupportQueue(io: Server | undefined, event: string, payload: unknown): Promise<void> {
  return emitAuthorized(io, 'platform-support-queue', event, payload,
    async socket => socketGlobalAgentRoles.has((await loadSocketActor(socket)).role));
}
