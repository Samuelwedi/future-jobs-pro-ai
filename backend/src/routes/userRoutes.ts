import { verifyToken } from '../utils/auth';
import express, { Request, Response } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import { pool } from '../config/database';

const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ─── GET /api/users/company ──────────────────────────────────────
router.get('/company', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    
    const decoded = verifyToken(req);
    const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
    if (userRes.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    
    const companyId = userRes.rows[0].company_id;
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    // ✅ Select only columns that exist
    const result = await pool.query(
      `SELECT id, first_name, last_name, email, role
       FROM users
       WHERE company_id = $1
         AND role NOT IN ('boss', 'manager')
       ORDER BY first_name`,
      [companyId]
    );
    res.json({ success: true, users: result.rows });
  } catch (error) {
    console.error('Error fetching company users:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── GET /api/users/company/:companyId ──────────────────────────
router.get('/company/:companyId', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    
    const decoded = verifyToken(req);

    const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
    if (userRes.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    if (userRes.rows[0].company_id !== req.params.companyId)
      return res.status(403).json({ success: false, message: 'Forbidden' });

    const result = await pool.query(
      `SELECT id, email, role, full_name, first_name, last_name, profile_pic,
              sin, date_of_birth
       FROM users WHERE company_id = $1`,
      [req.params.companyId]
    );
    res.json({ success: true, users: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── PUT /api/users/profile ──────────────────────────────────────
router.put('/profile', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    
    const decoded = verifyToken(req);

    const { firstName, lastName, sin, dateOfBirth } = req.body;

    const updates: string[] = [];
    const values: any[] = [];
    let paramCounter = 1;

    if (firstName) {
      updates.push(`first_name = $${paramCounter++}`);
      values.push(firstName);
    }
    if (lastName) {
      updates.push(`last_name = $${paramCounter++}`);
      values.push(lastName);
    }
    if (firstName && lastName) {
      updates.push(`full_name = $${paramCounter++}`);
      values.push(`${firstName} ${lastName}`);
    }
    if (sin !== undefined) {
      updates.push(`sin = $${paramCounter++}`);
      values.push(sin);
    }
    if (dateOfBirth !== undefined) {
      updates.push(`date_of_birth = $${paramCounter++}`);
      values.push(dateOfBirth);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    values.push(decoded.id);
    const query = `
      UPDATE users
      SET ${updates.join(', ')}
      WHERE id = $${paramCounter}
      RETURNING first_name, last_name, full_name, sin, date_of_birth
    `;

    const result = await pool.query(query, values);
    res.json({ success: true, user: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── PUT /api/users/:id/tax-info ────────────────────────────────
router.put('/:id/tax-info', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    
    const decoded = verifyToken(req);
    const { id } = req.params;

    const userRes = await pool.query(
      'SELECT company_id FROM users WHERE id = $1',
      [decoded.id]
    );
    const targetRes = await pool.query(
      'SELECT company_id FROM users WHERE id = $1',
      [id]
    );
    if (targetRes.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    if (userRes.rows[0].company_id !== targetRes.rows[0].company_id)
      return res.status(403).json({ success: false, message: 'Forbidden' });

    const { sin, dateOfBirth } = req.body;
    await pool.query(
      `UPDATE users SET sin = COALESCE($1, sin), date_of_birth = COALESCE($2, date_of_birth)
       WHERE id = $3`,
      [sin, dateOfBirth, id]
    );
    res.json({ success: true, message: 'Tax info updated' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── POST /api/users/profile-pic ──────────────────────────────────
router.post('/profile-pic', upload.single('photo'), async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    
    const decoded = verifyToken(req);
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const uploadResult: any = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: `future-jobs-pro-ai/profile/${decoded.id}` },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      const readable = Readable.from(req.file!.buffer);
      readable.pipe(uploadStream);
    });

    const profilePicUrl = uploadResult.secure_url;
    await pool.query('UPDATE users SET profile_pic = $1 WHERE id = $2', [profilePicUrl, decoded.id]);

    res.json({ success: true, profilePic: profilePicUrl });
  } catch (error: any) {
    console.error('Profile pic upload error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── GET /api/users/me ────────────────────────────────────────────
router.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    
    const decoded = verifyToken(req);
    const result = await pool.query(
      `SELECT id, email, first_name, last_name, full_name, role, company_id, profile_pic,
              sin, date_of_birth
       FROM users WHERE id = $1`,
      [decoded.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, user: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;