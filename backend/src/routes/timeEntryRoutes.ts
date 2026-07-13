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

    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'User not found' });
    }
    const projectCheck = await pool.query('SELECT id FROM projects WHERE id = $1', [projectId]);
    if (projectCheck.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Project not found' });
    }

    const activeCheck = await pool.query(
      'SELECT id FROM time_entries WHERE user_id = $1 AND clock_out IS NULL',
      [userId]
    );
    if (activeCheck.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'Already clocked in' });
    }

    const result = await pool.query(
      `INSERT INTO time_entries (user_id, project_id, clock_in, latitude, longitude, created_at, status)
       VALUES ($1, $2, NOW(), $3, $4, NOW(), 'active') RETURNING id, clock_in`,
      [userId, projectId, latitude || 0, longitude || 0]
    );
    const entry = result.rows[0];

    await pool.query(
      `INSERT INTO gps_tracking (user_id, time_entry_id, project_id, latitude, longitude, timestamp)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [userId, entry.id, projectId, latitude || 0, longitude || 0]
    );

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

// ─── POST /api/time-entries/clock-out ─── (with overtime)
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

    const companyId = row.company_id;
    const settingsRes = await pool.query(
      `SELECT overtime_enabled, overtime_threshold_hours, overtime_multiplier FROM companies WHERE id = $1`,
      [companyId]
    );
    const settings = settingsRes.rows[0] || { overtime_enabled: true, overtime_threshold_hours: 40, overtime_multiplier: 1.5 };
    const threshold = settings.overtime_enabled ? settings.overtime_threshold_hours : Infinity;
    const multiplier = settings.overtime_multiplier || 1.5;

    const regularHours = Math.min(hoursWorked, threshold);
    const overtimeHours = Math.max(hoursWorked - threshold, 0);
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

// ─── GET /api/time-entries/export ─── (CSV export)
router.get('/export', async (req: Request, res: Response) => {
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
      `SELECT te.*, p.name as project_name
       FROM time_entries te
       LEFT JOIN projects p ON te.project_id = p.id
       WHERE te.user_id = $1
         AND te.clock_in >= $2::date
         AND te.clock_in <= $3::date
       ORDER BY te.clock_in DESC`,
      [userId, start, end]
    );

    const rows = result.rows;
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No entries found for the period' });
    }

    // Helper to safely format numeric values (added only for this route)
    const safeToFixed = (value: any, decimals: number = 2): string => {
      const num = Number(value);
      return isNaN(num) ? '0.00' : num.toFixed(decimals);
    };

    let csv = 'Date,Clock In,Clock Out,Project,Hours,Regular,Overtime,Wage\n';
    for (const row of rows) {
      const date = new Date(row.clock_in).toLocaleDateString();
      const clockIn = new Date(row.clock_in).toLocaleTimeString();
      const clockOut = row.clock_out ? new Date(row.clock_out).toLocaleTimeString() : '';
      const project = row.project_name || '';

      let hours = '0.00';
      if (row.clock_out) {
        const diffMs = new Date(row.clock_out).getTime() - new Date(row.clock_in).getTime();
        hours = (diffMs / 3600000).toFixed(2);
      }

      // ✅ Safely convert to number before using .toFixed()
      const regular = safeToFixed(row.regular_hours);
      const overtime = safeToFixed(row.overtime_hours);
      const wage = safeToFixed(row.total_wage);

      csv += `${date},${clockIn},${clockOut},${project},${hours},${regular},${overtime},${wage}\n`;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=timesheet_${start}_${end}.csv`);
    res.send(csv);
  } catch (error: any) {
    console.error('Export error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── POST /api/time-entries/bulk-clock-in ───
router.post('/bulk-clock-in', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const decoded = verifyToken(req);

    // Only bosses and managers can do bulk actions
    const userCheck = await pool.query('SELECT role FROM users WHERE id = $1', [decoded.id]);
    if (userCheck.rows.length === 0 || !['boss', 'manager'].includes(userCheck.rows[0].role)) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }

    const { userIds, projectId, latitude, longitude } = req.body;
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ success: false, message: 'userIds array required' });
    }
    if (!projectId) {
      return res.status(400).json({ success: false, message: 'projectId required' });
    }

    // Optional: verify that all userIds belong to the same company
    const companyCheck = await pool.query(
      `SELECT company_id FROM users WHERE id = ANY($1::uuid[]) GROUP BY company_id`,
      [userIds]
    );
    if (companyCheck.rows.length !== 1) {
      return res.status(400).json({ success: false, message: 'All users must belong to the same company' });
    }

    const results = [];
    for (const userId of userIds) {
      // Check if already clocked in
      const active = await pool.query(
        'SELECT id FROM time_entries WHERE user_id = $1 AND clock_out IS NULL',
        [userId]
      );
      if (active.rows.length > 0) {
        results.push({ userId, success: false, message: 'Already clocked in' });
        continue;
      }

      const result = await pool.query(
        `INSERT INTO time_entries (user_id, project_id, clock_in, latitude, longitude, created_at, status)
         VALUES ($1, $2, NOW(), $3, $4, NOW(), 'active') RETURNING id, clock_in`,
        [userId, projectId, latitude || 0, longitude || 0]
      );
      const entry = result.rows[0];
      await pool.query(
        `INSERT INTO gps_tracking (user_id, time_entry_id, project_id, latitude, longitude, timestamp)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [userId, entry.id, projectId, latitude || 0, longitude || 0]
      );
      results.push({ userId, success: true, timeEntryId: entry.id });
    }

    res.json({ success: true, results });
  } catch (error: any) {
    console.error('Bulk clock-in error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── POST /api/time-entries/bulk-clock-out ───
router.post('/bulk-clock-out', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const decoded = verifyToken(req);

    const userCheck = await pool.query('SELECT role FROM users WHERE id = $1', [decoded.id]);
    if (userCheck.rows.length === 0 || !['boss', 'manager'].includes(userCheck.rows[0].role)) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }

    const { userIds, latitude, longitude } = req.body;
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ success: false, message: 'userIds array required' });
    }

    const results = [];
    for (const userId of userIds) {
      // Find active entry
      const active = await pool.query(
        `SELECT te.*, u.company_id FROM time_entries te
         JOIN users u ON te.user_id = u.id
         WHERE te.user_id = $1 AND te.clock_out IS NULL`,
        [userId]
      );
      if (active.rows.length === 0) {
        results.push({ userId, success: false, message: 'No active clock-in found' });
        continue;
      }
      const row = active.rows[0];
      const clockIn = new Date(row.clock_in);
      const now = new Date();
      const hoursWorked = (now.getTime() - clockIn.getTime()) / 3600000;

      // Get overtime settings from company
      const settingsRes = await pool.query(
        `SELECT overtime_enabled, overtime_threshold_hours, overtime_multiplier FROM companies WHERE id = $1`,
        [row.company_id]
      );
      const settings = settingsRes.rows[0] || { overtime_enabled: true, overtime_threshold_hours: 40, overtime_multiplier: 1.5 };
      const threshold = settings.overtime_enabled ? settings.overtime_threshold_hours : Infinity;
      const multiplier = settings.overtime_multiplier || 1.5;
      const regularHours = Math.min(hoursWorked, threshold);
      const overtimeHours = Math.max(hoursWorked - threshold, 0);
      const hourlyRate = 20; // could be fetched from settings later
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
        [latitude || 0, longitude || 0, regularHours, overtimeHours, totalWage, row.id, userId]
      );
      results.push({
        userId,
        success: true,
        timeEntryId: result.rows[0].id,
        clockOut: result.rows[0].clock_out,
        regularHours,
        overtimeHours,
        totalWage,
      });
    }

    res.json({ success: true, results });
  } catch (error: any) {
    console.error('Bulk clock-out error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;