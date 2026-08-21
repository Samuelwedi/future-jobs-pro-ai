import { verifyToken } from '../utils/auth';
import express, { Request, Response } from 'express';
import { pool } from '../config/database';
import { getUserPTOBalance, getUserPTORequests } from '../services/ptoService';

const router = express.Router();
// GET /api/pto/mine â€“ requests belonging to the authenticated user
router.get('/mine', async (req: Request, res: Response) => {
  try {
    const decoded = verifyToken(req);
    const requests = await getUserPTORequests(decoded.id);
    res.json({ success: true, requests });
  } catch (error: any) {
    const status = /token|auth/i.test(error.message || '') ? 401 : 500;
    res.status(status).json({ success: false, message: error.message });
  }
});

// GET /api/pto/balance â€“ current balance for the authenticated user
router.get('/balance', async (req: Request, res: Response) => {
  try {
    const decoded = verifyToken(req);
    const userResult = await pool.query(
      'SELECT company_id FROM users WHERE id = $1',
      [decoded.id],
    );
    if (!userResult.rowCount) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const companyId = userResult.rows[0].company_id;
    const balance = await getUserPTOBalance(decoded.id, companyId);
    res.json({ success: true, balance });
  } catch (error: any) {
    const status = /token|auth/i.test(error.message || '') ? 401 : 500;
    res.status(status).json({ success: false, message: error.message });
  }
});

// GET /api/pto – return PTO requests for the logged‑in user's company
router.get('/', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    
    const decoded = verifyToken(req);

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
    
    const decoded = verifyToken(req);

    const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
    if (userRes.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    const companyId = userRes.rows[0].company_id;
    if (!companyId) return res.status(400).json({ success: false, message: 'Company not assigned' });

    const { start_date, end_date, type, reason } = req.body;
    if (!start_date || !end_date) {
      return res.status(400).json({ success: false, message: 'Start and end dates are required' });
    }

    const result = await pool.query(
      `INSERT INTO pto_requests (company_id, user_id, start_date, end_date, type, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [companyId, decoded.id, start_date, end_date, type || 'vacation', reason || null]
    );
    res.status(201).json({ success: true, request: result.rows[0] });
  } catch (error: any) {
    console.error('PTO request error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to submit PTO request' });
  }
});

export default router;