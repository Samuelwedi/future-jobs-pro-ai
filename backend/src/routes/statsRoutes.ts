import express, { Request, Response } from 'express';
import { pool } from '../config/database';
import { verifyToken } from '../utils/auth';

const router = express.Router();

// GET /api/stats/company/:companyId
router.get('/company/:companyId', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const decoded = verifyToken(req);
    const companyId = req.params.companyId;

    // Verify the requesting user belongs to this company
    const userCheck = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
    if (userCheck.rows.length === 0 || userCheck.rows[0].company_id !== companyId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    // 1. Count employees (all users in the company)
    const employeeResult = await pool.query(
      `SELECT COUNT(*) AS count FROM users WHERE company_id = $1`,
      [companyId]
    );
    const activeEmployees = parseInt(employeeResult.rows[0]?.count || '0', 10);

    // 2. Count active projects
    const projectResult = await pool.query(
      `SELECT COUNT(*) AS count FROM projects WHERE company_id = $1 AND status = 'active'`,
      [companyId]
    );
    const projectCount = parseInt(projectResult.rows[0]?.count || '0', 10);

    // 3. Today's earnings – we don't have a wage column, so we return 0 for now.
    //    Future enhancement: join with users to get hourly rate and compute from duration.
    const todayEarnings = 0;

    res.json({
      success: true,
      stats: {
        activeEmployees,
        projectCount,
        todayEarnings,
      },
    });
  } catch (error: any) {
    console.error('Stats error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;