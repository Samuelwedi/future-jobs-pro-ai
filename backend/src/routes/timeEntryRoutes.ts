import express, { Request, Response } from 'express';
import { pool } from '../config/database';
import { verifyToken } from '../utils/auth';

const router = express.Router();

// ─── GET /api/time-entries ───
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

    // Verify same company
    const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
    if (userRes.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    const targetRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId]);
    if (targetRes.rows.length === 0) return res.status(404).json({ success: false, message: 'Target user not found' });
    if (userRes.rows[0].company_id !== targetRes.rows[0].company_id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const result = await pool.query(
      `SELECT te.*, p.name as project_name, p.address as project_address
       FROM time_entries te
       LEFT JOIN projects p ON te.project_id = p.id
       WHERE te.user_id = $1
         AND te.clock_in >= $2::date
         AND te.clock_in <= $3::date
       ORDER BY te.clock_in DESC`,
      [userId, start, end]
    );

    const entries = result.rows.map((row: any) => ({
      id: row.id,
      project_name: row.project_name || 'Unknown',
      project_address: row.project_address || '',
      clock_in: row.clock_in,
      clock_out: row.clock_out,
      break_minutes: row.break_minutes || 0,
      hours: row.clock_out
        ? ((new Date(row.clock_out).getTime() - new Date(row.clock_in).getTime()) / 3600000).toFixed(2)
        : '0.00',
      regularHours: row.regular_hours ? Number(row.regular_hours).toFixed(2) : '0.00',
      overtimeHours: row.overtime_hours ? Number(row.overtime_hours).toFixed(2) : '0.00',
      alerts: row.alerts || [],
      is_manual: row.is_manual || false,
      attachments: [],
    }));

    res.json({ success: true, entries });
  } catch (error: any) {
    console.error('Error fetching time entries:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── GET /api/time-entries/active ───
router.get('/active', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const decoded = verifyToken(req);
    const userId = decoded.id; // Use authenticated user ID

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
    const row = result.rows[0];
    const entry = {
      id: row.id,
      project_id: row.project_id,
      project_name: row.project_name || 'Unknown',
      clock_in: row.clock_in,
      duration_seconds: Math.floor((Date.now() - new Date(row.clock_in).getTime()) / 1000),
    };
    res.json({ success: true, entry });
  } catch (error: any) {
    console.error('Error fetching active entry:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── POST /api/time-entries/clock-in ───
router.post('/clock-in', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const decoded = verifyToken(req);
    const userId = decoded.id; // Use authenticated user ID
    const { projectId, latitude, longitude } = req.body;

    console.log('📥 Clock-in request:', { userId, projectId, latitude, longitude });

    if (!projectId) {
      return res.status(400).json({ success: false, message: 'projectId is required' });
    }

    // Check if already clocked in
    const activeCheck = await pool.query(
      'SELECT id FROM time_entries WHERE user_id = $1 AND clock_out IS NULL',
      [userId]
    );
    if (activeCheck.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'Already clocked in' });
    }

    const result = await pool.query(
      `INSERT INTO time_entries (user_id, project_id, clock_in, latitude, longitude, created_at)
       VALUES ($1, $2, NOW(), $3, $4, NOW()) RETURNING id, clock_in`,
      [userId, projectId, latitude || 0, longitude || 0]
    );
    const entry = result.rows[0];
    res.status(201).json({
      success: true,
      message: 'Clocked in successfully',
      timeEntryId: entry.id,
      clockIn: entry.clock_in,
    });
  } catch (error: any) {
    console.error('Clock-in error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── POST /api/time-entries/clock-out ───
router.post('/clock-out', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const decoded = verifyToken(req);
    const userId = decoded.id; // Use authenticated user ID
    const { timeEntryId, latitude, longitude } = req.body;

    if (!timeEntryId) {
      return res.status(400).json({ success: false, message: 'timeEntryId is required' });
    }

    // Verify the entry belongs to the user and is still open
    const check = await pool.query(
      'SELECT clock_in FROM time_entries WHERE id = $1 AND user_id = $2 AND clock_out IS NULL',
      [timeEntryId, userId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Active time entry not found' });
    }
    const clockIn = new Date(check.rows[0].clock_in);
    const now = new Date();
    const diffMs = now.getTime() - clockIn.getTime();
    const hoursWorked = diffMs / 3600000;

    // Compute regular and overtime (simple: 8h regular, rest overtime)
    const regularHours = Math.min(hoursWorked, 8);
    const overtimeHours = Math.max(hoursWorked - 8, 0);
    const hourlyRate = 20; // Placeholder
    const totalWage = (regularHours + overtimeHours * 1.5) * hourlyRate;

    const result = await pool.query(
      `UPDATE time_entries
       SET clock_out = NOW(),
           latitude_out = $1,
           longitude_out = $2,
           regular_hours = $3,
           overtime_hours = $4,
           total_wage = $5
       WHERE id = $6 AND user_id = $7
       RETURNING id, clock_out`,
      [latitude || 0, longitude || 0, regularHours, overtimeHours, totalWage, timeEntryId, userId]
    );
    res.json({
      success: true,
      message: 'Clocked out successfully',
      timeEntryId: result.rows[0].id,
      clockOut: result.rows[0].clock_out,
      regularHours,
      overtimeHours,
      totalWage,
    });
  } catch (error: any) {
    console.error('Clock-out error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;