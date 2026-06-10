import { verifyToken } from '../utils/auth';
import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET!;

// Helper: get company_id from JWT
const getCompanyId = async (req: Request): Promise<string | null> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const token = authHeader.split(' ')[1];
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
    let query = 'SELECT * FROM shifts WHERE company_id = $1';
    const params: any[] = [companyId];
    if (start) { query += ' AND start_time >= $2'; params.push(start); }
    if (end)   { query += ' AND end_time <= $3'; params.push(end); }
    const result = await pool.query(query, params);
    res.json({ success: true, shifts: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/schedule/my-shifts?userId=...&start=...&end=... (mobile schedule screen)
router.get('/my-shifts', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(req);

    const { userId, start, end } = req.query;
    if (!userId || !start || !end)
      return res.status(400).json({ success: false, message: 'userId, start, and end are required' });

    // Verify the requesting user belongs to the same company as the target user
    const requestUserRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
    if (requestUserRes.rows.length === 0)
      return res.status(404).json({ success: false, message: 'Requesting user not found' });

    const targetUserRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId]);
    if (targetUserRes.rows.length === 0)
      return res.status(404).json({ success: false, message: 'Target user not found' });

    if (requestUserRes.rows[0].company_id !== targetUserRes.rows[0].company_id)
      return res.status(403).json({ success: false, message: 'Forbidden' });

    const result = await pool.query(
      `SELECT * FROM shifts WHERE user_id = $1 AND date >= $2 AND date <= $3 ORDER BY date`,
      [userId, start, end]
    );
    res.json({ success: true, shifts: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/schedule/shifts
router.post('/shifts', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { name, date, startTime, endTime, projectId, notes, employeeIds } = req.body;
    const result = await pool.query(
      `INSERT INTO shifts (company_id, name, date, start_time, end_time, project_id, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [companyId, name, date, startTime, endTime, projectId, notes, req.body.userId || null]
    );
    res.json({ success: true, shift: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/schedule/shifts/:id
router.put('/shifts/:id', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { name, date, startTime, endTime, notes } = req.body;
    const result = await pool.query(
      `UPDATE shifts SET name=$1, date=$2, start_time=$3, end_time=$4, notes=$5
       WHERE id=$6 AND company_id=$7 RETURNING *`,
      [name, date, startTime, endTime, notes, req.params.id, companyId]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Shift not found' });
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

    await pool.query('DELETE FROM shifts WHERE id=$1 AND company_id=$2', [req.params.id, companyId]);
    res.json({ success: true, message: 'Shift deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;