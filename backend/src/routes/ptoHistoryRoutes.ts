import express, { Request, Response } from 'express';
import { pool } from '../config/database';
import { verifyToken } from '../utils/auth';

const router = express.Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const decoded = verifyToken(req);
    const actorResult = await pool.query(
      'SELECT company_id, role FROM users WHERE id = $1',
      [decoded.id]
    );
    const actor = actorResult.rows[0];
    if (!actor?.company_id) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const canSeeCompany = ['boss', 'manager', 'admin'].includes(String(actor.role || '').toLowerCase());
    const result = await pool.query(
      `SELECT pr.*, u.first_name || ' ' || u.last_name AS user_name
       FROM pto_requests pr
       JOIN users u ON u.id = pr.user_id
       WHERE COALESCE(pr.company_id, u.company_id) = $1
         AND ($2::boolean = true OR pr.user_id = $3)
       ORDER BY pr.start_date DESC, pr.created_at DESC`,
      [actor.company_id, canSeeCompany, decoded.id]
    );
    res.json({ success: true, requests: result.rows });
  } catch (error: any) {
    console.error('PTO history error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
