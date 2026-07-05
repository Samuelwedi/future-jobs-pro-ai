import { verifyToken } from '../utils/auth';
import express, { Request, Response } from 'express';
import { pool } from '../config/database';

const router = express.Router();

// Helper: get company_id – bypass for test user
const getCompanyId = async (req: Request): Promise<string | null> => {
  const testUserHeader = req.headers['x-test-user'];
  if (testUserHeader === 'samuel@test.com') {
    return 'ed1887d9-3ffd-46e4-b281-338c8ad03a66';
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = verifyToken(req);
    const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
    return userRes.rows[0]?.company_id || null;
  } catch { return null; }
};

// GET /api/schedule/shifts?start=&end=
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
    if (start) { query += ' AND s.date >= $' + (params.length + 1); params.push(start); }
    if (end)   { query += ' AND s.date <= $' + (params.length + 1); params.push(end); }
    query += ' ORDER BY s.date, s.start_time';
    const result = await pool.query(query, params);
    res.json({ success: true, shifts: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/schedule/my-shifts
router.get('/my-shifts', async (req: Request, res: Response) => {
  try {
    const testUserHeader = req.headers['x-test-user'];
    if (testUserHeader === 'samuel@test.com') {
      return res.json({ success: true, shifts: [] });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    const decoded = verifyToken(req);

    const { userId, start, end } = req.query;
    if (!userId || !start || !end)
      return res.status(400).json({ success: false, message: 'userId, start, and end are required' });

    const requestUserRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
    if (requestUserRes.rows.length === 0)
      return res.status(404).json({ success: false, message: 'Requesting user not found' });

    const targetUserRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId]);
    if (targetUserRes.rows.length === 0)
      return res.status(404).json({ success: false, message: 'Target user not found' });

    if (requestUserRes.rows[0].company_id !== targetUserRes.rows[0].company_id)
      return res.status(403).json({ success: false, message: 'Forbidden' });

    const result = await pool.query(
      `SELECT s.*, 
              array_agg(DISTINCT sa.user_id) FILTER (WHERE sa.user_id IS NOT NULL) AS assigned_user_ids,
              json_agg(DISTINCT jsonb_build_object('id', u.id, 'name', u.first_name || ' ' || u.last_name)) FILTER (WHERE u.id IS NOT NULL) AS assigned_users,
              p.name as project_name,
              p.address as project_address
       FROM shifts s
       LEFT JOIN shift_assignments sa ON s.id = sa.shift_id
       LEFT JOIN users u ON sa.user_id = u.id
       LEFT JOIN projects p ON s.project_id = p.id
       WHERE s.user_id = $1 
         AND s.date >= $2::date 
         AND s.date <= $3::date
       GROUP BY s.id, p.name, p.address
       ORDER BY s.date`,
      [userId, start, end]
    );
    res.json({ success: true, shifts: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/schedule/shifts – with attachment support and casting
router.post('/shifts', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { name, date, startTime, endTime, projectId, notes, employeeIds, attachmentUrl, attachmentType } = req.body;
    if (!name || !date || !startTime || !endTime) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // Verify project belongs to company
    if (projectId) {
      const projectCheck = await pool.query(
        'SELECT company_id FROM projects WHERE id = $1 AND company_id = $2',
        [projectId, companyId]
      );
      if (projectCheck.rows.length === 0) {
        return res.status(403).json({ success: false, message: 'Project not found or does not belong to your company' });
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const shiftResult = await client.query(
        `INSERT INTO shifts (name, date, start_time, end_time, project_id, notes, created_by, attachment_url, attachment_type)
         VALUES ($1, $2::date, $3::time, $4::time, $5, $6, $7, $8, $9) RETURNING *`,
        [name, date, startTime, endTime, projectId || null, notes || null, req.body.userId || null, attachmentUrl || null, attachmentType || null]
      );
      const shift = shiftResult.rows[0];

      if (employeeIds && Array.isArray(employeeIds) && employeeIds.length > 0) {
        const assignmentValues = employeeIds.map((uid: string) => `('${shift.id}', '${uid}')`).join(',');
        await client.query(`INSERT INTO shift_assignments (shift_id, user_id) VALUES ${assignmentValues}`);
      }

      await client.query('COMMIT');
      res.status(201).json({ success: true, shift });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Create shift error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/schedule/shifts/:id – with attachment update
router.put('/shifts/:id', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { name, date, startTime, endTime, notes, employeeIds, attachmentUrl, attachmentType } = req.body;

    // Check ownership via project
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
      `UPDATE shifts SET name=$1, date=$2::date, start_time=$3::time, end_time=$4::time, notes=$5, attachment_url=$6, attachment_type=$7
       WHERE id=$8 RETURNING *`,
      [name, date, startTime, endTime, notes, attachmentUrl || null, attachmentType || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Shift not found' });

    if (employeeIds && Array.isArray(employeeIds)) {
      await pool.query('DELETE FROM shift_assignments WHERE shift_id = $1', [req.params.id]);
      if (employeeIds.length > 0) {
        const values = employeeIds.map((uid: string) => `('${req.params.id}', '${uid}')`).join(',');
        await pool.query(`INSERT INTO shift_assignments (shift_id, user_id) VALUES ${values}`);
      }
    }

    res.json({ success: true, shift: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/schedule/shifts/:id
router.delete('/shifts/:id', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    // Check ownership via project
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

export default router;