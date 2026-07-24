import express, { Request, Response } from 'express';
import { pool } from '../config/database';
import { verifyToken } from '../utils/auth';

const router = express.Router();

// ─── Helper to get company ID from token ───
const getCompanyId = async (req: Request): Promise<string | null> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = verifyToken(req);
    if (!decoded?.id) return null;
    const result = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
    return result.rows[0]?.company_id || null;
  } catch {
    return null;
  }
};

// ─── 1. GET /api/dashboard/stats ───
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const activeJobsRes = await pool.query(
      'SELECT COUNT(*) FROM projects WHERE company_id = $1 AND status = $2',
      [companyId, 'active']
    );
    const activeJobs = parseInt(activeJobsRes.rows[0].count, 10);

    const employeesRes = await pool.query(
      'SELECT COUNT(*) FROM users WHERE company_id = $1',
      [companyId]
    );
    const totalEmployees = parseInt(employeesRes.rows[0].count, 10);

    const today = new Date().toISOString().split('T')[0];
    const todayRes = await pool.query(
      `SELECT
         COALESCE(SUM(regular_hours + overtime_hours), 0) as hours,
         COALESCE(SUM(total_wage), 0) as revenue
       FROM time_entries
       WHERE user_id IN (SELECT id FROM users WHERE company_id = $1)
         AND clock_in::date = $2::date`,
      [companyId, today]
    );
    const hoursToday = parseFloat(todayRes.rows[0].hours) || 0;
    const revenueToday = parseFloat(todayRes.rows[0].revenue) || 0;

    const markup = 1.5;
    const revenueEst = revenueToday * markup;
    const cost = revenueToday;
    const marginToday = revenueEst > 0 ? ((revenueEst - cost) / revenueEst) * 100 : 0;

    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const yestRes = await pool.query(
      `SELECT COALESCE(SUM(total_wage), 0) as revenue FROM time_entries
       WHERE user_id IN (SELECT id FROM users WHERE company_id = $1)
         AND clock_in::date = $2::date`,
      [companyId, yesterday]
    );
    const yestRevenue = parseFloat(yestRes.rows[0].revenue) || 0;
    const yestRevenueEst = yestRevenue * markup;
    const yestMargin = yestRevenueEst > 0 ? ((yestRevenueEst - yestRevenue) / yestRevenueEst) * 100 : 0;
    const marginChange = marginToday - yestMargin;

    res.json({
      activeJobs,
      totalEmployees,
      hoursToday,
      revenueToday: revenueEst,
      marginToday: parseFloat(marginToday.toFixed(2)),
      marginChange: parseFloat(marginChange.toFixed(2)),
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── 2. GET /api/dashboard/profit-timeline ───
router.get('/profit-timeline', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const today = new Date().toISOString().split('T')[0];
    const result = await pool.query(
      `SELECT
         EXTRACT(HOUR FROM clock_in) as hour,
         COALESCE(SUM(total_wage), 0) as wage
       FROM time_entries
       WHERE user_id IN (SELECT id FROM users WHERE company_id = $1)
         AND clock_in::date = $2::date
       GROUP BY hour
       ORDER BY hour`,
      [companyId, today]
    );

    const markup = 1.5;
    const data = result.rows.map((row: any) => {
      const hour = parseInt(row.hour, 10);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour % 12 === 0 ? 12 : hour % 12;
      const time = `${displayHour}${ampm}`;
      const wage = parseFloat(row.wage) || 0;
      const revenue = wage * markup;
      const margin = revenue > 0 ? ((revenue - wage) / revenue) * 100 : 0;
      return { time, margin: parseFloat(margin.toFixed(2)) };
    });

    res.json(data);
  } catch (error) {
    console.error('Error fetching profit timeline:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── 3. GET /api/dashboard/job-status ───
router.get('/job-status', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const result = await pool.query(
      `SELECT status, COUNT(*) as count
       FROM projects
       WHERE company_id = $1
       GROUP BY status`,
      [companyId]
    );

    const data = result.rows.map((row: any) => ({
      name: row.status.charAt(0).toUpperCase() + row.status.slice(1),
      value: parseInt(row.count, 10),
    }));

    res.json(data);
  } catch (error) {
    console.error('Error fetching job status:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── 4. GET /api/dashboard/dispute-alerts (FIXED) ───
router.get('/dispute-alerts', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    // ─── FIXED: Use array_length() instead of jsonb_array_length() ───
    const result = await pool.query(
      `SELECT DISTINCT
         p.id as project_id,
         p.name as project_name,
         COUNT(te.id) as risky_entries
       FROM time_entries te
       JOIN projects p ON te.project_id = p.id
       WHERE p.company_id = $1
         AND (
           (te.overtime_hours > 2)
           OR (te.alerts IS NOT NULL AND array_length(te.alerts, 1) > 0)
         )
       GROUP BY p.id, p.name
       LIMIT 10`,
      [companyId]
    );

    const alerts = result.rows.map((row: any) => {
      const count = parseInt(row.risky_entries, 10);
      const risk = Math.min(count * 10, 100);
      let issue = '';
      if (count > 0) {
        issue = `${count} problematic time entries detected (overtime or alerts).`;
      }
      return {
        project: row.project_name,
        risk,
        issue,
      };
    });

    res.json(alerts);
  } catch (error) {
    console.error('Error fetching dispute alerts:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;