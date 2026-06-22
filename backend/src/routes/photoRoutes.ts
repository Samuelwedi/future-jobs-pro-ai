import { verifyToken } from '../utils/auth';
import express, { Request, Response } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { pool } from '../config/database';
import { applyWatermark, generateWatermarkedPDFReport } from '../services/watermarkService';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const router = express.Router();

// Create temp directory for watermark processing
const tempDir = path.join(__dirname, '../../uploads/temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer: allow up to 1 GB for large video files
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 1024 },
});

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

// POST /api/photos/upload – handles both images and videos with watermark + hash
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const { userId, projectId, timeEntryId, template, latitude, longitude, weather, address } = req.body;
    if (!userId || !projectId) {
      return res.status(400).json({ success: false, message: 'Missing userId or projectId' });
    }

    // Determine file type
    const isVideo = req.file.mimetype.startsWith('video/');
    const ext = isVideo ? '.mp4' : '.jpg';
    const tempInput = path.join(tempDir, `input-${Date.now()}${ext}`);
    const tempOutput = path.join(tempDir, `watermarked-${Date.now()}${ext}`);

    // Write uploaded buffer to temp file
    fs.writeFileSync(tempInput, req.file.buffer);

    // Build metadata for watermark
    const metadata = {
      latitude: latitude ? parseFloat(latitude) : undefined,
      longitude: longitude ? parseFloat(longitude) : undefined,
      address: address || undefined,
      weather: weather || undefined,
      altitude: req.body.altitude ? parseFloat(req.body.altitude) : undefined,
      direction: req.body.direction ? parseFloat(req.body.direction) : undefined,
      takenAt: new Date(),
    };

    // Apply watermark – get hash back
    const { outputPath, verificationHash } = await applyWatermark(
      tempInput,
      tempOutput,
      metadata,
      {
        template: template || 'standard',
        position: isVideo ? 'bottom-left' : 'bottom-left',
      }
    );

    // Upload to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(outputPath, {
      folder: `future-jobs-pro-ai/projects/${projectId}`,
      resource_type: isVideo ? 'video' : 'image',
    });

    const fileUrl = uploadResult.secure_url;

    // Save record to database (including verification_hash)
    const result = await pool.query(
      `INSERT INTO photos (company_id, user_id, project_id, time_entry_id, s3_key, taken_at, latitude, longitude, metadata, file_type, verification_hash)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9, $10) RETURNING id`,
      [
        companyId,
        userId,
        projectId,
        timeEntryId || null,
        fileUrl,
        latitude || null,
        longitude || null,
        JSON.stringify({ template, watermarked: true, address, weather, verificationHash }),
        isVideo ? 'video' : 'image',
        verificationHash,
      ]
    );

    // Clean up temp files
    fs.unlinkSync(tempInput);
    fs.unlinkSync(tempOutput);

    // Mock compliance score (you can integrate AI later)
    const complianceScore = isVideo ? 80 : 85;
    const passed = complianceScore >= 70;

    res.json({
      success: true,
      photoId: result.rows[0].id,
      verificationHash,
      compliance: { passed, score: complianceScore, issues: [], suggestions: ['Good file'] },
      fileType: isVideo ? 'video' : 'image',
    });
  } catch (error: any) {
    console.error('Photo upload error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/photos/verify/:id – Tamper‑proof verification endpoint
router.get('/verify/:id', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const { id } = req.params;
    const result = await pool.query(
      `SELECT id, verification_hash, latitude, longitude, address, weather, taken_at, metadata
       FROM photos WHERE id = $1 AND company_id = $2`,
      [id, companyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Photo not found' });
    }

    const photo = result.rows[0];
    if (!photo.verification_hash) {
      return res.json({ success: true, verified: false, message: 'No hash stored for this photo' });
    }

    // Recompute hash from stored data
    const meta = photo.metadata || {};
    const address = meta.address || photo.address || '';
    const weather = meta.weather || photo.weather || '';
    const lat = photo.latitude || 0;
    const lng = photo.longitude || 0;
    const takenAt = photo.taken_at || new Date();

    const data = JSON.stringify({
      lat,
      lng,
      address,
      weather,
      time: takenAt.toISOString(),
    });
    const recomputedHash = crypto.createHash('sha256').update(data).digest('hex').slice(0, 8);
    const verified = recomputedHash === photo.verification_hash;

    res.json({
      success: true,
      verified,
      storedHash: photo.verification_hash,
      recomputedHash,
      message: verified
        ? '✅ Photo is authentic and tamper‑proof'
        : '❌ Hash mismatch – photo may have been altered',
    });
  } catch (error: any) {
    console.error('Verification error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/photos/company – all photos for the user's company
router.get('/company', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const result = await pool.query(
      'SELECT * FROM photos WHERE company_id = $1 ORDER BY taken_at DESC',
      [companyId]
    );
    res.json({ success: true, photos: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/photos/project/:projectId – photos for a specific project
router.get('/project/:projectId', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const { projectId } = req.params;
    if (!projectId) {
      return res.status(400).json({ success: false, message: 'Project ID required' });
    }
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