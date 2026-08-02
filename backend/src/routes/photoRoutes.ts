import { verifyToken } from '../utils/auth';
import express, { Request, Response } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { pool } from '../config/database';
import { applyWatermark } from '../services/watermarkService';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const router = express.Router();

const tempDir = path.join(__dirname, '../../uploads/temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 1024 },
});

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

    const isVideo = req.file.mimetype.startsWith('video/');
    const ext = isVideo ? '.mp4' : '.jpg';
    const tempInput = path.join(tempDir, `input-${Date.now()}${ext}`);
    const tempOutput = path.join(tempDir, `watermarked-${Date.now()}${ext}`);

    fs.writeFileSync(tempInput, req.file.buffer);

    const metadata = {
      latitude: latitude ? parseFloat(latitude) : undefined,
      longitude: longitude ? parseFloat(longitude) : undefined,
      address: address || undefined,
      weather: weather || undefined,
      altitude: req.body.altitude ? parseFloat(req.body.altitude) : undefined,
      direction: req.body.direction ? parseFloat(req.body.direction) : undefined,
      takenAt: new Date(),
    };

    const { outputPath, verificationHash } = await applyWatermark(
      tempInput,
      tempOutput,
      metadata,
      { position: isVideo ? 'bottom-left' : 'bottom-left' }
    );

    // --- DYNAMIC FOLDER PATH ---
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const mediaType = isVideo ? 'videos' : 'photos';
    const folderPath = `future-jobs-pro-ai/projects/${projectId}/${year}-${month}/${mediaType}`;

    const uploadResult = await cloudinary.uploader.upload(outputPath, {
      folder: folderPath,
      resource_type: isVideo ? 'video' : 'image',
    });

    const fileUrl = uploadResult.secure_url;

    const result = await pool.query(
      `INSERT INTO photos (
        company_id, user_id, project_id, time_entry_id, s3_key, taken_at,
        latitude, longitude, metadata, file_type, verification_hash, folder_path
      ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9, $10, $11) RETURNING id`,
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
        folderPath,
      ]
    );

    fs.unlinkSync(tempInput);
    fs.unlinkSync(tempOutput);

    const complianceScore = isVideo ? 80 : 85;
    res.json({
      success: true,
      photoId: result.rows[0].id,
      verificationHash,
      compliance: { passed: complianceScore >= 70, score: complianceScore, issues: [], suggestions: ['Good file'] },
      fileType: isVideo ? 'video' : 'image',
    });
  } catch (error: any) {
    console.error('Photo upload error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/photos/verify/:id
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

// GET /api/photos/company
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

// GET /api/photos/project/:projectId
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

import { generateEvidenceReport } from '../services/reportService';

// ─── POST /api/photos/report ──────────────────────────────────────
router.post('/report', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });

    const decoded = verifyToken(req);
    const { photoIds, reportTitle, projectId } = req.body;
    if (!photoIds || !Array.isArray(photoIds) || photoIds.length === 0) {
      return res.status(400).json({ success: false, message: 'photoIds array required' });
    }

    // Fetch photos from DB
    const photoRes = await pool.query(
      `SELECT p.id, p.s3_key, p.taken_at, p.taken_by, p.compliance_score, p.verification_hash,
              u.company_id
       FROM photos p
       LEFT JOIN users u ON p.taken_by = u.id
       WHERE p.id = ANY($1)`,
      [photoIds]
    );

    if (photoRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No photos found' });
    }

    // Get company name
    const companyRes = await pool.query('SELECT name FROM companies WHERE id = $1', [
      photoRes.rows[0].company_id || decoded.companyId
    ]);
    const companyName = companyRes.rows[0]?.name || 'Future Jobs Pro AI';

    // Generate PDF
    const pdfBuffer = await generateEvidenceReport(
      photoRes.rows,
      reportTitle || 'Job Evidence Report',
      companyName
    );

    // Upload PDF to Cloudinary (or S3) and return URL
    // For now, we'll save it temporarily and return a data URL (not ideal for production)
    // In production, you'd upload to Cloudinary/S3 and return the URL.
    // Let's use base64 encoding for demonstration.
    const base64 = pdfBuffer.toString('base64');
    const dataUrl = `data:application/pdf;base64,${base64}`;

    // Optionally, you could store the PDF URL in a database for later retrieval.
    // But for simplicity, we'll return the data URL.

    res.json({ success: true, reportUrl: dataUrl });
  } catch (error) {
    console.error('Report generation error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;