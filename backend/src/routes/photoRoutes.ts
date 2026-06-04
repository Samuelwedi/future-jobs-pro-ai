import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'f1jp@i2026_SamuelB_Secret#FutureJobsPro';

// Helper: get company_id from JWT
const getCompanyId = async (req: Request): Promise<string | null> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
    return userRes.rows[0]?.company_id || null;
  } catch {
    return null;
  }
};

// GET /api/photos/company – all photos for the user's company
router.get('/company', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const result = await pool.query(
      'SELECT * FROM photos WHERE company_id = $1 ORDER BY taken_at DESC',
      [companyId]
    );
    res.json({ success: true, photos: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;