import express, { Request, Response } from 'express';
import { pool } from '../config/database';

const router = express.Router();

// Hardcoded company ID for the test user (from your logs)
const COMPANY_ID = 'ed1887d9-3ffd-46e4-b281-338c8ad03a66';

router.get('/', async (req: Request, res: Response) => {
  console.log('🔥 NEW projectRoutes is LIVE!');
  try {
    const result = await pool.query(
      'SELECT id, name, client_name, status FROM projects WHERE company_id = $1',
      [COMPANY_ID]
    );
    res.json({ success: true, projects: result.rows });
  } catch (error: any) {
    console.error('Projects error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load projects' });
  }
});

router.get('/active', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT id, name, client_name, status FROM projects WHERE company_id = $1 AND status = $2',
      [COMPANY_ID, 'active']
    );
    res.json({ success: true, projects: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to load projects' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, client_name } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Project name is required' });
    const result = await pool.query(
      `INSERT INTO projects (company_id, name, client_name, status) VALUES ($1, $2, $3, 'active') RETURNING *`,
      [COMPANY_ID, name, client_name || null]
    );
    res.status(201).json({ success: true, project: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to create project' });
  }
});

export default router;