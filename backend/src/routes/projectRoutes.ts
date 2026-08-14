import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { pool } from '../config/database';
import { verifyToken } from '../utils/auth';

const router = express.Router();
const projectManagers = new Set(['boss', 'manager', 'admin']);

type Actor = { id: string; companyId: string; role: string };

async function actor(req: Request): Promise<Actor> {
  const decoded = verifyToken(req);
  const result = await pool.query(
    'SELECT id, company_id, role FROM users WHERE id = $1 AND COALESCE(is_active, TRUE) = TRUE',
    [decoded.id],
  );
  if (!result.rowCount || !result.rows[0].company_id) {
    const error: any = new Error('Your user is not assigned to an active company');
    error.status = 401;
    throw error;
  }
  return {
    id: String(result.rows[0].id),
    companyId: String(result.rows[0].company_id),
    role: String(result.rows[0].role || ''),
  };
}

function requireProjectManager(current: Actor): void {
  if (!projectManagers.has(current.role)) {
    const error: any = new Error('Manager access is required to change projects');
    error.status = 403;
    throw error;
  }
}

function sendError(res: Response, error: any): void {
  const message = String(error?.message || 'Project request failed');
  const status = Number(error?.status) || (/token|authenticated|active company/i.test(message) ? 401 : 500);
  res.status(status).json({ success: false, message });
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    const directory = './uploads/projects';
    if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });
    callback(null, directory);
  },
  filename: (_req, file, callback) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    callback(null, unique + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const allowed = /^(application\/pdf|image\/|text\/plain|application\/(msword|vnd\.|zip))/i.test(file.mimetype);
    if (allowed) callback(null, true);
    else callback(new Error('Unsupported project attachment type'));
  },
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const current = await actor(req);
    const result = await pool.query(
      `SELECT id, name, client_name, address, latitude, longitude,
              COALESCE(geofence_radius, 100) AS geofence_radius,
              COALESCE(status, 'active') AS status
       FROM projects WHERE company_id = $1
       ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, name`,
      [current.companyId],
    );
    res.json({ success: true, projects: result.rows });
  } catch (error: any) {
    sendError(res, error);
  }
});

router.get('/active', async (req: Request, res: Response) => {
  try {
    const current = await actor(req);
    const result = await pool.query(
      `SELECT id, name, client_name, address, latitude, longitude,
              COALESCE(geofence_radius, 100) AS geofence_radius, status
       FROM projects WHERE company_id = $1 AND status = 'active' ORDER BY name`,
      [current.companyId],
    );
    res.json({ success: true, projects: result.rows });
  } catch (error: any) {
    sendError(res, error);
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const current = await actor(req);
    requireProjectManager(current);
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'Project name is required' });
    const result = await pool.query(
      `INSERT INTO projects
       (company_id, name, client_name, address, latitude, longitude, geofence_radius, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        current.companyId,
        name,
        String(req.body?.client_name || '').trim() || null,
        String(req.body?.address || '').trim() || null,
        req.body?.latitude || null,
        req.body?.longitude || null,
        Number(req.body?.geofence_radius) || 100,
        ['active', 'on_hold', 'completed'].includes(req.body?.status) ? req.body.status : 'active',
      ],
    );
    res.status(201).json({ success: true, project: result.rows[0] });
  } catch (error: any) {
    sendError(res, error);
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const current = await actor(req);
    requireProjectManager(current);
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'Project name is required' });
    const status = ['active', 'on_hold', 'completed'].includes(req.body?.status) ? req.body.status : 'active';
    const result = await pool.query(
      `UPDATE projects SET name = $1, client_name = $2, address = $3,
              latitude = $4, longitude = $5, geofence_radius = $6, status = $7
       WHERE id = $8 AND company_id = $9 RETURNING *`,
      [
        name,
        String(req.body?.client_name || '').trim() || null,
        String(req.body?.address || '').trim() || null,
        req.body?.latitude || null,
        req.body?.longitude || null,
        Number(req.body?.geofence_radius) || 100,
        status,
        String(req.params.id),
        current.companyId,
      ],
    );
    if (!result.rowCount) return res.status(404).json({ success: false, message: 'Project not found' });
    res.json({ success: true, project: result.rows[0] });
  } catch (error: any) {
    sendError(res, error);
  }
});

router.put('/:id/geofence', async (req: Request, res: Response) => {
  try {
    const current = await actor(req);
    requireProjectManager(current);
    const result = await pool.query(
      `UPDATE projects SET latitude = $1, longitude = $2, geofence_radius = $3
       WHERE id = $4 AND company_id = $5 RETURNING *`,
      [req.body?.latitude, req.body?.longitude, Number(req.body?.geofence_radius) || 100, String(req.params.id), current.companyId],
    );
    if (!result.rowCount) return res.status(404).json({ success: false, message: 'Project not found' });
    res.json({ success: true, project: result.rows[0] });
  } catch (error: any) {
    sendError(res, error);
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const current = await actor(req);
    requireProjectManager(current);
    const result = await pool.query(
      `UPDATE projects SET status = 'completed'
       WHERE id = $1 AND company_id = $2 RETURNING id`,
      [String(req.params.id), current.companyId],
    );
    if (!result.rowCount) return res.status(404).json({ success: false, message: 'Project not found' });
    res.json({ success: true, message: 'Project archived' });
  } catch (error: any) {
    sendError(res, error);
  }
});

router.post('/:id/attachments', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const current = await actor(req);
    requireProjectManager(current);
    const projectId = String(req.params.id);
    const project = await pool.query(
      'SELECT id FROM projects WHERE id = $1 AND company_id = $2',
      [projectId, current.companyId],
    );
    if (!project.rowCount) return res.status(404).json({ success: false, message: 'Project not found' });
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    await pool.query(
      `INSERT INTO project_attachments (project_id, file_name, file_path, file_size, mime_type)
       VALUES ($1, $2, $3, $4, $5)`,
      [projectId, req.file.originalname, req.file.path, req.file.size, req.file.mimetype],
    );
    res.status(201).json({ success: true, message: 'File uploaded' });
  } catch (error: any) {
    sendError(res, error);
  }
});

export default router;
