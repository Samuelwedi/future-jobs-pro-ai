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
              address, phone, email, primary_color, accent_color, default_hourly_rate
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
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const decoded = verifyToken(req);
    const { companyId } = req.params;
    const { name, address, phone, email, primary_color, accent_color, default_hourly_rate } = req.body;

    // Verify user belongs to this company
    const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
    if (userRes.rows.length === 0 || userRes.rows[0].company_id !== companyId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    // Build dynamic update
    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;
    if (name !== undefined) { updates.push(`name = $${idx++}`); values.push(name); }
    if (address !== undefined) { updates.push(`address = $${idx++}`); values.push(address); }
    if (phone !== undefined) { updates.push(`phone = $${idx++}`); values.push(phone); }
    if (email !== undefined) { updates.push(`email = $${idx++}`); values.push(email); }
    if (primary_color !== undefined) { updates.push(`primary_color = $${idx++}`); values.push(primary_color); }
    if (accent_color !== undefined) { updates.push(`accent_color = $${idx++}`); values.push(accent_color); }
    if (default_hourly_rate !== undefined) { updates.push(`default_hourly_rate = $${idx++}`); values.push(default_hourly_rate); }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    values.push(companyId);
    const query = `UPDATE companies SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`;
    const result = await pool.query(query, values);
    res.json({ success: true, company: result.rows[0] });
  } catch (error: any) {
    console.error('Update company error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── POST /api/companies/:companyId/logo ───
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

// ─── PUT /api/companies/:companyId/temperature-unit ───
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

// ─── GET /api/companies/:companyId/unit ───
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

export default router;