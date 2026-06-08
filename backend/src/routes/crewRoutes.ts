import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database';
import { recordUserEvent } from '../services/adaptiveAIService';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET!;

// GET /api/crew – list crew members (for Lucy)
router.get('/', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
    if (userRes.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    const companyId = userRes.rows[0].company_id;
    if (!companyId) return res.json({ success: true, crew: [] });

    const result = await pool.query(
      'SELECT id, first_name, last_name, email FROM users WHERE company_id = $1',
      [companyId]
    );
    res.json({ success: true, crew: result.rows });
  } catch (error: any) {
    console.error('Crew list error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch crew' });
  }
});

// POST /api/crew/clock-in
router.post('/clock-in', async (req: Request, res: Response) => {
  try {
    const { shiftId, latitude, longitude } = req.body;
    if (!shiftId) return res.status(400).json({ success: false, message: 'shiftId is required' });

    const assignResult = await pool.query(
      `SELECT user_id FROM shift_assignments WHERE shift_id = $1`,
      [shiftId]
    );
    const userIds: string[] = assignResult.rows.map((r: any) => r.user_id);
    if (userIds.length === 0) {
      return res.status(400).json({ success: false, message: 'No employees assigned to this shift' });
    }

    const shiftResult = await pool.query('SELECT * FROM shifts WHERE id = $1', [shiftId]);
    const shift = shiftResult.rows[0];

    const clockedIn: any[] = [];
    for (const userId of userIds) {
      const result = await pool.query(
        `INSERT INTO time_entries (user_id, project_id, clock_in, clock_in_latitude, clock_in_longitude, status)
         VALUES ($1, $2, NOW(), $3, $4, 'active') RETURNING *`,
        [userId, shift.project_id, latitude || null, longitude || null]
      );
      const entry = result.rows[0];
      await recordUserEvent({
        userId,
        eventType: 'clock_in',
        eventData: { projectId: shift.project_id, timeEntryId: entry.id, crew: true, shiftId },
        latitude, longitude,
      });
      clockedIn.push({ userId, timeEntryId: entry.id });
    }

    res.json({ success: true, message: `${clockedIn.length} crew members clocked in`, clockedIn });
  } catch (error: any) {
    console.error('Crew clock-in error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/crew/clock-out
router.post('/clock-out', async (req: Request, res: Response) => {
  try {
    const { shiftId, latitude, longitude } = req.body;
    if (!shiftId) return res.status(400).json({ success: false, message: 'shiftId is required' });

    const assignResult = await pool.query(
      `SELECT user_id FROM shift_assignments WHERE shift_id = $1`,
      [shiftId]
    );
    const userIds: string[] = assignResult.rows.map((r: any) => r.user_id);
    if (userIds.length === 0) {
      return res.status(400).json({ success: false, message: 'No employees assigned to this shift' });
    }

    const clockedOut: any[] = [];
    for (const userId of userIds) {
      const result = await pool.query(
        `UPDATE time_entries
         SET clock_out = NOW(), clock_out_latitude = $1, clock_out_longitude = $2, status = 'completed'
         WHERE user_id = $3 AND clock_out IS NULL
         RETURNING *`,
        [latitude || null, longitude || null, userId]
      );
      if (result.rows.length > 0) {
        const entry = result.rows[0];
        await recordUserEvent({
          userId,
          eventType: 'clock_out',
          eventData: { projectId: entry.project_id, timeEntryId: entry.id, crew: true, shiftId },
          latitude, longitude,
        });
        clockedOut.push({ userId, timeEntryId: entry.id });
      }
    }

    res.json({ success: true, message: `${clockedOut.length} crew members clocked out`, clockedOut });
  } catch (error: any) {
    console.error('Crew clock-out error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;