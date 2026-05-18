import express, { Request, Response } from 'express';
import { pool } from '../config/database';

const router = express.Router();

// GET /api/projects/active – return active projects for a company
router.get('/active', async (req: Request, res: Response) => {
  try {
    // For now, return all active projects (later we'll filter by company)
    const result = await pool.query(
      `SELECT * FROM projects WHERE status = 'active' ORDER BY created_at DESC`
    );
    res.json({ success: true, projects: result.rows });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch projects' });
  }
});

export default router;