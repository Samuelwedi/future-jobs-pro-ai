import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET!;

// GET /api/pto – return PTO requests for the logged‑in user's company
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
    if (!companyId) return res.json({ success: true, requests: [] });

    const result = await pool.query(
      `SELECT pr.*, u.first_name || ' ' || u.last_name AS user_name
       FROM pto_requests pr
       JOIN users u ON pr.user_id = u.id
       WHERE pr.company_id = $1
       ORDER BY pr.start_date DESC`,
      [companyId]
    );
    res.json({ success: true, requests: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/pto – submit a new PTO request
router.post('/', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
    if (userRes.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    const companyId = userRes.rows[0].company_id;
    if (!companyId) return res.status(400).json({ success: false, message: 'Company not assigned' });

    const { start_date, end_date, type } = req.body;
    if (!start_date || !end_date) {
      return res.status(400).json({ success: false, message: 'Start and end dates are required' });
    }

    const result = await pool.query(
      `INSERT INTO pto_requests (company_id, user_id, start_date, end_date, type, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING *`,
      [companyId, decoded.id, start_date, end_date, type || 'vacation']
    );
    res.status(201).json({ success: true, request: result.rows[0] });
  } catch (error: any) {
    console.error('PTO request error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to submit PTO request' });
  }
});

export default router;