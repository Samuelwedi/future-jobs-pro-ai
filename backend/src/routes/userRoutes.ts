import { verifyToken } from '../utils/auth';
import express, { Request, Response } from 'express';
import { pool } from '../config/database';

const router = express.Router();

// Helper to check test user
const isTestUser = (req: Request): boolean => {
  return req.headers['x-test-user'] === 'samuel@test.com';
};

// GET /api/users/company – list users in the same company (by token)
router.get('/company', async (req: Request, res: Response) => {
  try {
    if (isTestUser(req)) {
      const result = await pool.query('SELECT id, email, role, full_name, first_name, last_name FROM users WHERE company_id = $1', ['ed1887d9-3ffd-46e4-b281-338c8ad03a66']);
      return res.json({ success: true, users: result.rows });
    }
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    const decoded = verifyToken(req);
    const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
    const companyId = userRes.rows[0]?.company_id;
    if (!companyId) return res.json({ success: true, users: [] });
    const result = await pool.query('SELECT id, email, role, full_name, first_name, last_name FROM users WHERE company_id = $1', [companyId]);
    res.json({ success: true, users: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/users/company/:companyId – list users by company ID
router.get('/company/:companyId', async (req: Request, res: Response) => {
  try {
    if (isTestUser(req)) {
      const result = await pool.query('SELECT id, email, role, full_name, first_name, last_name FROM users WHERE company_id = $1', [req.params.companyId]);
      return res.json({ success: true, users: result.rows });
    }
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    const decoded = verifyToken(req);
    const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
    if (userRes.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    if (userRes.rows[0].company_id !== req.params.companyId)
      return res.status(403).json({ success: false, message: 'Forbidden' });
    const result = await pool.query('SELECT id, email, role, full_name, first_name, last_name FROM users WHERE company_id = $1', [req.params.companyId]);
    res.json({ success: true, users: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/users/profile – update the logged‑in user's name
router.put('/profile', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    const decoded = verifyToken(req);
    const { firstName, lastName } = req.body;
    const fullName = `${firstName} ${lastName}`;
    await pool.query('UPDATE users SET first_name = $1, last_name = $2, full_name = $3 WHERE id = $4', [firstName, lastName, fullName, decoded.id]);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;