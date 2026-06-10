import { verifyToken } from '../utils/auth';
import express, { Request, Response } from 'express';
import { pool } from '../config/database';

const router = express.Router();

// Helper: get company_id from JWT
const getCompanyId = (req: Request): string | null => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = verifyToken(req);
    return decoded.companyId || null;
  } catch { return null; }
};

// GET /api/projects – returns projects for the logged‑in user's company
router.get('/', async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const result = await pool.query(
      'SELECT id, name, client_name, status FROM projects WHERE company_id = $1',
      [companyId]
    );
    res.json({ success: true, projects: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to load projects' });
  }
});

// GET /api/projects/active – alias used by mobile home screen
router.get('/active', async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const result = await pool.query(
      'SELECT id, name, client_name, status FROM projects WHERE company_id = $1 AND status = $2',
      [companyId, 'active']
    );
    res.json({ success: true, projects: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to load projects' });
  }
});

// POST /api/projects – create a new project
router.post('/', async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { name, client_name } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Project name is required' });

    const result = await pool.query(
      `INSERT INTO projects (company_id, name, client_name, status) VALUES ($1, $2, $3, 'active') RETURNING *`,
      [companyId, name, client_name || null]
    );
    res.status(201).json({ success: true, project: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to create project' });
  }
});

export default router;