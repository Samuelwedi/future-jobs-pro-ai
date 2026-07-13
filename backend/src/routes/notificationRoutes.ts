import express, { Request, Response } from 'express';
import { verifyToken } from '../utils/auth';
import { sendInviteEmail, sendClockInNotification } from '../services/emailService';
import { pool } from '../config/database';

const router = express.Router();

// ─── POST /api/notifications/test ───
router.post('/test', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const decoded = verifyToken(req);
    const userId = decoded.id;

    // Get user's email
    const userRes = await pool.query('SELECT email, first_name FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const { email, first_name } = userRes.rows[0];

    await sendInviteEmail(email, first_name, 'test123', 'Future Jobs Pro AI');
    res.json({ success: true, message: 'Test email sent!' });
  } catch (error: any) {
    console.error('Test email error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;