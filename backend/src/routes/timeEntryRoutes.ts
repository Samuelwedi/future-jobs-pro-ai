import express, { Request, Response } from 'express';
import { pool } from '../config/database';
import { verifyToken } from '../utils/auth';

const router = express.Router();

// GET /api/time-entries?userId=&start=&end=
router.get('/', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const decoded = verifyToken(req);
    const { userId, start, end } = req.query;
    if (!userId || !start || !end) {
      return res.status(400).json({ success: false, message: 'userId, start, and end required' });
    }

    // Verify the requesting user belongs to the same company as the target user
    const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
    if (userRes.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    const targetRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId]);
    if (targetRes.rows.length === 0) return res.status(404).json({ success: false, message: 'Target user not found' });
    if (userRes.rows[0].company_id !== targetRes.rows[0].company_id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const result = await pool.query(
      `SELECT te.*, 
              p.name as project_name, 
              p.address as project_address,
              COALESCE(te.total_wage, 0) as total_wage,
              COALESCE(te.regular_hours, 0) as regular_hours,
              COALESCE(te.overtime_hours, 0) as overtime_hours,
              COALESCE(te.break_minutes, 0) as break_minutes,
              COALESCE(te.alerts, '{}') as alerts
       FROM time_entries te
       LEFT JOIN projects p ON te.project_id = p.id
       WHERE te.user_id = $1
         AND te.clock_in >= $2::date
         AND te.clock_in <= $3::date
       ORDER BY te.clock_in DESC`,
      [userId, start, end]
    );

    // Map rows to the expected shape (including hours as string)
    const entries = result.rows.map((row: any) => ({
      ...row,
      hours: row.regular_hours ? row.regular_hours.toFixed(2) : '0.00',
      overtimeHours: row.overtime_hours ? row.overtime_hours.toFixed(2) : '0.00',
      regularHours: row.regular_hours ? row.regular_hours.toFixed(2) : '0.00',
      is_manual: row.is_manual || false,
      alerts: row.alerts || [],
      attachments: [], // we can join later
    }));

    res.json({ success: true, entries });
  } catch (error: any) {
    console.error('Error fetching time entries:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/time-entries/clock-in
router.post('/clock-in', async (req: Request, res: Response) => {
  // ... (existing logic, but ensure it returns the created entry)
});

// POST /api/time-entries/clock-out
router.post('/clock-out', async (req: Request, res: Response) => {
  // ... (existing logic, but compute regular_hours, overtime_hours, total_wage)
  // We'll add the calculation later if needed.
});

export default router;