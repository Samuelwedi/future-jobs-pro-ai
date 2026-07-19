import express, { Request, Response } from 'express';
import { pool } from '../config/database';
import { verifyToken } from '../utils/auth';
import { generateShiftsForRecurringRule } from '../services/recurringShiftGenerator';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        companyId: string;
        [key: string]: any;
      };
    }
  }
}

const router = express.Router();

// ---------- Middleware to get user from token ----------
type AuthenticatedUser = {
  id: string;
  companyId: string;
  [key: string]: any;
};

const getUser = async (req: Request, res: Response, next: Function) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const decoded = verifyToken(req) as AuthenticatedUser;
    if (!decoded?.id || !decoded?.companyId) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Authentication failed' });
  }
};

// ---------- GET /api/recurring-shifts ----------
// List all active recurring shifts for the user's company
router.get('/', getUser, async (req: Request, res: Response) => {
  try {
    const companyId = req.user.companyId;
    const result = await pool.query(
      `SELECT rs.*,
              u.first_name || ' ' || u.last_name as employee_name,
              p.name as project_name
       FROM recurring_shifts rs
       LEFT JOIN users u ON rs.employee_id = u.id
       LEFT JOIN projects p ON rs.project_id = p.id
       WHERE rs.company_id = $1 AND rs.is_active = true
       ORDER BY rs.day_of_week, rs.start_time`,
      [companyId]
    );
    res.json({ success: true, shifts: result.rows });
  } catch (error) {
    console.error('Error fetching recurring shifts:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ---------- GET /api/recurring-shifts/:id ----------
// Get a single recurring rule by ID
router.get('/:id', getUser, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const companyId = req.user.companyId;
    const result = await pool.query(
      `SELECT * FROM recurring_shifts WHERE id = $1 AND company_id = $2 AND is_active = true`,
      [id, companyId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Recurring shift not found' });
    }
    res.json({ success: true, shift: result.rows[0] });
  } catch (error) {
    console.error('Error fetching recurring shift:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ---------- POST /api/recurring-shifts ----------
// Create a new recurring shift rule
router.post('/', getUser, async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const {
      projectId,
      title,
      employeeId,
      dayOfWeek,
      startTime,
      endTime,
      startDate,
      endDate,
    } = req.body;

    const userId = req.user.id;
    const companyId = req.user.companyId;

    // Validate required fields
    if (!employeeId || dayOfWeek === undefined || !startTime || !endTime || !startDate) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: employeeId, dayOfWeek, startTime, endTime, startDate',
      });
    }

    // Ensure the employee belongs to the same company
    const employeeCheck = await client.query(
      'SELECT id FROM users WHERE id = $1 AND company_id = $2',
      [employeeId, companyId]
    );
    if (employeeCheck.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Employee not found in your company' });
    }

    // Insert the recurring rule
    const result = await client.query(
      `INSERT INTO recurring_shifts
       (company_id, project_id, title, employee_id, day_of_week,
        start_time, end_time, start_date, end_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        companyId,
        projectId || null,
        title || 'Recurring Shift',
        employeeId,
        dayOfWeek,
        startTime,
        endTime,
        startDate,
        endDate || null,
        userId,
      ]
    );

    const recurringShiftId = result.rows[0].id;

    await client.query('COMMIT');
    res.status(201).json({
      success: true,
      id: recurringShiftId,
      message: 'Recurring shift created successfully',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating recurring shift:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    client.release();
  }
});

// ---------- PUT /api/recurring-shifts/:id ----------
// Update a recurring shift rule
router.put('/:id', getUser, async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const {
      projectId,
      title,
      employeeId,
      dayOfWeek,
      startTime,
      endTime,
      startDate,
      endDate,
      isActive,
    } = req.body;

    const companyId = req.user.companyId;

    // Check if the rule exists and belongs to this company
    const existing = await client.query(
      'SELECT id FROM recurring_shifts WHERE id = $1 AND company_id = $2',
      [id, companyId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Recurring shift not found' });
    }

    // Build dynamic update query (only update provided fields)
    const updates: string[] = [];
    const values: any[] = [];
    let paramCounter = 1;

    if (projectId !== undefined) {
      updates.push(`project_id = $${paramCounter++}`);
      values.push(projectId);
    }
    if (title !== undefined) {
      updates.push(`title = $${paramCounter++}`);
      values.push(title);
    }
    if (employeeId !== undefined) {
      updates.push(`employee_id = $${paramCounter++}`);
      values.push(employeeId);
    }
    if (dayOfWeek !== undefined) {
      updates.push(`day_of_week = $${paramCounter++}`);
      values.push(dayOfWeek);
    }
    if (startTime !== undefined) {
      updates.push(`start_time = $${paramCounter++}`);
      values.push(startTime);
    }
    if (endTime !== undefined) {
      updates.push(`end_time = $${paramCounter++}`);
      values.push(endTime);
    }
    if (startDate !== undefined) {
      updates.push(`start_date = $${paramCounter++}`);
      values.push(startDate);
    }
    if (endDate !== undefined) {
      updates.push(`end_date = $${paramCounter++}`);
      values.push(endDate);
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${paramCounter++}`);
      values.push(isActive);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE recurring_shifts
      SET ${updates.join(', ')}
      WHERE id = $${paramCounter}
      RETURNING id
    `;

    const result = await client.query(query, values);
    await client.query('COMMIT');

    res.json({
      success: true,
      id: result.rows[0].id,
      message: 'Recurring shift updated successfully',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating recurring shift:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    client.release();
  }
});

// ---------- DELETE /api/recurring-shifts/:id ----------
// Soft delete (set is_active = false)
router.delete('/:id', getUser, async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const companyId = req.user.companyId;

    const result = await client.query(
      `UPDATE recurring_shifts
       SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND company_id = $2
       RETURNING id`,
      [id, companyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Recurring shift not found' });
    }

    await client.query('COMMIT');
    res.json({ success: true, message: 'Recurring shift deactivated' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting recurring shift:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    client.release();
  }
});

// ---------- POST /api/recurring-shifts/:id/generate ----------
// Generate actual shift records from a recurring rule for a date range
router.post('/:id/generate', getUser, async (req: Request<{ id: string }>, res: Response) => {
  const { id } = req.params;
  const { startDate, endDate } = req.body; // ISO date strings

  if (!startDate || !endDate) {
    return res.status(400).json({ success: false, message: 'startDate and endDate required' });
  }

  try {
    const companyId = req.user.companyId;
    const createdBy = req.user.id;

    const generated = await generateShiftsForRecurringRule({
      recurringShiftId: id,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      companyId,
      createdBy,
    });

    res.json({ success: true, generated, message: `Generated ${generated} shifts` });
  } catch (error) {
    console.error('Error generating shifts:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to generate shifts' });
  }
});

export default router;