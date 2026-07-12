import { verifyToken } from '../utils/auth';
import express, { Request, Response } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { pool } from '../config/database';

const router = express.Router();

const logoDir = path.join(__dirname, '../../uploads/logos');
if (!fs.existsSync(logoDir)) fs.mkdirSync(logoDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, logoDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `logo-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed!') as any, false);
  }
});

// ─── GET /api/companies/:companyId ───
router.get('/:companyId', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, name, logo_url, temperature_unit, office_city, office_latitude, office_longitude,
              address, phone, email
       FROM companies WHERE id = $1`,
      [req.params.companyId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }
    res.json({ success: true, ...result.rows[0] });
  } catch (error: any) {
    console.error('Get company error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── PUT /api/companies/:companyId ─── (update general info)
router.put('/:companyId', async (req: Request, res: Response) => {
  try {
    const { name, address, phone, email } = req.body;
    const result = await pool.query(
      `UPDATE companies SET name = $1, address = $2, phone = $3, email = $4 WHERE id = $5 RETURNING *`,
      [name, address, phone, email, req.params.companyId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }
    res.json({ success: true, company: result.rows[0] });
  } catch (error: any) {
    console.error('Update company error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/companies/:companyId/logo
router.post('/:companyId/logo', upload.single('logo'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No logo file provided' });
    const logoUrl = `/uploads/logos/${req.file.filename}`;
    await pool.query('UPDATE companies SET logo_url = $1 WHERE id = $2', [logoUrl, req.params.companyId]);
    res.json({ success: true, logoUrl });
  } catch (error: any) {
    console.error('Logo upload error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/companies/:companyId/temperature-unit
router.put('/:companyId/temperature-unit', async (req: Request, res: Response) => {
  try {
    const { unit } = req.body;
    if (!unit || !['celsius','fahrenheit'].includes(unit)) {
      return res.status(400).json({ success: false, message: 'Unit must be celsius or fahrenheit' });
    }
    await pool.query('UPDATE companies SET temperature_unit = $1 WHERE id = $2', [unit, req.params.companyId]);
    res.json({ success: true, message: `Temperature unit updated to ${unit}` });
  } catch (error: any) {
    console.error('Temperature unit update error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/companies/:companyId/unit
router.get('/:companyId/unit', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT temperature_unit FROM companies WHERE id = $1', [req.params.companyId]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Company not found' });
    res.json({ success: true, temperature_unit: result.rows[0].temperature_unit || 'celsius' });
  } catch (error: any) {
    console.error('Get unit error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── GET /api/companies/:companyId/settings ───
router.get('/:companyId/settings', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const decoded = verifyToken(req);
    const { companyId } = req.params;

    const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
    if (userRes.rows.length === 0 || userRes.rows[0].company_id !== companyId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const result = await pool.query(
      `SELECT overtime_enabled, overtime_threshold_hours, overtime_multiplier FROM companies WHERE id = $1`,
      [companyId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }
    res.json({ success: true, settings: result.rows[0] });
  } catch (error: any) {
    console.error('Error fetching company settings:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── PUT /api/companies/:companyId/settings ─── (update overtime)
router.put('/:companyId/settings', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const decoded = verifyToken(req);
    const { companyId } = req.params;
    let { overtime_enabled, overtime_threshold_hours, overtime_multiplier } = req.body;

    // Only boss/manager can update settings
    const userRes = await pool.query('SELECT company_id, role FROM users WHERE id = $1', [decoded.id]);
    if (userRes.rows.length === 0 || userRes.rows[0].company_id !== companyId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    if (!['boss', 'manager'].includes(userRes.rows[0].role)) {
      return res.status(403).json({ success: false, message: 'Only boss/manager can update settings' });
    }

    // ─── Safe parsing ───
    const parsedThreshold = parseFloat(overtime_threshold_hours);
    const parsedMultiplier = parseFloat(overtime_multiplier);
    const enabled = overtime_enabled === true || overtime_enabled === 'true';

    if (isNaN(parsedThreshold) && overtime_threshold_hours !== undefined) {
      return res.status(400).json({ success: false, message: 'overtime_threshold_hours must be a number' });
    }
    if (isNaN(parsedMultiplier) && overtime_multiplier !== undefined) {
      return res.status(400).json({ success: false, message: 'overtime_multiplier must be a number' });
    }

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (overtime_enabled !== undefined) {
      updates.push(`overtime_enabled = $${idx++}`);
      values.push(enabled);
    }
    if (overtime_threshold_hours !== undefined) {
      updates.push(`overtime_threshold_hours = $${idx++}`);
      values.push(parsedThreshold);
    }
    if (overtime_multiplier !== undefined) {
      updates.push(`overtime_multiplier = $${idx++}`);
      values.push(parsedMultiplier);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }
    values.push(companyId);
    const query = `UPDATE companies SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`;
    const result = await pool.query(query, values);
    res.json({ success: true, settings: result.rows[0] });
  } catch (error: any) {
    console.error('Error updating company settings:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;