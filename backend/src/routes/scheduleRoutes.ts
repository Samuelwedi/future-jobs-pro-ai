import { verifyToken } from '../utils/auth';
import express, { Request, Response } from 'express';
import { pool } from '../config/database';

const router = express.Router();

// Public build information only. Operational schedule data always requires authentication.
router.get('/version', (req: Request, res: Response) => {
  res.json({ version: '2.0.5', fixed: 'recurring shifts support added' });
});

// ========== AUTH-PROTECTED ROUTES ==========

const getCompanyId = async (req: Request): Promise<string | null> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = verifyToken(req);
    const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
    return userRes.rows[0]?.company_id || null;
  } catch { return null; }
};

const getActor = async (req: Request) => {
  const decoded = verifyToken(req);
  const result = await pool.query('SELECT id, company_id, role FROM users WHERE id = $1', [decoded.id]);
  if (!result.rowCount) throw new Error('Authenticated user was not found');
  return { id: String(result.rows[0].id), companyId: String(result.rows[0].company_id || ''), role: String(result.rows[0].role || '') };
};

const canManageSchedule = (role: string) => ['boss', 'manager', 'admin'].includes(role);

// GET /api/schedule/shifts?start=&end= (company‑scoped)
router.get('/shifts', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const { start, end } = req.query;
    let query = `
      SELECT s.* 
      FROM shifts s
      JOIN projects p ON s.project_id = p.id
      WHERE p.company_id = $1
    `;
    const params: any[] = [companyId];
    if (start) { query += ' AND s.date::date >= $' + (params.length + 1); params.push(start); }
    if (end)   { query += ' AND s.date::date <= $' + (params.length + 1); params.push(end); }
    query += ' ORDER BY s.date, s.start_time';
    const result = await pool.query(query, params);
    res.json({ success: true, shifts: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ===== FIXED my-shifts (without test bypass) =====
router.get('/my-shifts', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const decoded = verifyToken(req);

    const { userId, start, end } = req.query;
    if (!userId || !start || !end) {
      return res.status(400).json({ success: false, message: 'userId, start, and end are required' });
    }

    // Get company IDs
    const requestUserRes = await pool.query('SELECT company_id, role FROM users WHERE id = $1', [decoded.id]);
    if (requestUserRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Requesting user not found' });
    }
    const requestCompanyId = requestUserRes.rows[0].company_id;

    const targetUserRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId]);
    if (targetUserRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Target user not found' });
    }
    const targetCompanyId = targetUserRes.rows[0].company_id;

    if (requestCompanyId !== targetCompanyId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    if (String(userId) !== String(decoded.id) && !canManageSchedule(String(requestUserRes.rows[0].role || ''))) {
      return res.status(403).json({ success: false, message: 'Manager access is required to view another employee schedule' });
    }

    const result = await pool.query(
      `SELECT s.*, 
              array_agg(DISTINCT sa.user_id) FILTER (WHERE sa.user_id IS NOT NULL) AS assigned_user_ids,
              p.name as project_name,
              p.address as project_address
       FROM shifts s
       LEFT JOIN shift_assignments sa ON s.id = sa.shift_id
       LEFT JOIN projects p ON s.project_id = p.id
       WHERE (s.user_id = $1 OR sa.user_id = $1)
         AND s.date >= $2::date
         AND s.date < $3::date + interval '1 day'
       GROUP BY s.id, p.name, p.address
       ORDER BY s.date, s.start_time`,
      [userId, start, end]
    );
    res.json({ success: true, shifts: result.rows });
  } catch (error: any) {
    console.error('❌ Error in my-shifts:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ===== POST /shifts (updated to support recurring_shift_id) =====
router.post('/shifts', async (req: Request, res: Response) => {
  try {
    const current = await getActor(req);
    const companyId = current.companyId;
    if (!companyId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    if (!canManageSchedule(current.role)) return res.status(403).json({ success: false, message: 'Manager access is required to create shifts' });

    const {
      name,
      date,
      startTime: start,
      endTime: end,
      projectId,
      notes,
      employeeIds,
      attachmentUrl,
      attachmentType,
      recurringShiftId, // NEW: optional UUID from recurring_shifts
    } = req.body;

    if (!name || !date || !start || !end) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    if (projectId) {
      const projectCheck = await pool.query(
        'SELECT company_id FROM projects WHERE id = $1 AND company_id = $2',
        [projectId, companyId]
      );
      if (projectCheck.rows.length === 0) {
        return res.status(403).json({ success: false, message: 'Project not found or does not belong to your company' });
      }
    }

    if (employeeIds && Array.isArray(employeeIds) && employeeIds.length > 0) {
      const uniqueEmployeeIds = [...new Set(employeeIds.map(String))];
      const validEmployees = await pool.query(
        'SELECT id FROM users WHERE company_id = $1 AND id = ANY($2::uuid[])',
        [companyId, uniqueEmployeeIds],
      );
      if (validEmployees.rowCount !== uniqueEmployeeIds.length) {
        return res.status(403).json({ success: false, message: 'Every assigned employee must belong to your company' });
      }
    }

    let userId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = verifyToken(req);
        userId = decoded.id;
      } catch { /* ignore */ }
    }

    // Insert shift with optional recurring_shift_id
    const shiftResult = await pool.query(
      `INSERT INTO shifts
       (name, date, start_time, end_time, project_id, notes, created_by,
        attachment_url, attachment_type, user_id, recurring_shift_id)
       VALUES ($1, $2::date, $3::time, $4::time, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        name,
        date,
        start,
        end,
        projectId || null,
        notes || null,
        userId,
        attachmentUrl || null,
        attachmentType || null,
        userId,
        recurringShiftId || null,
      ]
    );
    const shift = shiftResult.rows[0];

    if (employeeIds && Array.isArray(employeeIds) && employeeIds.length > 0) {
      for (const empId of employeeIds) {
        await pool.query(
          `INSERT INTO shift_assignments (shift_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [shift.id, empId]
        );
      }
    }

    res.status(201).json({ success: true, shift });
  } catch (error: any) {
    console.error('❌ Create shift error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ===== PUT /shifts/:id (updated to support recurring_shift_id) =====
router.put('/shifts/:id', async (req: Request, res: Response) => {
  try {
    const current = await getActor(req);
    const companyId = current.companyId;
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });
    if (!canManageSchedule(current.role)) return res.status(403).json({ success: false, message: 'Manager access is required to update shifts' });

    const {
      name,
      date,
      startTime,
      endTime,
      notes,
      employeeIds,
      attachmentUrl,
      attachmentType,
      recurringShiftId, // NEW: optional
    } = req.body;

    const checkResult = await pool.query(
      `SELECT s.id 
       FROM shifts s
       JOIN projects p ON s.project_id = p.id
       WHERE s.id = $1 AND p.company_id = $2`,
      [req.params.id, companyId]
    );
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Shift not found or unauthorized' });
    }

    const result = await pool.query(
      `UPDATE shifts
       SET name=$1, date=$2::date, start_time=$3::time, end_time=$4::time,
           notes=$5, attachment_url=$6, attachment_type=$7, recurring_shift_id=$8
       WHERE id=$9 RETURNING *`,
      [
        name,
        date,
        startTime,
        endTime,
        notes,
        attachmentUrl || null,
        attachmentType || null,
        recurringShiftId || null,
        req.params.id,
      ]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Shift not found' });

    if (employeeIds && Array.isArray(employeeIds)) {
      await pool.query('DELETE FROM shift_assignments WHERE shift_id = $1', [req.params.id]);
      for (const empId of employeeIds) {
        await pool.query(
          `INSERT INTO shift_assignments (shift_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [req.params.id, empId]
        );
      }
    }

    res.json({ success: true, shift: result.rows[0] });
  } catch (error: any) {
    console.error('❌ Update shift error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ===== DELETE /shifts/:id (unchanged) =====
router.delete('/shifts/:id', async (req: Request, res: Response) => {
  try {
    const current = await getActor(req);
    const companyId = current.companyId;
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });
    if (!canManageSchedule(current.role)) return res.status(403).json({ success: false, message: 'Manager access is required to delete shifts' });

    const checkResult = await pool.query(
      `SELECT s.id 
       FROM shifts s
       JOIN projects p ON s.project_id = p.id
       WHERE s.id = $1 AND p.company_id = $2`,
      [req.params.id, companyId]
    );
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Shift not found or unauthorized' });
    }

    await pool.query('DELETE FROM shift_assignments WHERE shift_id = $1', [req.params.id]);
    await pool.query('DELETE FROM shifts WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Shift deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ===== NEW: GET /api/schedule/calendar – combined one‑off + recurring events =====
router.get('/calendar', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { start, end } = req.query;
    const startStr = Array.isArray(start) ? start[0] : start;
    const endStr = Array.isArray(end) ? end[0] : end;
    if (typeof startStr !== 'string' || typeof endStr !== 'string') {
      return res.status(400).json({ success: false, message: 'start and end date required' });
    }

    // 1. Fetch all one‑off shifts (non‑recurring) in the date range
    const shiftsResult = await pool.query(
      `SELECT s.*,
              array_agg(DISTINCT sa.user_id) FILTER (WHERE sa.user_id IS NOT NULL) AS assigned_user_ids,
              p.name as project_name,
              u.first_name || ' ' || u.last_name as employee_name
       FROM shifts s
       LEFT JOIN shift_assignments sa ON s.id = sa.shift_id
       LEFT JOIN projects p ON s.project_id = p.id
       LEFT JOIN users u ON s.user_id = u.id
       WHERE s.company_id = $1
         AND s.date >= $2::date AND s.date <= $3::date
         AND s.recurring_shift_id IS NULL
       GROUP BY s.id, p.name, u.id
       ORDER BY s.date, s.start_time`,
      [companyId, startStr, endStr]
    );

    // 2. Fetch all recurring rules that have any occurrence in the range
    const recurringResult = await pool.query(
      `SELECT rs.*,
              u.first_name || ' ' || u.last_name as employee_name,
              p.name as project_name
       FROM recurring_shifts rs
       LEFT JOIN users u ON rs.employee_id = u.id
       LEFT JOIN projects p ON rs.project_id = p.id
       WHERE rs.company_id = $1 AND rs.is_active = true
         AND rs.start_date <= $3::date
         AND (rs.end_date IS NULL OR rs.end_date >= $2::date)`,
      [companyId, startStr, endStr]
    );

    // 3. Expand recurring rules into individual events for the date range
    const recurringEvents = [];
    const startDate = new Date(startStr);
    const endDate = new Date(endStr);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);

    for (const rule of recurringResult.rows) {
      let current = new Date(startDate);
      while (current <= endDate) {
        if (current.getDay() === rule.day_of_week) {
          // Check if this occurrence is within the rule's start/end dates
          const occurrenceDate = new Date(current);
          if (occurrenceDate < new Date(rule.start_date)) {
            current.setDate(current.getDate() + 1);
            continue;
          }
          if (rule.end_date && occurrenceDate > new Date(rule.end_date)) {
            current.setDate(current.getDate() + 1);
            continue;
          }

          const [sh, sm] = rule.start_time.split(':').map(Number);
          const [eh, em] = rule.end_time.split(':').map(Number);
          const startTime = new Date(occurrenceDate);
          startTime.setHours(sh, sm, 0, 0);
          const endTime = new Date(occurrenceDate);
          endTime.setHours(eh, em, 0, 0);

          recurringEvents.push({
            id: `recurring-${rule.id}-${occurrenceDate.toISOString().split('T')[0]}`,
            name: rule.title || 'Recurring Shift',
            date: occurrenceDate.toISOString().split('T')[0],
            start_time: rule.start_time,
            end_time: rule.end_time,
            project_id: rule.project_id,
            user_id: rule.employee_id,
            recurring_shift_id: rule.id,
            is_recurring: true,
            employee_name: rule.employee_name || 'Unassigned',
            project_name: rule.project_name || null,
            // Additional fields to match one‑off shifts
            attachment_url: null,
            attachment_type: null,
            notes: null,
            created_by: rule.created_by,
            assigned_user_ids: [rule.employee_id], // assume assigned to the employee
          });
        }
        current.setDate(current.getDate() + 1);
      }
    }

    const combined = [...shiftsResult.rows, ...recurringEvents];
    res.json({ success: true, events: combined });
  } catch (error) {
    console.error('❌ Error fetching calendar:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
