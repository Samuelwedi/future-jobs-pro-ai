// backend/src/routes/timeEntryRoutes.ts
import express, { Request, Response } from 'express';
import { pool } from '../config/database';
import { verifyToken } from '../utils/auth';
import { setCompanyOfficeFromClockIn } from '../services/companyService';

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

    const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const targetRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId]);
    if (targetRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Target user not found' });
    }
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

    const entries = result.rows.map((row: any) => {
      const regularHours = Number(row.regular_hours) || 0;
      const overtimeHours = Number(row.overtime_hours) || 0;
      const breakMinutes = Number(row.break_minutes) || 0;
      const clockIn = new Date(row.clock_in);
      const clockOut = row.clock_out ? new Date(row.clock_out) : null;
      const hours = clockOut ? ((clockOut.getTime() - clockIn.getTime()) / 3600000).toFixed(2) : '0.00';

      return {
        id: row.id,
        project_name: row.project_name || 'Unknown',
        project_address: row.project_address || '',
        clock_in: row.clock_in,
        clock_out: row.clock_out,
        break_minutes: breakMinutes,
        hours: hours,
        regularHours: regularHours.toFixed(2),
        overtimeHours: overtimeHours.toFixed(2),
        alerts: row.alerts || [],
        is_manual: row.is_manual || false,
        attachments: [],
      };
    });

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
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId required' });
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
    const userId = decoded.id;
    const { projectId, latitude, longitude } = req.body;

    console.log('📥 Clock-in request:', { userId, projectId, latitude, longitude });

    if (!projectId) {
      return res.status(400).json({ success: false, message: 'projectId is required' });
    }

    // Check user exists
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'User not found' });
    }

    // Check project exists
    const projectCheck = await pool.query('SELECT id FROM projects WHERE id = $1', [projectId]);
    if (projectCheck.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Project not found' });
    }

    // Check if already clocked in
    const activeCheck = await pool.query(
      'SELECT id FROM time_entries WHERE user_id = $1 AND clock_out IS NULL',
      [userId]
    );
    if (activeCheck.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'Already clocked in' });
    }

    // Insert time entry
    const result = await pool.query(
      `INSERT INTO time_entries (user_id, project_id, clock_in, latitude, longitude, created_at, status)
       VALUES ($1, $2, NOW(), $3, $4, NOW(), 'active') RETURNING id, clock_in`,
      [userId, projectId, latitude || 0, longitude || 0]
    );
    const entry = result.rows[0];

    // Insert first GPS point to start tracking
    await pool.query(
      `INSERT INTO gps_tracking (user_id, time_entry_id, project_id, latitude, longitude, timestamp)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [userId, entry.id, projectId, latitude || 0, longitude || 0]
    );

    // 👇 Set office city if not yet set
    await setCompanyOfficeFromClockIn(userId, latitude || 0, longitude || 0);

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

// ─── POST /api/time-entries/clock-out ─── (UPDATED with overtime settings)
router.post('/clock-out', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const decoded = verifyToken(req);
    const userId = decoded.id;
    const { timeEntryId, latitude, longitude } = req.body;

    if (!timeEntryId) {
      return res.status(400).json({ success: false, message: 'timeEntryId is required' });
    }

    // Get the time entry and user's company
    const check = await pool.query(
      `SELECT te.*, u.company_id FROM time_entries te JOIN users u ON te.user_id = u.id WHERE te.id = $1 AND te.user_id = $2 AND te.clock_out IS NULL`,
      [timeEntryId, userId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Active time entry not found' });
    }
    const row = check.rows[0];
    const clockIn = new Date(row.clock_in);
    const now = new Date();
    const diffMs = now.getTime() - clockIn.getTime();
    const hoursWorked = diffMs / 3600000;

    // ─── Fetch company overtime settings ───
    const companyId = row.company_id;
    const settingsRes = await pool.query(
      `SELECT overtime_enabled, overtime_threshold_hours, overtime_multiplier FROM companies WHERE id = $1`,
      [companyId]
    );
    const settings = settingsRes.rows[0] || { overtime_enabled: true, overtime_threshold_hours: 40, overtime_multiplier: 1.5 };
    const threshold = settings.overtime_enabled ? settings.overtime_threshold_hours : Infinity;
    const multiplier = settings.overtime_multiplier || 1.5;

    // Calculate regular and overtime hours
    const regularHours = Math.min(hoursWorked, threshold);
    const overtimeHours = Math.max(hoursWorked - threshold, 0);

    // Hourly rate (can later be per‑company or per‑user; default $20)
    const hourlyRate = 20;

    const totalWage = (regularHours + overtimeHours * multiplier) * hourlyRate;

    const result = await pool.query(
      `UPDATE time_entries
       SET clock_out = NOW(),
           latitude_out = $1,
           longitude_out = $2,
           regular_hours = $3,
           overtime_hours = $4,
           total_wage = $5,
           status = 'completed'
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

// ─── GET /api/companies/:companyId/settings ─── (fetch overtime settings)
router.get('/companies/:companyId/settings', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const decoded = verifyToken(req);
    const { companyId } = req.params;

    // Verify user belongs to this company
    const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
    if (userRes.rows.length === 0 || userRes.rows[0].company_id !== companyId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const result = await pool.query(
      `SELECT overtime_enabled, overtime_threshold_hours, overtime_multiplier FROM companies WHERE id = $1`,
      [companyId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }
    res.json({ success: true, settings: result.rows[0] });
  } catch (error: any) {
    console.error('Error fetching company settings:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── PUT /api/companies/:companyId/settings ─── (update overtime settings)
router.put('/companies/:companyId/settings', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const decoded = verifyToken(req);
    const { companyId } = req.params;
    const { overtime_enabled, overtime_threshold_hours, overtime_multiplier } = req.body;

    // Only boss/manager can update settings
    const userRes = await pool.query('SELECT company_id, role FROM users WHERE id = $1', [decoded.id]);
    if (userRes.rows.length === 0 || userRes.rows[0].company_id !== companyId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    if (!['boss', 'manager'].includes(userRes.rows[0].role)) {
      return res.status(403).json({ success: false, message: 'Only boss/manager can update settings' });
    }

    // Validate
    if (overtime_enabled !== undefined && typeof overtime_enabled !== 'boolean') {
      return res.status(400).json({ success: false, message: 'overtime_enabled must be boolean' });
    }
    if (overtime_threshold_hours !== undefined && (isNaN(overtime_threshold_hours) || overtime_threshold_hours < 0)) {
      return res.status(400).json({ success: false, message: 'overtime_threshold_hours must be a positive number' });
    }
    if (overtime_multiplier !== undefined && (isNaN(overtime_multiplier) || overtime_multiplier < 1)) {
      return res.status(400).json({ success: false, message: 'overtime_multiplier must be at least 1' });
    }

    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;
    if (overtime_enabled !== undefined) {
      updates.push(`overtime_enabled = $${idx++}`);
      values.push(overtime_enabled);
    }
    if (overtime_threshold_hours !== undefined) {
      updates.push(`overtime_threshold_hours = $${idx++}`);
      values.push(overtime_threshold_hours);
    }
    if (overtime_multiplier !== undefined) {
      updates.push(`overtime_multiplier = $${idx++}`);
      values.push(overtime_multiplier);
    }
    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }
    values.push(companyId);
    const query = `UPDATE companies SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`;
    const result = await pool.query(query, values);
    res.json({ success: true, settings: result.rows[0] });
  } catch (error: any) {
    console.error('Error updating company settings:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;