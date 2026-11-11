import { emitAuthorizedRoom } from '../services/socketAuthorization';
import { verifyToken } from '../utils/auth';
import express, { Request, Response } from 'express';
import type { PoolClient } from 'pg';
import { pool } from '../config/database';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { uploadPrivateChatFile, removePrivateChatFile, readPrivateChatFile } from '../services/chatStorage';
import { CHAT_FILE_LIMIT, chatFileType, safeFilename } from '../services/chatFiles';
import { saveMessage } from '../services/chatService';
import { ChatHistoryError, parseChatHistoryQuery, readChatHistory } from '../services/chatHistory';

const router = express.Router();
router.use((req, res, next) => {
  try { (req as any).chatUser = verifyToken(req).id; next(); }
  catch { res.status(401).json({success:false,message:'Sign in to use messages'}); }
});
const fileUpload = multer({storage:multer.memoryStorage(),limits:{fileSize:CHAT_FILE_LIMIT,files:1}});
const photoUpload = multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1}});
const parseFile = (parser:any) => (req:Request,res:Response,next:any) => parser(req,res,(err:any) => {
 if(err)return res.status(400).json({success:false,message:err.code==='LIMIT_FILE_SIZE'?'File is too large':err.message}); next();
});


export async function roomAccess(userId: string, roomId: string): Promise<{ allowed: boolean; companyId: string }> {
  const userResult = await pool.query('SELECT company_id, role FROM users WHERE id = $1 AND COALESCE(is_active,TRUE)=TRUE', [userId]);
  if (!userResult.rowCount) return { allowed: false, companyId: '' };
  const user = userResult.rows[0];
  const supportMatch = /^support-ticket-([a-zA-Z0-9-]+)$/.exec(roomId);
  if (supportMatch) {
    const ticket = await pool.query('SELECT company_id, user_id FROM support_tickets WHERE id = $1', [supportMatch[1]]);
    if (!ticket.rowCount) return { allowed: false, companyId: '' };
    const row = ticket.rows[0];
    const globalAgent = ['admin', 'support_agent'].includes(String(user.role));
    const companyAgent = ['boss', 'manager'].includes(String(user.role)) && String(row.company_id) === String(user.company_id);
    return {
      allowed: String(row.user_id) === userId || globalAgent || companyAgent,
      companyId: String(row.company_id),
    };
  }
  const room = await pool.query(
    `SELECT cr.company_id,
            EXISTS(SELECT 1 FROM chat_room_members WHERE room_id = cr.id AND user_id = $2) AS member
     FROM chat_rooms cr WHERE cr.id = $1`,
    [roomId, userId],
  );
  if (!room.rowCount) return { allowed: false, companyId: '' };
  return {
    allowed: Boolean(room.rows[0].member) && String(room.rows[0].company_id) === String(user.company_id),
    companyId: String(room.rows[0].company_id),
  };
}

// ─── GET /api/chat/company/:companyId ─────────────────────────────
router.get('/company/:companyId', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });

    const decoded = verifyToken(req);

    const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1 AND COALESCE(is_active,TRUE)=TRUE', [decoded.id]);
    if (userRes.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    if (userRes.rows[0].company_id !== req.params.companyId)
      return res.status(403).json({ success: false, message: 'Forbidden' });

    const result = await pool.query(
      `SELECT cm.*, u.first_name || ' ' || u.last_name AS sender_name, u.profile_pic AS sender_avatar,
              a.filename AS attachment_name, a.mime_type AS attachment_type, a.size_bytes AS attachment_size
       FROM chat_messages cm
       JOIN users u ON cm.sender_id = u.id
       LEFT JOIN chat_attachments a ON a.id = cm.attachment_id
       WHERE cm.company_id = $1
         -- Support has separate ticket/role authorization through the room endpoints.
         AND cm.room_id NOT LIKE 'support-ticket-%'
         AND EXISTS (
           SELECT 1 FROM chat_rooms cr
           JOIN chat_room_members crm ON crm.room_id = cr.id
           JOIN users requester ON requester.id = crm.user_id
           WHERE cr.id = cm.room_id AND cr.company_id = cm.company_id
             AND crm.user_id = $2 AND requester.company_id = cr.company_id
             AND COALESCE(requester.is_active,TRUE)=TRUE
         )
       ORDER BY cm.created_at DESC, cm.id DESC
       LIMIT 200`,
      [req.params.companyId, decoded.id]
    );
    res.json({ success: true, messages: result.rows.reverse() });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── POST /api/chat/message ────────────────────────────────────────
router.post('/message', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });

    const decoded = verifyToken(req);
    const roomId = String(req.body?.roomId || '');
    const message = String(req.body?.message || '').trim();
    if (!roomId || !message || message.length > 5000) {
      return res.status(400).json({ success: false, message: 'Valid roomId and message are required' });
    }
    const access = await roomAccess(decoded.id, roomId);
    if (!access.allowed) return res.status(403).json({ success: false, message: 'Forbidden' });
    const saved = await saveMessage(decoded.id, roomId, message, access.companyId);
    const io = req.app.get('io');
    await emitAuthorizedRoom(io, roomId, 'new-message', saved);
    res.json({ success: true, message: saved });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Both history aliases share validation, authorization, ordering and cursors.
