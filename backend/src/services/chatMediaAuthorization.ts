import type { PoolClient } from 'pg';
import { pool } from '../config/database';
import { hasComplimentaryAccess } from './complimentaryAccess';
import { hasCompanyEntitlement, SubscriptionActor } from '../middleware/trialMiddleware';

export class ChatMediaAccessError extends Error {
  constructor(public status:number, public code:string, message:string) { super(message); }
}
export type ChatMediaIdentity = {
  actorId:string; claimedCompanyId?:string|null; requestCompanyId?:string|null;
  expiresAt?:number; notBefore?:number;
};
// Membership instance fences leave/rejoin. Company snapshots constrain current
// scope but cannot detect completed actor/target tenant ABA without a scope epoch.
export type ChatMediaScope = {
  roomId:string; actorCompanyId:string; targetCompanyId:string; membershipInstance:string|null; ticketOwnerId:string|null;
};
function denied():never { throw new ChatMediaAccessError(403,'CHAT_ACCESS_DENIED','Conversation access is no longer available.'); }
function tokenCurrent(identity:ChatMediaIdentity) {
  const now=Date.now()/1000;
  if(!identity.actorId || (identity.expiresAt!==undefined && (!Number.isFinite(identity.expiresAt)||now>=identity.expiresAt))
    || (identity.notBefore!==undefined && (!Number.isFinite(identity.notBefore)||now<identity.notBefore))) {
    throw new ChatMediaAccessError(401,'AUTHENTICATION_REQUIRED','Sign in to use messages.');
  }
}
// This is the HTTP /api/chat policy, including its subscription gate for support
// ticket rooms. Do not substitute the intentionally different socket exceptions.
export async function authorizeChatMedia(client:PoolClient, identity:ChatMediaIdentity, roomId:string,
  expected?:ChatMediaScope, photo=false):Promise<{scope:ChatMediaScope; recheck:()=>void}> {
  tokenCurrent(identity);
  const actor=(await client.query(`SELECT u.id,u.company_id,u.role,
    COALESCE((to_jsonb(u)->>'must_change_password')::boolean,FALSE) AS password_required,
    LOWER(COALESCE(c.subscription_status,'inactive')) AS subscription_status,
    COALESCE(c.subscription_current_period_end,c.subscription_expires_at) AS entitlement_ends_at
    FROM users u JOIN companies c ON c.id=u.company_id
    WHERE u.id=$1 AND COALESCE(u.is_active,TRUE)=TRUE
      AND COALESCE(NULLIF(to_jsonb(c)->>'is_active','')::boolean,TRUE)=TRUE
      AND ($2::text IS NULL OR u.company_id::text=$2)
      AND ($3::text IS NULL OR u.company_id::text=$3)
    FOR SHARE OF u,c`,[identity.actorId,identity.requestCompanyId||null,identity.claimedCompanyId||null])).rows[0];
  if(!actor || (expected && String(actor.company_id)!==expected.actorCompanyId)) denied();
  const actorCompanyId=String(actor.company_id);
  if(actor.password_required) throw new ChatMediaAccessError(403,'PASSWORD_CHANGE_REQUIRED','Change your temporary password before continuing.');
  const [sponsorId,sponsorCompany,extra]=(process.env.COMPLIMENTARY_TESTER_IDENTITY||'').trim().toLowerCase().split(':');
  let complimentary=false;
  if(!extra && sponsorId && sponsorCompany===actorCompanyId.toLowerCase() && hasComplimentaryAccess(sponsorId,actorCompanyId)) {
    complimentary=Boolean((await client.query(`SELECT id FROM users WHERE id=$1 AND company_id=$2
      AND COALESCE(is_active,TRUE)=TRUE AND LOWER(role) IN ('boss','owner') FOR SHARE`,[sponsorId,actorCompanyId])).rowCount);
  }
  const entitlement={mustChangePassword:false,complimentary,subscriptionStatus:actor.subscription_status,
    entitlementEndsAt:actor.entitlement_ends_at?new Date(actor.entitlement_ends_at):null} as SubscriptionActor;
  const recheck=()=>{
    tokenCurrent(identity);
    if(!hasCompanyEntitlement(entitlement)) throw new ChatMediaAccessError(402,'SUBSCRIPTION_REQUIRED','An active subscription or trial is required to use this feature.');
  };
  recheck();
  const ticketId=/^support-ticket-([a-zA-Z0-9-]+)$/.exec(roomId)?.[1];
  let targetCompanyId:string,membershipInstance:string|null=null,ticketOwnerId:string|null=null;
  if(ticketId) {
    if(photo) denied();
    const ticket=(await client.query('SELECT company_id,user_id FROM support_tickets WHERE id=$1 FOR SHARE',[ticketId])).rows[0];
    if(!ticket || !(String(ticket.user_id)===identity.actorId || ['admin','support_agent'].includes(String(actor.role))
      || (['boss','manager'].includes(String(actor.role)) && String(ticket.company_id)===actorCompanyId))) denied();
    targetCompanyId=String(ticket.company_id);ticketOwnerId=String(ticket.user_id);
    // Legacy support uploads may have a backing chat room. Lock it before its
    // updated_at write, but do not invent a membership requirement for tickets.
    const room=(await client.query('SELECT company_id FROM chat_rooms WHERE id=$1 FOR UPDATE',[roomId])).rows[0];
    if(room && String(room.company_id)!==targetCompanyId) denied();
  } else {
    // Matches text writers: actor/company, sponsor, room UPDATE, member SHARE.
    // Taking SHARE then upgrading the room would deadlock concurrent sends.
    const room=(await client.query('SELECT company_id,is_group,created_by FROM chat_rooms WHERE id=$1 FOR UPDATE',[roomId])).rows[0];
    if(!room || String(room.company_id)!==actorCompanyId || (photo && (!room.is_group || String(room.created_by)!==identity.actorId))) denied();
    targetCompanyId=String(room.company_id);
    const member=(await client.query('SELECT membership_instance_id FROM chat_room_members WHERE room_id=$1 AND user_id=$2 FOR SHARE',[roomId,identity.actorId])).rows[0];
    if(!member?.membership_instance_id) denied();
    membershipInstance=String(member.membership_instance_id);
  }
  const scope={roomId,actorCompanyId,targetCompanyId,membershipInstance,ticketOwnerId};
  if(expected && (expected.roomId!==roomId || expected.targetCompanyId!==targetCompanyId || expected.membershipInstance!==membershipInstance || expected.ticketOwnerId!==ticketOwnerId)) denied();
  recheck();
  return {scope,recheck};
}
// Both pre-provider capture and post-provider read validation use a short read
// transaction. All locks/connections are released before provider work or piping.
export async function readChatMediaPolicy<T>(identity:ChatMediaIdentity,roomId:string,expected:ChatMediaScope|undefined,
  work:(client:PoolClient,policy:Awaited<ReturnType<typeof authorizeChatMedia>>)=>Promise<T>,photo=false):Promise<T> {
  const client=await pool.connect();let discard=false;
  let value:T;let recheck:()=>void;
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    const policy=await authorizeChatMedia(client,identity,roomId,expected,photo);
    value=await work(client,policy);policy.recheck();recheck=policy.recheck;
  } finally {
    try{await client.query('ROLLBACK');}catch{discard=true;}
    client.release(discard);
    // A failed read-transaction settlement is unavailable, never permission.
    if(discard) throw new Error('Media authorization transaction did not settle');
  }
  recheck!();
  return value!;
}
export function chatMediaFailure(error:unknown) {
  return error instanceof ChatMediaAccessError
    ? {status:error.status,body:{success:false,code:error.code,message:error.message}}
    : {status:503,body:{success:false,code:'CHAT_MEDIA_UNAVAILABLE',message:'Could not verify conversation access. Try again later.'}};
}
