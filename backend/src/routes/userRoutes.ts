import express, { Request, Response } from 'express';
import { pool } from '../config/database';

const router = express.Router();

router.get('/company/:companyId', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT id, first_name, last_name, role FROM users WHERE company_id = $1 AND is_active = true',
      [req.params.companyId as string]
    );
    res.json({ success: true, users: result.rows });
  } catch (error) {
    console.error('Failed to load users:', error);
    res.status(500).json({ success: false, message: 'Failed to load users' });
  }
});

export default router;