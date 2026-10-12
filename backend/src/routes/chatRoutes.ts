import { verifyToken } from '../utils/auth';
import express, { Request, Response } from 'express';
import { pool } from '../config/database';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { uploadPrivateChatFile, removePrivateChatFile, readPrivateChatFile } from '../services/chatStorage';
import { CHAT_FILE_LIMIT, chatFileType, safeFilename } from '../services/chatFiles';
import { saveMessage } from '../services/chatService';

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

    const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
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
       ORDER BY cm.created_at DESC, cm.id DESC
       LIMIT 200`,
      [req.params.companyId]
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
    io?.to(`room-${roomId}`).emit('new-message', saved);
    res.json({ success: true, message: saved });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── GET /api/chat/room/:roomId ────────────────────────────────────
router.get('/room/:roomId', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });

    const decoded = verifyToken(req);
    const access = await roomAccess(decoded.id, String(req.params.roomId));
    if (!access.allowed) return res.status(403).json({ success: false, message: 'Forbidden' });

    const result = await pool.query(
      `SELECT cm.*, u.first_name || ' ' || u.last_name AS sender_name, u.profile_pic AS sender_avatar,
              a.filename AS attachment_name, a.mime_type AS attachment_type, a.size_bytes AS attachment_size
       FROM chat_messages cm
       JOIN users u ON cm.sender_id = u.id
       LEFT JOIN chat_attachments a ON a.id = cm.attachment_id
       WHERE cm.room_id = $1
       ORDER BY cm.created_at DESC, cm.id DESC
       LIMIT 200`,
      [req.params.roomId]
    );
    res.json({ success: true, messages: result.rows.reverse() });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── GET /api/chat/messages/:roomId ────────────────────────────────
router.get('/messages/:roomId', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });

    const decoded = verifyToken(req);

    const roomId = String(req.params.roomId || '');
    if (!roomId) {
      return res.status(400).json({ success: false, message: 'roomId required' });
    }
    const access = await roomAccess(decoded.id, roomId);
    if (!access.allowed) return res.status(403).json({ success: false, message: 'Forbidden' });

    const result = await pool.query(
      `SELECT cm.*, u.first_name || ' ' || u.last_name AS sender_name, u.profile_pic AS sender_avatar,
              a.filename AS attachment_name, a.mime_type AS attachment_type, a.size_bytes AS attachment_size
       FROM chat_messages cm
       JOIN users u ON cm.sender_id = u.id
       LEFT JOIN chat_attachments a ON a.id = cm.attachment_id
       WHERE cm.room_id = $1
       ORDER BY cm.created_at DESC, cm.id DESC
       LIMIT 200`,
      [roomId]
    );
    res.json({ success: true, messages: result.rows.reverse() });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

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

    // Verify the requesting user belongs to the same company as target user
    const requestingUser = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
    if (requestingUser.rows.length === 0)
      return res.status(404).json({ success: false, message: 'Requesting user not found' });

    const targetUser = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId]);
    if (targetUser.rows.length === 0)
      return res.status(404).json({ success: false, message: 'Target user not found' });

    if (requestingUser.rows[0].company_id !== targetUser.rows[0].company_id)
      return res.status(403).json({ success: false, message: 'Forbidden' });

    // Fetch rooms from chat_rooms table
    // We'll join with chat_room_members to get rooms the user is in
    // and also get other user names for direct chats.
    const result = await pool.query(`
      SELECT 
        cr.id,
        cr.name,
        cr.is_group, cr.avatar_url,
        (SELECT u.profile_pic FROM chat_room_members m JOIN users u ON u.id=m.user_id WHERE m.room_id=cr.id AND u.id<>$1 LIMIT 1) AS other_user_avatar,
        COALESCE(
          (SELECT u.first_name || ' ' || u.last_name
           FROM chat_room_members crm2
           JOIN users u ON crm2.user_id = u.id
           WHERE crm2.room_id = cr.id
             AND crm2.user_id != $1
           LIMIT 1),
          'Chat'
        ) AS other_user_name
      FROM chat_rooms cr
      JOIN chat_room_members crm ON crm.room_id = cr.id
      WHERE crm.user_id = $1
        AND cr.company_id = (SELECT company_id FROM users WHERE id = $1)
      ORDER BY cr.updated_at DESC
    `, [userId]);

    res.json({ success: true, rooms: result.rows });
  } catch (error: any) {
    console.error('Error fetching rooms:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── POST /api/chat/create-direct ──────────────────────────────────
router.post('/create-direct', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });

    const decoded = verifyToken(req);
    const userId1 = decoded.id;
    const userId2 = String(req.body?.userId2 || '');
    if (!userId2 || userId1 === userId2) {
      return res.status(400).json({ success: false, message: 'Choose another user for this conversation' });
    }

    // Ensure users exist and belong to same company
    const user1 = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId1]);
    const user2 = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId2]);
    if (user1.rows.length === 0 || user2.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (user1.rows[0].company_id !== user2.rows[0].company_id) {
      return res.status(403).json({ success: false, message: 'Users not in same company' });
    }

    // Create a deterministic room ID (sorted user IDs)
    const roomId = [userId1, userId2].sort().join('-');

    // Check if the room already exists in chat_rooms
    const existing = await pool.query('SELECT id FROM chat_rooms WHERE id = $1', [roomId]);
    if (existing.rows.length === 0) {
      // Create the room
      await pool.query(
        `INSERT INTO chat_rooms (id, is_group, company_id)
         VALUES ($1, false, $2)`,
        [roomId, user1.rows[0].company_id]
      );
      // Add both users as members
      await pool.query(
        `INSERT INTO chat_room_members (room_id, user_id)
         VALUES ($1, $2), ($1, $3)`,
        [roomId, userId1, userId2]
      );
    }

    res.json({ success: true, roomId });
  } catch (error) {
    console.error('Error creating direct chat:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── POST /api/chat/create-group ───────────────────────────────────
router.post('/create-group', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });

    const decoded = verifyToken(req);
    const name = String(req.body?.name || '').trim();
    const creatorId = decoded.id;
    const memberIds = Array.isArray(req.body?.memberIds)
      ? [...new Set(req.body.memberIds.map((id: unknown) => String(id)).filter(Boolean))]
      : [];
    if (!name || name.length > 100 || memberIds.length === 0) {
      return res.status(400).json({ success: false, message: 'A group name and at least one member are required' });
    }

    // Ensure creator belongs to a company
    const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [creatorId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Creator not found' });
    }
    const companyId = userRes.rows[0].company_id;

    const allowedMembers = await pool.query(
      `SELECT id FROM users WHERE company_id = $1 AND id = ANY($2::uuid[]) AND COALESCE(is_active, TRUE) = TRUE`,
      [companyId, memberIds],
    );
    if (allowedMembers.rowCount !== memberIds.length) {
      return res.status(403).json({ success: false, message: 'Every group member must be an active user in your company' });
    }

    // Generate a unique room ID for group
    const roomId = `group-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO chat_rooms (id, name, is_group, company_id, created_by)
         VALUES ($1, $2, true, $3, $4)`,
        [roomId, name, companyId, creatorId],
      );
      const allMembers = [...new Set([creatorId, ...memberIds])];
      for (const userId of allMembers) {
        await client.query(
          `INSERT INTO chat_room_members (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [roomId, userId],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    res.json({ success: true, roomId });
  } catch (error) {
    console.error('Error creating group chat:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
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
  const message={...saved.rows[0],...sender.rows[0],attachment_name:filename,attachment_type:mime,attachment_size:req.file.size};
  req.app.get('io')?.to(`room-${req.params.roomId}`).emit('new-message',message);
  res.status(201).json({success:true,message});
 }catch(e:any){await client.query('ROLLBACK');if(uploaded&&!committed)await removePrivateChatFile(uploaded).catch(()=>{});res.status(400).json({success:false,message:e.message||'Attachment upload failed'});}
 finally{client.release();}
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
