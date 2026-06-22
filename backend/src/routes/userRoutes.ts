import { verifyToken } from '../utils/auth';
import express, { Request, Response } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import { pool } from '../config/database';

const router = express.Router();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// GET /api/users/company – list users in the same company (by token)
router.get('/company', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    
    const decoded = verifyToken(req);

    const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
    const companyId = userRes.rows[0]?.company_id;
    if (!companyId) return res.json({ success: true, users: [] });

    const result = await pool.query(
      'SELECT id, email, role, full_name, first_name, last_name, profile_pic FROM users WHERE company_id = $1',
      [companyId]
    );
    res.json({ success: true, users: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/users/company/:companyId – list users by company ID (used by mobile team screen)
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
      'SELECT id, email, role, full_name, first_name, last_name, profile_pic FROM users WHERE company_id = $1',
      [req.params.companyId]
    );
    res.json({ success: true, users: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/users/profile – update the logged‑in user's name
router.put('/profile', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    
    const decoded = verifyToken(req);

    const { firstName, lastName } = req.body;
    if (!firstName || !lastName) {
      return res.status(400).json({ success: false, message: 'First name and last name required' });
    }
    const fullName = `${firstName} ${lastName}`;
    await pool.query(
      'UPDATE users SET first_name = $1, last_name = $2, full_name = $3 WHERE id = $4',
      [firstName, lastName, fullName, decoded.id]
    );
    res.json({ success: true, user: { firstName, lastName, fullName } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/users/profile-pic – upload profile picture
router.post('/profile-pic', upload.single('photo'), async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    
    const decoded = verifyToken(req);
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    // Upload to Cloudinary
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

// GET /api/users/me – get current user (with profile pic)
router.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    
    const decoded = verifyToken(req);
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, full_name, role, company_id, profile_pic FROM users WHERE id = $1',
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