import { verifyToken } from '../utils/auth';
import express, { Request, Response } from 'express';
import { pool } from '../config/database';
import { saveMessage } from '../services/chatService';

const router = express.Router();

async function roomAccess(userId: string, roomId: string): Promise<{ allowed: boolean; companyId: string }> {
  const userResult = await pool.query('SELECT company_id, role FROM users WHERE id = $1', [userId]);
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
      `SELECT cm.*, u.first_name || ' ' || u.last_name AS sender_name
       FROM chat_messages cm
       JOIN users u ON cm.sender_id = u.id
       WHERE cm.company_id = $1
       ORDER BY cm.created_at ASC
       LIMIT 200`,
      [req.params.companyId]
    );
    res.json({ success: true, messages: result.rows });
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
      `SELECT cm.*, u.first_name || ' ' || u.last_name AS sender_name
       FROM chat_messages cm
       JOIN users u ON cm.sender_id = u.id
       WHERE cm.room_id = $1
       ORDER BY cm.created_at ASC
       LIMIT 200`,
      [req.params.roomId]
    );
    res.json({ success: true, messages: result.rows });
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
      `SELECT cm.*, u.first_name || ' ' || u.last_name AS sender_name
       FROM chat_messages cm
       JOIN users u ON cm.sender_id = u.id
       WHERE cm.room_id = $1
       ORDER BY cm.created_at ASC
       LIMIT 200`,
      [roomId]
    );
    res.json({ success: true, messages: result.rows });
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
    const userId = req.params.userId;

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
        cr.is_group,
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
    const { userId1, userId2 } = req.body;
    if (!userId1 || !userId2) {
      return res.status(400).json({ success: false, message: 'Both userId1 and userId2 are required' });
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
    const { name, creatorId, memberIds } = req.body;
    if (!name || !creatorId || !memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({ success: false, message: 'name, creatorId, and memberIds array are required' });
    }

    // Ensure creator belongs to a company
    const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [creatorId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Creator not found' });
    }
    const companyId = userRes.rows[0].company_id;

    // Generate a unique room ID for group
    const roomId = `group-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    // Insert into chat_rooms
    await pool.query(
      `INSERT INTO chat_rooms (id, name, is_group, company_id, created_by)
       VALUES ($1, $2, true, $3, $4)`,
      [roomId, name, companyId, creatorId]
    );

    // Add members (including creator)
    const allMembers = [creatorId, ...memberIds];
    for (const userId of allMembers) {
      await pool.query(
        `INSERT INTO chat_room_members (room_id, user_id)
         VALUES ($1, $2)`,
        [roomId, userId]
      );
    }

    res.json({ success: true, roomId });
  } catch (error) {
    console.error('Error creating group chat:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
