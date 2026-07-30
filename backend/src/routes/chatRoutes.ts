import { verifyToken } from '../utils/auth';
import express, { Request, Response } from 'express';
import { pool } from '../config/database';
import { saveMessage } from '../services/chatService';

const router = express.Router();

// GET /api/chat/company/:companyId – chat history for the company
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

// POST /api/chat/message (optional REST fallback)
router.post('/message', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    
    const decoded = verifyToken(req);
    const { roomId, message } = req.body;
    const saved = await saveMessage(decoded.id, roomId, message, decoded.companyId);
    res.json({ success: true, message: saved });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/chat/room/:roomId – used by mobile (legacy)
router.get('/room/:roomId', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    
    verifyToken(req);

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

// ✅ NEW: GET /api/chat/messages/:roomId – used by web Chat.tsx
router.get('/messages/:roomId', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    
    verifyToken(req);

    const { roomId } = req.params;
    if (!roomId) {
      return res.status(400).json({ success: false, message: 'roomId required' });
    }

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

// GET /api/chat/rooms/:userId – list distinct chat rooms
router.get('/rooms/:userId', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    
    const decoded = verifyToken(req);

    const requestingUser = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
    if (requestingUser.rows.length === 0)
      return res.status(404).json({ success: false, message: 'Requesting user not found' });

    const targetUser = await pool.query('SELECT company_id FROM users WHERE id = $1', [req.params.userId]);
    if (targetUser.rows.length === 0)
      return res.status(404).json({ success: false, message: 'Target user not found' });

    if (requestingUser.rows[0].company_id !== targetUser.rows[0].company_id)
      return res.status(403).json({ success: false, message: 'Forbidden' });

    const result = await pool.query(
      'SELECT DISTINCT room_id FROM chat_messages WHERE sender_id = $1',
      [req.params.userId]
    );
    const rooms = result.rows.map(r => r.room_id);
    res.json({ success: true, rooms });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;