import express, { Request, Response } from 'express';
import { pool } from '../config/database';
import { verifyToken } from '../utils/auth';

const router = express.Router();

// ─── GET /api/time-entries ───
router.get('/', async (req: Request, res: Response) => {
  // ... same as before (keep the working version)
});

// ─── GET /api/time-entries/active ───
router.get('/active', async (req: Request, res: Response) => {
  // ... same as before
});

// ─── POST /api/time-entries/clock-in ───
router.post('/clock-in', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const decoded = verifyToken(req);
    const userId = decoded.id;
    const { projectId, latitude, longitude } = req.body;

    console.log('📥 Clock-in request:', { userId, projectId, latitude, longitude });

    if (!projectId) {
      console.log('❌ projectId missing');
      return res.status(400).json({ success: false, message: 'projectId is required' });
    }

    // Check if user exists
    console.log('🔍 Checking user:', userId);
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      console.log('❌ User not found:', userId);
      return res.status(400).json({ success: false, message: 'User not found' });
    }
    console.log('✅ User found');

    // Check if project exists
    console.log('🔍 Checking project:', projectId);
    const projectCheck = await pool.query('SELECT id FROM projects WHERE id = $1', [projectId]);
    if (projectCheck.rows.length === 0) {
      console.log('❌ Project not found:', projectId);
      return res.status(400).json({ success: false, message: 'Project not found' });
    }
    console.log('✅ Project found');

    // Check if already clocked in
    console.log('🔍 Checking active entry for user:', userId);
    const activeCheck = await pool.query(
      'SELECT id FROM time_entries WHERE user_id = $1 AND clock_out IS NULL',
      [userId]
    );
    if (activeCheck.rows.length > 0) {
      console.log('❌ Already clocked in:', activeCheck.rows[0].id);
      return res.status(400).json({ success: false, message: 'Already clocked in' });
    }
    console.log('✅ No active entry');

    const result = await pool.query(
      `INSERT INTO time_entries (user_id, project_id, clock_in, latitude, longitude, created_at)
       VALUES ($1, $2, NOW(), $3, $4, NOW()) RETURNING id, clock_in`,
      [userId, projectId, latitude || 0, longitude || 0]
    );
    const entry = result.rows[0];
    console.log('✅ Clock-in successful:', entry.id);
    res.status(201).json({
      success: true,
      message: 'Clocked in successfully',
      timeEntryId: entry.id,
      clockIn: entry.clock_in,
    });
  } catch (error: any) {
    console.error('Clock-in error details:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── POST /api/time-entries/clock-out ───
router.post('/clock-out', async (req: Request, res: Response) => {
  // ... same as before
});

export default router;