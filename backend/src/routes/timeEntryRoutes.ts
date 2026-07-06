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

    // ... (company check)
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
              COALESCE(te.total_wage, 0)::text as total_wage,
              COALESCE(te.regular_hours, 0)::text as regular_hours,
              COALESCE(te.overtime_hours, 0)::text as overtime_hours,
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

    // Convert to the expected shape
    const entries = result.rows.map((row: any) => ({
      ...row,
      hours: row.regular_hours || '0.00',
      overtimeHours: row.overtime_hours || '0.00',
      regularHours: row.regular_hours || '0.00',
      is_manual: row.is_manual || false,
      alerts: row.alerts || [],
      attachments: [],
    }));

    res.json({ success: true, entries });
  } catch (error: any) {
    console.error('Error fetching time entries:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/time-entries/clock-in
router.post('/clock-in', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const decoded = verifyToken(req);
    const { userId, projectId, latitude, longitude } = req.body;
    if (!userId || !projectId) {
      return res.status(400).json({ success: false, message: 'userId and projectId required' });
    }

    // Ensure the requesting user matches the userId (or is boss/manager?)
    // For simplicity, we allow users to clock in for themselves only.
    if (decoded.id !== userId) {
      // Optionally allow boss/manager to clock in others? For now, restrict.
      return res.status(403).json({ success: false, message: 'You can only clock in for yourself' });
    }

    // Check if already clocked in
    const activeCheck = await pool.query(
      'SELECT id FROM time_entries WHERE user_id = $1 AND clock_out IS NULL',
      [userId]
    );
    if (activeCheck.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'Already clocked in' });
    }

    const clockInTime = new Date().toISOString();
    const result = await pool.query(
      `INSERT INTO time_entries (user_id, project_id, clock_in, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, clock_in, project_id`,
      [userId, projectId, clockInTime, latitude || 0, longitude || 0]
    );
    const entry = result.rows[0];
    res.json({ success: true, ...entry });
  } catch (error: any) {
    console.error('Clock-in error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/time-entries/clock-out
router.post('/clock-out', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const decoded = verifyToken(req);
    const { userId, timeEntryId, latitude, longitude } = req.body;
    if (!userId || !timeEntryId) {
      return res.status(400).json({ success: false, message: 'userId and timeEntryId required' });
    }

    // Verify ownership
    const checkRes = await pool.query(
      'SELECT id, clock_in FROM time_entries WHERE id = $1 AND user_id = $2 AND clock_out IS NULL',
      [timeEntryId, userId]
    );
    if (checkRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No active time entry found' });
    }

    const clockOutTime = new Date().toISOString();
    const clockInTime = new Date(checkRes.rows[0].clock_in);
    const diffMs = new Date(clockOutTime).getTime() - clockInTime.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    // For now, set regular_hours = diffHours, overtime_hours = 0 (we'll add logic later)
    const regularHours = Math.max(0, Math.min(diffHours, 8)); // simple 8-hour cap
    const overtimeHours = Math.max(0, diffHours - 8);
    const totalWage = regularHours * 20 + overtimeHours * 30; // placeholder rate

    const result = await pool.query(
      `UPDATE time_entries
       SET clock_out = $1,
           latitude_out = $2,
           longitude_out = $3,
           regular_hours = $4,
           overtime_hours = $5,
           total_wage = $6
       WHERE id = $7 RETURNING *`,
      [clockOutTime, latitude || 0, longitude || 0, regularHours, overtimeHours, totalWage, timeEntryId]
    );
    res.json({ success: true, entry: result.rows[0] });
  } catch (error: any) {
    console.error('Clock-out error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/time-entries/active?userId=xxx
router.get('/active', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const decoded = verifyToken(req);
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ success: false, message: 'userId required' });
    if (decoded.id !== userId) {
      // Allow boss/manager? For now restrict.
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const result = await pool.query(
      `SELECT te.*, p.name as project_name
       FROM time_entries te
       LEFT JOIN projects p ON te.project_id = p.id
       WHERE te.user_id = $1 AND te.clock_out IS NULL
       ORDER BY te.clock_in DESC LIMIT 1`,
      [userId]
    );
    if (result.rows.length === 0) {
      return res.json({ success: true, entry: null });
    }
    const entry = result.rows[0];
    res.json({ success: true, entry });
  } catch (error: any) {
    console.error('Active entry error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;