async function roomHistory(req: Request, res: Response) {
  try {
    const decoded = verifyToken(req);
    const rawQuery = String(req.originalUrl || req.url).split('?').slice(1).join('?');
    if (rawQuery.length > 1024) throw new ChatHistoryError(400, 'CHAT_QUERY_INVALID', 'History query is too long.');
    const options = parseChatHistoryQuery(req.query);
    const result = await readChatHistory({
      userId: decoded.id,
      roomId: String(req.params.roomId || ''),
      // Bind even old tokens without a company claim to the gate's request-start
      // company. A transfer while this request is in flight must fail closed.
      requestCompanyId: res.locals.subscriptionActor?.companyId || decoded.companyId || null,
      claimedCompanyId: decoded.companyId || null,
    }, options);
    return res.json(result);
  } catch (error) {
    if (error instanceof ChatHistoryError) {
      return res.status(error.status).json({ success: false, code: error.code, message: error.message,
        ...(error.code === 'CHAT_CURSOR_INVALID' ? { refreshRequired: true } : {}) });
    }
    return res.status(500).json({ success: false, message: 'Could not load conversation' });
  }
}
router.get('/room/:roomId', roomHistory);
router.get('/messages/:roomId', roomHistory);

// ─── GET /api/chat/rooms/:userId ───────────────────────────────────
router.get('/rooms/:userId', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });

    const decoded = verifyToken(req);
    const userId = decoded.id;
    if (String(req.params.userId) !== String(decoded.id)) {
      return res.status(403).json({ success: false, message: 'You can only list your own conversations' });
    }

    const requestingUser = await pool.query(
      'SELECT company_id FROM users WHERE id = $1 AND COALESCE(is_active,TRUE)=TRUE', [userId]);
    if (requestingUser.rows.length === 0)
      return res.status(404).json({ success: false, message: 'Requesting user not found' });

    // Recheck current authorization in this statement, not JWT tenant/role claims or
    // the earlier lookup. EXISTS also avoids duplicate rooms from legacy memberships.
    const result = await pool.query(`
      SELECT cr.id, cr.name, COALESCE(cr.is_group,FALSE) AS is_group, cr.avatar_url,
        peer.profile_pic AS other_user_avatar,
        COALESCE(peer.display_name, 'Chat') AS other_user_name,
        latest.last_message, latest.last_message_type, latest.last_message_at
      FROM chat_rooms cr
      JOIN users requester ON requester.id = $1
        AND requester.company_id = cr.company_id
        AND COALESCE(requester.is_active,TRUE)=TRUE
      LEFT JOIN LATERAL (
        SELECT u.profile_pic, u.first_name || ' ' || u.last_name AS display_name
        FROM users u
        WHERE u.id <> $1 AND u.company_id = cr.company_id
          AND COALESCE(u.is_active,TRUE)=TRUE
          AND EXISTS (SELECT 1 FROM chat_room_members m WHERE m.room_id=cr.id AND m.user_id=u.id)
        ORDER BY u.id
        LIMIT 1
      ) peer ON TRUE
      LEFT JOIN LATERAL (
        SELECT LEFT(cm.message, 160) AS last_message,
          CASE WHEN a.id IS NULL THEN 'text'
               WHEN a.mime_type LIKE 'image/%' THEN 'image'
               WHEN a.mime_type LIKE 'audio/%' THEN 'audio'
               ELSE 'file' END AS last_message_type,
          cm.created_at AS last_message_at, cm.id AS message_id
        FROM chat_messages cm
        JOIN users sender ON sender.id = cm.sender_id
        LEFT JOIN chat_attachments a ON a.id = cm.attachment_id AND a.room_id = cr.id
        WHERE cm.room_id = cr.id AND cm.company_id = cr.company_id
        ORDER BY cm.created_at DESC NULLS LAST, cm.id DESC
        LIMIT 1
      ) latest ON TRUE
      WHERE cr.id NOT LIKE 'support-ticket-%'
        AND EXISTS (SELECT 1 FROM chat_room_members crm WHERE crm.room_id=cr.id AND crm.user_id=$1)
      ORDER BY (latest.message_id IS NOT NULL) DESC, latest.last_message_at DESC NULLS LAST,
        CASE WHEN latest.message_id IS NULL THEN cr.updated_at END DESC NULLS LAST, cr.id ASC
    `, [userId]);

    res.json({ success: true, rooms: result.rows });
  } catch (error: any) {
    console.error('Error fetching rooms:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Creation uses one checked-out connection. Lock all requested users in UUID
// order before validating their current tenant/activity, then room and members.
// This serializes overlapping participant sets without reversed-pair deadlocks.
class ChatCreationError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
const chatUserId = (value: unknown): string | null =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value.toLowerCase() : null;
const MAX_GROUP_MEMBERS = 100;

async function createWithMembers(
  actorId: string,
  memberIds: string[],
  expectedCompanyId: string | undefined,
  create: (client: PoolClient, companyId: string, members: string[]) => Promise<string>,
): Promise<string> {
  const client = await pool.connect();
  let discardClient = false;
  let commitAttempted = false;
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '10s'");
    const members = [...new Set([actorId, ...memberIds])].sort();
    // Do not filter by activity/company before locking: use the current row after
    // any concurrent update commits, not the subscription gate's earlier read.
    const result = await client.query(
      `SELECT id, company_id, COALESCE(is_active, TRUE) AS active FROM users
       WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
      [members],
    );
    const actor = result.rows.find(user => user.id === actorId);
    if (!actor) throw new ChatCreationError(404, 'User not found');
    if (!actor.active || !actor.company_id || (expectedCompanyId && expectedCompanyId !== actor.company_id)) {
      throw new ChatCreationError(403, 'Your account is no longer eligible to create this conversation');
    }
    if (result.rows.length !== members.length || result.rows.some(user => !user.active || user.company_id !== actor.company_id)) {
      throw new ChatCreationError(403, 'Every participant must be an active user in your company');
    }
    const roomId = await create(client, actor.company_id, members);
    commitAttempted = true;
    await client.query('COMMIT');
    return roomId;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { discardClient = true; }
    if (commitAttempted) {
      // A ROLLBACK acknowledgment cannot undo a COMMIT that already succeeded.
      // Do not reuse this connection or classify an unknown outcome as retryable.
      discardClient = true;
      throw new Error('Conversation creation commit was not acknowledged', { cause: error });
    }
    throw error;
  } finally {
    client.release(discardClient);
  }
}
function creationFailure(res: Response, error: any): void {
  if (error instanceof ChatCreationError) {
    res.status(error.status).json({ success: false, message: error.message });
  } else if (['55P03', '57014', '40P01'].includes(error?.code)) {
    // No automatic retry, especially for groups, whose commit outcome can be
    // uncertain after a connection failure. Only definite SQL contention maps here.
    res.status(503).json({ success: false, message: 'Conversation creation is busy. Check your chats before trying again.' });
  } else {
    console.error('Error creating chat:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

// ─── POST /api/chat/create-direct ──────────────────────────────────
router.post('/create-direct', async (req: Request, res: Response) => {
  try {
    const decoded = verifyToken(req);
    const userId1 = chatUserId(decoded.id);
    const userId2 = chatUserId(req.body?.userId2);
    if (!userId1 || !userId2 || userId1 === userId2) {
      return res.status(400).json({ success: false, message: 'Choose another user for this conversation' });
    }
    const expectedCompanyId = res.locals.subscriptionActor?.companyId || decoded.companyId;
    const roomId = await createWithMembers(userId1, [userId2], expectedCompanyId, async (client, companyId, members) => {
      const id = members.join('-');
      // A primary-key conflict may come from a legacy/other writer. Never update
      // that room or add members to it merely because its ID matches this pair.
      const inserted = await client.query(
        `INSERT INTO chat_rooms (id, is_group, company_id) VALUES ($1, false, $2)
         ON CONFLICT (id) DO NOTHING RETURNING id`,
        [id, companyId],
      );
      if (inserted.rowCount) {
        await client.query(
          `INSERT INTO chat_room_members (room_id, user_id)
           SELECT $1, unnest($2::uuid[])`,
          [id, members],
        );
      } else {
        const room = (await client.query(
          'SELECT company_id, is_group FROM chat_rooms WHERE id = $1 FOR UPDATE', [id],
        )).rows[0];
        // The room lock blocks new FK-backed memberships; lock existing members
        // too so removal/replacement cannot race the exact-membership check.
        const existing = await client.query(
          'SELECT user_id FROM chat_room_members WHERE room_id = $1 ORDER BY user_id LIMIT 3 FOR UPDATE', [id],
        );
        if (!room || room.company_id !== companyId || room.is_group !== false ||
            existing.rows.length !== members.length || existing.rows.some((member, index) => member.user_id !== members[index])) {
          throw new ChatCreationError(409, 'This conversation cannot be reopened. Contact your administrator.');
        }
      }
      return id;
    });
    res.json({ success: true, roomId });
  } catch (error) { creationFailure(res, error); }
});

// ─── POST /api/chat/create-group ───────────────────────────────────
router.post('/create-group', async (req: Request, res: Response) => {
  try {
    const decoded = verifyToken(req);
    const creatorId = chatUserId(decoded.id);
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const requested = req.body?.memberIds;
    if (!creatorId || !name || name.length > 100 || name.includes('\0') || !Array.isArray(requested) ||
        !requested.length || requested.length > MAX_GROUP_MEMBERS || requested.some(id => !chatUserId(id))) {
      return res.status(400).json({ success: false, message: 'A group name and 1 to 100 valid members are required' });
    }
    const memberIds = requested.map(id => chatUserId(id)!);
    const expectedCompanyId = res.locals.subscriptionActor?.companyId || decoded.companyId;
    const roomId = await createWithMembers(creatorId, memberIds, expectedCompanyId, async (client, companyId, members) => {
      // Keep the existing group ID/response contract. This is not a retry key:
      // two successful requests intentionally create two distinct groups.
      const id = `group-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      await client.query(
        `INSERT INTO chat_rooms (id, name, is_group, company_id, created_by)
         VALUES ($1, $2, true, $3, $4)`,
        [id, name, companyId, creatorId],
      );
      await client.query(
        `INSERT INTO chat_room_members (room_id, user_id)
         SELECT $1, unnest($2::uuid[])`,
        [id, members],
      );
      return id;
    });
    res.json({ success: true, roomId });
  } catch (error) { creationFailure(res, error); }
});

