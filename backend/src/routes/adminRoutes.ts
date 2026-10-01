// ============================================
// ADMIN PANEL ROUTES
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { pool } from '../config/database';
import { recordSyncCorrection } from '../services/adaptiveAIService';

const router = express.Router();

// ----- Simple admin key middleware -----
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const ADMIN_KEY = process.env.ADMIN_API_KEY?.trim();
  if (!ADMIN_KEY || ADMIN_KEY.length < 32) {
    return res.status(503).json({ success: false, message: 'Admin API is not configured' });
  }
  const key = typeof req.headers['x-admin-key'] === 'string' ? req.headers['x-admin-key'] : '';
  const expected = Buffer.from(ADMIN_KEY);
  const received = Buffer.from(key);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
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
      SELECT c.id, c.name, c.created_at, c.subscription_tier, c.subscription_status,
             c.subscription_provider, c.subscription_current_period_end,
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
      SELECT u.id, u.email, u.first_name, u.last_name, u.full_name, u.role,
             u.company_id, u.is_active, u.created_at, u.last_login,
             c.name as company_name
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
    const parsedLimit = Number.parseInt(String(limit), 10);
    params.push(Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 200) : 50);

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
