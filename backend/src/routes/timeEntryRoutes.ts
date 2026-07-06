import { verifyToken } from '../utils/auth';
import express, { Request, Response } from 'express';
import { pool } from '../config/database';
import { clockIn, clockOut, getTimeEntries, manualTimeEntry, updateTimeEntry } from '../services/timeEntryService';

const router = express.Router();

// GET /api/time-entries/active?userId=xxx
router.get('/active', async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId required' });
    }

    // Verify auth (same as other routes)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    const decoded = verifyToken(req);
    // You can optionally check if the user has permission

    // Find the active time entry for this user (no clock_out)
    const result = await pool.query(
      `SELECT te.id, te.project_id, te.clock_in, p.name as project_name
       FROM time_entries te
       LEFT JOIN projects p ON te.project_id = p.id
       WHERE te.user_id = $1 AND te.clock_out IS NULL
       ORDER BY te.clock_in DESC
       LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.json({ success: true, entry: null });
    }

    const entry = result.rows[0];
    res.json({
      success: true,
      entry: {
        id: entry.id,
        project_id: entry.project_id,
        project_name: entry.project_name,
        clock_in: entry.clock_in,
      },
    });
  } catch (error: any) {
    console.error('Active time entry error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Helper to extract company_id from JWT
const getCompanyId = (req: Request): string | null => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = verifyToken(req);
    return decoded.companyId || null;
  } catch {
    return null;
  }
};

// Helper to get user ID from JWT
const getUserId = (req: Request): string | null => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = verifyToken(req);
    return decoded.id || null;
  } catch {
    return null;
  }
};

// POST /api/time-entries/clock-in (mobile)
router.post('/clock-in', async (req: Request, res: Response) => {
  try {
    const { userId, projectId, latitude, longitude } = req.body;
    if (!userId || !projectId) return res.status(400).json({ success: false, message: 'Missing userId or projectId' });
    const entry = await clockIn(userId, projectId, latitude || 0, longitude || 0);
    res.json({ success: true, timeEntryId: entry.id, clockIn: entry.clock_in });
  } catch (error: any) { res.status(500).json({ success: false, message: error.message }); }
});

// POST /api/time-entries/clock-out (mobile)
router.post('/clock-out', async (req: Request, res: Response) => {
  try {
    const { timeEntryId, userId, latitude, longitude } = req.body;
    if (!timeEntryId || !userId) return res.status(400).json({ success: false, message: 'Missing timeEntryId or userId' });
    const entry = await clockOut(userId, timeEntryId, latitude || 0, longitude || 0);
    if (!entry) return res.status(404).json({ success: false, message: 'Active time entry not found' });
    res.json({ success: true, clockOut: entry.clock_out });
  } catch (error: any) { res.status(500).json({ success: false, message: error.message }); }
});

// GET /api/time-entries
router.get('/', async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { userId, start, end } = req.query;

    if (userId) {
      const userCheck = await pool.query('SELECT id FROM users WHERE id = $1 AND company_id = $2', [userId, companyId]);
      if (userCheck.rows.length === 0) return res.status(403).json({ success: false, message: 'Access denied' });
      const entries = await getTimeEntries(userId as string, start as string || '', end as string || '');
      return res.json({ success: true, entries });
    }

    const result = await pool.query(
      `SELECT te.*, p.name AS project_name
       FROM time_entries te
       LEFT JOIN projects p ON te.project_id = p.id
       WHERE te.company_id = $1
       ORDER BY te.clock_in DESC
       LIMIT 200`,
      [companyId]
    );
    res.json({ success: true, entries: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/time-entries/manual
router.post('/manual', async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { userId, projectId, clockIn, clockOut, breakMinutes, notes, createdBy } = req.body;
    if (!userId || !projectId || !clockIn || !clockOut || !createdBy) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1 AND company_id = $2', [userId, companyId]);
    if (userCheck.rows.length === 0) return res.status(403).json({ success: false, message: 'Invalid user' });

    const projectCheck = await pool.query('SELECT id FROM projects WHERE id = $1 AND company_id = $2', [projectId, companyId]);
    if (projectCheck.rows.length === 0) return res.status(403).json({ success: false, message: 'Invalid project' });

    const entry = await manualTimeEntry(userId, projectId, clockIn, clockOut, breakMinutes || 0, notes || '', createdBy);
    res.json({ success: true, entry });
  } catch (error: any) { res.status(500).json({ success: false, message: error.message }); }
});

// PUT /api/time-entries/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const entryCheck = await pool.query('SELECT id FROM time_entries WHERE id = $1 AND company_id = $2', [req.params.id, companyId]);
    if (entryCheck.rows.length === 0) return res.status(404).json({ success: false, message: 'Entry not found or access denied' });

    const updates = req.body;
    const entry = await updateTimeEntry(req.params.id as string, updates);
    res.json({ success: true, entry });
  } catch (error: any) { res.status(500).json({ success: false, message: error.message }); }
});

export default router;