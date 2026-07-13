import express, { Request, Response } from 'express';
import { verifyToken } from '../utils/auth';
import {
  sendInviteEmail,
  sendClockInNotification,
  sendShiftAssignmentEmail,
  sendEmail,
} from '../services/emailService';
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

// ─── POST /api/notifications/invite ───
router.post('/invite', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const decoded = verifyToken(req);

    const { email, firstName, tempPassword } = req.body;
    if (!email || !firstName || !tempPassword) {
      return res.status(400).json({ success: false, message: 'email, firstName, and tempPassword required' });
    }

    // Get company name
    const companyRes = await pool.query('SELECT name FROM companies WHERE id = $1', [decoded.companyId]);
    const companyName = companyRes.rows[0]?.name || 'Future Jobs Pro AI';

    await sendInviteEmail(email, firstName, tempPassword, companyName);
    res.json({ success: true, message: 'Invite email sent' });
  } catch (error: any) {
    console.error('Invite email error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── POST /api/notifications/clock-in ───
router.post('/clock-in', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const decoded = verifyToken(req);

    const { userId, projectId, time } = req.body;
    if (!userId || !projectId) {
      return res.status(400).json({ success: false, message: 'userId and projectId required' });
    }

    // Get user email and name
    const userRes = await pool.query('SELECT email, first_name FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const { email, first_name } = userRes.rows[0];

    // Get project name
    const projectRes = await pool.query('SELECT name FROM projects WHERE id = $1', [projectId]);
    const projectName = projectRes.rows[0]?.name || 'Unknown project';

    // Get company name
    const companyRes = await pool.query('SELECT name FROM companies WHERE id = $1', [decoded.companyId]);
    const companyName = companyRes.rows[0]?.name || 'Future Jobs Pro AI';

    const clockInTime = time ? new Date(time) : new Date();
    await sendClockInNotification(email, first_name, projectName, clockInTime, companyName);
    res.json({ success: true, message: 'Clock-in notification sent' });
  } catch (error: any) {
    console.error('Clock-in notification error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── POST /api/notifications/shift-assignment ───
router.post('/shift-assignment', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const decoded = verifyToken(req);

    const { userId, shiftName, shiftDate, shiftTime } = req.body;
    if (!userId || !shiftName || !shiftDate || !shiftTime) {
      return res.status(400).json({ success: false, message: 'userId, shiftName, shiftDate, shiftTime required' });
    }

    const userRes = await pool.query('SELECT email, first_name FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const { email, first_name } = userRes.rows[0];

    const companyRes = await pool.query('SELECT name FROM companies WHERE id = $1', [decoded.companyId]);
    const companyName = companyRes.rows[0]?.name || 'Future Jobs Pro AI';

    await sendShiftAssignmentEmail(email, first_name, shiftName, shiftDate, shiftTime, companyName);
    res.json({ success: true, message: 'Shift assignment email sent' });
  } catch (error: any) {
    console.error('Shift assignment email error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;