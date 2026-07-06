import { verifyToken } from '../utils/auth';
import express, { Request, Response } from 'express';
import { pool } from '../config/database';

const router = express.Router();

// GET /api/stats/company/:companyId
router.get('/company/:companyId', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });

    const decoded = verifyToken(req);
    const { companyId } = req.params;

    // Verify user belongs to this company
    const userCheck = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
    if (userCheck.rows.length === 0 || userCheck.rows[0].company_id !== companyId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    // Get active employees count (users in the company with active status)
    const activeEmployeesRes = await pool.query(
      'SELECT COUNT(*) FROM users WHERE company_id = $1 AND is_active = true',
      [companyId]
    );
    const activeEmployees = parseInt(activeEmployeesRes.rows[0].count, 10) || 0;

    // Get project count
    const projectsRes = await pool.query(
      'SELECT COUNT(*) FROM projects WHERE company_id = $1 AND status = $2',
      [companyId, 'active']
    );
    const projectCount = parseInt(projectsRes.rows[0].count, 10) || 0;

    // Get today's earnings (sum of completed time entries for today)
    const today = new Date().toISOString().split('T')[0];
    const earningsRes = await pool.query(
      `SELECT COALESCE(SUM(t.hours_worked * u.hourly_rate), 0) as total
       FROM time_entries t
       JOIN users u ON t.user_id = u.id
       WHERE u.company_id = $1
         AND t.status = 'completed'
         AND t.clock_out::date = $2::date`,
      [companyId, today]
    );
    const todayEarnings = parseFloat(earningsRes.rows[0].total) || 0;

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