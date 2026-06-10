import { verifyToken } from '../utils/auth';
import express, { Request, Response } from 'express';
import { pool } from '../config/database';
import { clockIn, clockOut, getTimeEntries, manualTimeEntry, updateTimeEntry } from '../services/timeEntryService';

const router = express.Router();

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

// Helper to get user ID from JWT (for use in some endpoints)
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
    // Optionally verify that userId and project belong to the same company; for now trust the mobile client
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
// If userId query param is provided, return entries for that user (company‑scoped).
// Otherwise, return all entries for the logged‑in user's company.
router.get('/', async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { userId, start, end } = req.query;

    // If userId is provided, fetch entries for that user (must belong to same company)
    if (userId) {
      // Verify that the user belongs to this company
      const userCheck = await pool.query('SELECT id FROM users WHERE id = $1 AND company_id = $2', [userId, companyId]);
      if (userCheck.rows.length === 0) return res.status(403).json({ success: false, message: 'Access denied' });

      const entries = await getTimeEntries(userId as string, start as string || '', end as string || '');
      return res.json({ success: true, entries });
    }

    // No userId – return all entries for the company, ordered by most recent
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

// POST /api/time-entries/manual – add manual time entry (company‑scoped)
router.post('/manual', async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { userId, projectId, clockIn, clockOut, breakMinutes, notes, createdBy } = req.body;
    if (!userId || !projectId || !clockIn || !clockOut || !createdBy) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // Ensure the user and project belong to this company
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1 AND company_id = $2', [userId, companyId]);
    if (userCheck.rows.length === 0) return res.status(403).json({ success: false, message: 'Invalid user' });

    const projectCheck = await pool.query('SELECT id FROM projects WHERE id = $1 AND company_id = $2', [projectId, companyId]);
    if (projectCheck.rows.length === 0) return res.status(403).json({ success: false, message: 'Invalid project' });

    const entry = await manualTimeEntry(userId, projectId, clockIn, clockOut, breakMinutes || 0, notes || '', createdBy);
    res.json({ success: true, entry });
  } catch (error: any) { res.status(500).json({ success: false, message: error.message }); }
});

// PUT /api/time-entries/:id – edit a time entry (company‑scoped)
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    // Verify the entry belongs to this company
    const entryCheck = await pool.query('SELECT id FROM time_entries WHERE id = $1 AND company_id = $2', [req.params.id, companyId]);
    if (entryCheck.rows.length === 0) return res.status(404).json({ success: false, message: 'Entry not found or access denied' });

    const updates = req.body;
    const entry = await updateTimeEntry(req.params.id as string, updates);
    res.json({ success: true, entry });
  } catch (error: any) { res.status(500).json({ success: false, message: error.message }); }
});

export default router;