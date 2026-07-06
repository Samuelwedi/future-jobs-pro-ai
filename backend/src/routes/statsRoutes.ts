import express, { Request, Response } from 'express';
import { pool } from '../config/database';
import { verifyToken } from '../utils/auth';

const router = express.Router();

// GET /api/stats/company/:companyId
// Returns: activeEmployees, projectCount, todayEarnings
router.get('/company/:companyId', async (req: Request, res: Response) => {
  try {
    // Authenticate (optional, but we do it for security)
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

    // 1. Count active employees (all users in the company – no is_active column)
    //    Alternatively, we could filter by role != 'boss' etc.
    const employeeCountResult = await pool.query(
      `SELECT COUNT(*) AS count FROM users WHERE company_id = $1`,
      [companyId]
    );
    const activeEmployees = parseInt(employeeCountResult.rows[0]?.count || '0', 10);

    // 2. Count active projects (status = 'active' or similar)
    const projectCountResult = await pool.query(
      `SELECT COUNT(*) AS count FROM projects WHERE company_id = $1 AND status = 'active'`,
      [companyId]
    );
    const projectCount = parseInt(projectCountResult.rows[0]?.count || '0', 10);

    // 3. Today's earnings – sum of wages from completed time entries for today
    //    This depends on your schema – adjust accordingly.
    const today = new Date();
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    const earningsResult = await pool.query(
      `SELECT COALESCE(SUM(te.total_wage), 0) AS total
       FROM time_entries te
       JOIN users u ON te.user_id = u.id
       WHERE u.company_id = $1
         AND te.clock_out IS NOT NULL
         AND te.clock_out BETWEEN $2 AND $3`,
      [companyId, todayStart.toISOString(), todayEnd.toISOString()]
    );
    const todayEarnings = parseFloat(earningsResult.rows[0]?.total || '0');

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