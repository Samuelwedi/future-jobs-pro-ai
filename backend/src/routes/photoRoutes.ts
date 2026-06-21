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

// Multer memory storage
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Helper: get company_id from JWT
const getCompanyId = async (req: Request): Promise<string | null> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = verifyToken(req);
    const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
    return userRes.rows[0]?.company_id || null;
  } catch {
    return null;
  }
};

// POST /api/photos/upload
router.post('/upload', upload.single('photo'), async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    if (!req.file) return res.status(400).json({ success: false, message: 'No photo file' });

    const { userId, projectId, timeEntryId, template, latitude, longitude } = req.body;
    if (!userId || !projectId) {
      return res.status(400).json({ success: false, message: 'Missing userId or projectId' });
    }

    // Upload to Cloudinary
    const uploadResult: any = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: `future-jobs-pro-ai/projects/${projectId}` },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      const readable = Readable.from(req.file!.buffer);
      readable.pipe(uploadStream);
    });

    const photoUrl = uploadResult.secure_url;

    // Insert into database
    const result = await pool.query(
      `INSERT INTO photos (company_id, user_id, project_id, time_entry_id, s3_key, taken_at, latitude, longitude, metadata)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8) RETURNING id`,
      [companyId, userId, projectId, timeEntryId || null, photoUrl, latitude || null, longitude || null, JSON.stringify({ template })]
    );

    // Mock compliance score (replace with real AI later)
    const complianceScore = 85;
    const passed = complianceScore >= 70;

    res.json({
      success: true,
      photoId: result.rows[0].id,
      compliance: { passed, score: complianceScore, issues: [], suggestions: ['Good photo'] },
      verificationHash: uploadResult.public_id,
    });
  } catch (error: any) {
    console.error('Photo upload error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/photos/company – all photos for the user's company
router.get('/company', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const result = await pool.query('SELECT * FROM photos WHERE company_id = $1 ORDER BY taken_at DESC', [companyId]);
    res.json({ success: true, photos: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ----- NEW: GET photos for a specific project -----
router.get('/project/:projectId', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { projectId } = req.params;
    if (!projectId) return res.status(400).json({ success: false, message: 'Project ID required' });

    const result = await pool.query(
      'SELECT * FROM photos WHERE project_id = $1 AND company_id = $2 ORDER BY taken_at DESC',
      [projectId, companyId]
    );
    res.json({ success: true, photos: result.rows });
  } catch (error: any) {
    console.error('Error fetching project photos:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;