router.get('/room/:roomId/details', async (req, res) => {
 try {
  const userId=(req as any).chatUser;
  const access=await roomAccess(userId,String(req.params.roomId));
  if(!access.allowed)return res.status(403).json({success:false,message:'Forbidden'});
  const result=await pool.query(`SELECT id,name,is_group,avatar_url,created_by,
    (SELECT u.profile_pic FROM chat_room_members m JOIN users u ON u.id=m.user_id WHERE m.room_id=chat_rooms.id AND u.id<>$2 LIMIT 1) other_user_avatar
    FROM chat_rooms WHERE id=$1`,[req.params.roomId,userId]);
  const room=result.rows[0];
  res.json({success:true,room:{...room,can_edit_photo:room.is_group&&String(room.created_by)===String(userId)}});
 }catch{res.status(500).json({success:false,message:'Could not load conversation'});}
});
router.post('/room/:roomId/photo', async (req,res,next) => {
 try {
  const access=await roomAccess((req as any).chatUser,String(req.params.roomId));
  if(!access.allowed)return res.status(403).json({success:false,message:'Forbidden'});
  const r=await pool.query('SELECT created_by,is_group FROM chat_rooms WHERE id=$1',[req.params.roomId]);
  if(!r.rows[0]?.is_group||String(r.rows[0].created_by)!==String((req as any).chatUser))return res.status(403).json({success:false,message:'Only the group creator can change its photo'});
  next();
 }catch{res.status(500).json({success:false,message:'Could not check group access'});}
},parseFile(photoUpload.single('photo')),async(req,res)=>{
 try {
  if(!req.file)return res.status(400).json({success:false,message:'Choose a photo'});
  const mime=chatFileType(req.file.originalname,req.file.buffer);
  if(!mime.startsWith('image/'))return res.status(400).json({success:false,message:'Choose a JPG, PNG or WebP photo'});
  const result:any=await new Promise((resolve,reject)=>{
   const stream=cloudinary.uploader.upload_stream({folder:'future-jobs-pro-ai/chat-avatars',resource_type:'image',transformation:[{width:512,height:512,crop:'fill'}]},(err,result)=>err?reject(err):resolve(result));
   Readable.from(req.file!.buffer).pipe(stream);
  });
  await pool.query('UPDATE chat_rooms SET avatar_url=$1,updated_at=NOW() WHERE id=$2',[result.secure_url,req.params.roomId]);
  res.json({success:true,avatar_url:result.secure_url});
 }catch(e:any){res.status(400).json({success:false,message:e.message||'Photo upload failed'});}
});
router.post('/room/:roomId/attachments', async(req,res,next)=>{
 try {
  const access=await roomAccess((req as any).chatUser,String(req.params.roomId));
  if(!access.allowed)return res.status(403).json({success:false,message:'Forbidden'});
  (req as any).chatCompany=access.companyId; next();
 }catch{res.status(500).json({success:false,message:'Could not check conversation access'});}
},parseFile(fileUpload.single('file')),async(req,res)=>{
 const client=await pool.connect();
 let released=false;
 let uploaded:string|null=null;
 let committed=false;
 try {
  if(!req.file)return res.status(400).json({success:false,message:'Choose a file'});
  const filename=safeFilename(req.file.originalname),mime=chatFileType(filename,req.file.buffer);
  const caption=String(req.body?.message||'').trim();
  if(caption.length>5000)return res.status(400).json({success:false,message:'Caption is too long'});
  uploaded=await uploadPrivateChatFile(req.file.buffer,filename);
  await client.query('BEGIN');
  const attachment=await client.query(`INSERT INTO chat_attachments(room_id,uploader_id,filename,mime_type,size_bytes,storage_public_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,[req.params.roomId,(req as any).chatUser,filename,mime,req.file.size,uploaded]);
  const saved=await client.query(`INSERT INTO chat_messages(sender_id,company_id,room_id,message,attachment_id) VALUES($1,$2,$3,$4,$5) RETURNING *`,[(req as any).chatUser,(req as any).chatCompany,req.params.roomId,caption,attachment.rows[0].id]);
  await client.query('UPDATE chat_rooms SET updated_at=NOW() WHERE id=$1',[req.params.roomId]);
  const sender=await client.query("SELECT first_name || ' ' || last_name AS sender_name,profile_pic AS sender_avatar FROM users WHERE id=$1",[(req as any).chatUser]);
  await client.query('COMMIT');committed=true;
  client.release();released=true;
  const message={...saved.rows[0],...sender.rows[0],attachment_name:filename,attachment_type:mime,attachment_size:req.file.size};
  await emitAuthorizedRoom(req.app.get('io'), String(req.params.roomId), 'new-message', message);
  res.status(201).json({success:true,message});
 }catch(e:any){if(!committed)await client.query('ROLLBACK');if(uploaded&&!committed)await removePrivateChatFile(uploaded).catch(()=>{});res.status(400).json({success:false,message:e.message||'Attachment upload failed'});}
 finally{if(!released)client.release();}
});
router.get('/attachments/:id/content',async(req,res)=>{
 try {
  // Authorize using metadata before loading potentially large file bytes.
  const metadata=await pool.query('SELECT room_id FROM chat_attachments WHERE id=$1',[req.params.id]);
  if(!metadata.rowCount)return res.status(404).json({success:false,message:'File not found'});
  const access=await roomAccess((req as any).chatUser,String(metadata.rows[0].room_id));
  if(!access.allowed)return res.status(403).json({success:false,message:'Forbidden'});
  const result=await pool.query('SELECT filename,mime_type,storage_public_id FROM chat_attachments WHERE id=$1',[req.params.id]);
  const file=result.rows[0];
  const stream=await readPrivateChatFile(file.storage_public_id);
  res.set({'Content-Type':file.mime_type,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
  await pipeline(stream,res);
 }catch{if(!res.headersSent)res.status(500).json({success:false,message:'File download failed'});else res.destroy();}
});
export default router;
