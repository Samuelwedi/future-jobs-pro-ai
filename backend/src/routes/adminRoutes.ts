// ============================================
// ADMIN PANEL ROUTES
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import express, { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { recordSyncCorrection } from '../services/adaptiveAIService';

const router = express.Router();

// ----- Simple admin key middleware -----
const ADMIN_KEY = process.env.ADMIN_API_KEY || 'admin-secret-key-change-me';

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const key = req.headers['x-admin-key'];
  if (key !== ADMIN_KEY) {
    return res.status(403).json({ success: false, message: 'Forbidden: invalid admin key' });
  }
  next();
}

// Apply to all admin routes
router.use(requireAdmin);

// ============================================
// GET /api/admin/companies – List all companies
// ============================================
router.get('/companies', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT c.*,
        (SELECT COUNT(*) FROM users WHERE company_id = c.id) as user_count
      FROM companies c
      ORDER BY c.created_at DESC
    `);
    res.json({ success: true, companies: result.rows, owner: 'Samuel B.' });
  } catch (error) {
    console.error('❌ Admin companies error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch companies' });
  }
});

// ============================================
// GET /api/admin/users – List all users
// ============================================
router.get('/users', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT u.*, c.name as company_name
      FROM users u
      LEFT JOIN companies c ON u.company_id = c.id
      ORDER BY u.created_at DESC
      LIMIT 100
    `);
    res.json({ success: true, users: result.rows });
  } catch (error) {
    console.error('❌ Admin users error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch users' });
  }
});

// ============================================
// GET /api/admin/stats – Platform statistics
// ============================================
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const companies = await pool.query('SELECT COUNT(*) FROM companies');
    const users = await pool.query('SELECT COUNT(*) FROM users');
    const projects = await pool.query('SELECT COUNT(*) FROM projects');
    const timeEntries = await pool.query('SELECT COUNT(*) FROM time_entries');
    const revenue = await pool.query("SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE status='completed'");

    res.json({
      success: true,
      stats: {
        totalCompanies: parseInt(companies.rows[0].count),
        totalUsers: parseInt(users.rows[0].count),
        totalProjects: parseInt(projects.rows[0].count),
        totalTimeEntries: parseInt(timeEntries.rows[0].count),
        totalRevenue: parseFloat(revenue.rows[0].total),
        owner: 'Samuel B.',
      },
    });
  } catch (error) {
    console.error('❌ Admin stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
});

// ============================================
// GET /api/admin/sync-logs – View recent sync logs
// ============================================
router.get('/sync-logs', async (req: Request, res: Response) => {
  try {
    const { companyId, status, limit = '50' } = req.query;
    let query = `
      SELECT sl.*, c.name as company_name
      FROM sync_logs sl
      JOIN companies c ON sl.company_id = c.id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (companyId) {
      params.push(companyId);
      query += ` AND sl.company_id = $${params.length}`;
    }
    if (status) {
      params.push(status);
      query += ` AND sl.status = $${params.length}`;
    }
    query += ` ORDER BY sl.created_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit as string));

    const result = await pool.query(query, params);
    res.json({ success: true, logs: result.rows });
  } catch (error) {
    console.error('❌ Admin sync-logs error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch sync logs' });
  }
});

// ============================================
// POST /api/admin/sync-logs/:id/correct – Override AI sync decision
// ============================================
router.post('/sync-logs/:id/correct', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const correction = req.body;   // e.g., { action: 'createInvoicePayment', ... }
    await recordSyncCorrection(id as string, correction);
    res.json({ success: true, message: 'Correction recorded. AI will learn from this.' });
  } catch (error) {
    console.error('❌ Admin correction error:', error);
    res.status(500).json({ success: false, message: 'Failed to record correction' });
  }
});

export default router;