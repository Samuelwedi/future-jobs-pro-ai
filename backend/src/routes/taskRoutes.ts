import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'f1jp@i2026_SamuelB_Secret#FutureJobsPro';

// GET /api/tasks – return tasks for the logged‑in user's company
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
    if (!companyId) return res.json({ success: true, tasks: [] });

    const result = await pool.query(
      `SELECT t.*, u.first_name || ' ' || u.last_name AS assigned_name
       FROM tasks t
       LEFT JOIN users u ON t.assigned_to = u.id
       WHERE t.company_id = $1
       ORDER BY t.created_at DESC`,
      [companyId]
    );
    res.json({ success: true, tasks: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;