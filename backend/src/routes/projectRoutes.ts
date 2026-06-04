import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'f1jp@i2026_SamuelB_Secret#FutureJobsPro';

// GET /api/projects – returns projects for the logged‑in user's company
router.get('/', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
    if (userRes.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    const companyId = userRes.rows[0].company_id;
    if (!companyId) return res.json({ success: true, projects: [] });

    const result = await pool.query(
      'SELECT id, name, client_name, status FROM projects WHERE company_id = $1',
      [companyId]
    );
    res.json({ success: true, projects: result.rows });
  } catch (error: any) {
    console.error('Project fetch error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load projects' });
  }
});

export default router;