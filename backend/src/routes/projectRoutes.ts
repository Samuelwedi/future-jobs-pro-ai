import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { pool } from '../config/database';

const router = express.Router();
const COMPANY_ID = 'ed1887d9-3ffd-46e4-b281-338c8ad03a66';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = './uploads/projects';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ─── GET all projects ───
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, name, client_name, address, latitude, longitude, geofence_radius, status 
       FROM projects WHERE company_id = $1`,
      [COMPANY_ID]
    );
    res.json({ success: true, projects: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── GET active projects ───
router.get('/active', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, name, client_name, address, latitude, longitude, geofence_radius, status 
       FROM projects WHERE company_id = $1 AND status = $2`,
      [COMPANY_ID, 'active']
    );
    res.json({ success: true, projects: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── CREATE project ───
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, client_name, address, latitude, longitude, geofence_radius } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Project name is required' });
    const result = await pool.query(
      `INSERT INTO projects (company_id, name, client_name, address, latitude, longitude, geofence_radius, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active') RETURNING *`,
      [COMPANY_ID, name, client_name || null, address || null, latitude || null, longitude || null, geofence_radius || 100]
    );
    res.status(201).json({ success: true, project: result.rows[0] });
  } catch (error: any) {
    console.error('Create project error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── UPDATE geofence ─── (new endpoint)
router.put('/:id/geofence', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { latitude, longitude, geofence_radius } = req.body;
    const result = await pool.query(
      `UPDATE projects 
       SET latitude = $1, longitude = $2, geofence_radius = $3 
       WHERE id = $4 AND company_id = $5 
       RETURNING *`,
      [latitude, longitude, geofence_radius, id, COMPANY_ID]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    res.json({ success: true, project: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── POST /api/projects/:id/attachments ───
router.post('/:id/attachments', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;
    const projectCheck = await pool.query('SELECT id FROM projects WHERE id = $1 AND company_id = $2', [projectId, COMPANY_ID]);
    if (projectCheck.rows.length === 0) return res.status(404).json({ success: false, message: 'Project not found' });
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    await pool.query(
      `INSERT INTO project_attachments (project_id, file_name, file_path, file_size, mime_type) 
       VALUES ($1, $2, $3, $4, $5)`,
      [projectId, file.originalname, file.path, file.size, file.mimetype]
    );
    res.json({ success: true, message: 'File uploaded' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;