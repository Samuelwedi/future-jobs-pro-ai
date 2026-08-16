import { verifyToken } from '../utils/auth';
import express, { Request, Response } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { pool } from '../config/database';
import { applyWatermark } from '../services/watermarkService';
import { analyzePhotoCompliance, ComplianceCheckResult } from '../services/photoComplianceService';
import { generateEvidenceReport } from '../services/reportService';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const router = express.Router();
const tempDir = path.join(__dirname, '../../uploads/temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 * 1024 } });

async function actor(req: Request): Promise<{ userId: string; companyId: string } | null> {
  try {
    const decoded = verifyToken(req);
    const result = await pool.query('SELECT id, company_id FROM users WHERE id = $1', [decoded.id]);
    if (!result.rowCount || !result.rows[0].company_id) return null;
    return { userId: String(result.rows[0].id), companyId: String(result.rows[0].company_id) };
  } catch { return null; }
}

function removeFile(file: string | undefined) {
  if (file && fs.existsSync(file)) fs.unlinkSync(file);
}

router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  let tempInput: string | undefined;
  let tempOutput: string | undefined;
  try {
    const current = await actor(req);
    if (!current) return res.status(401).json({ success: false, message: 'Not authenticated' });
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const { userId, projectId, timeEntryId, template, latitude, longitude, weather, address } = req.body;
    if (!userId || !projectId) return res.status(400).json({ success: false, message: 'Missing userId or projectId' });
    const ownership = await pool.query(
      `SELECT EXISTS(SELECT 1 FROM users WHERE id = $1 AND company_id = $3) valid_user,
              EXISTS(SELECT 1 FROM projects WHERE id = $2 AND company_id = $3) valid_project`,
      [userId, projectId, current.companyId],
    );
    if (!ownership.rows[0]?.valid_user || !ownership.rows[0]?.valid_project) {
      return res.status(403).json({ success: false, message: 'Employee or project is outside your company' });
    }

    const isVideo = req.file.mimetype.startsWith('video/');
    const extension = isVideo ? '.mp4' : path.extname(req.file.originalname || '') || '.jpg';
    const unique = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
    tempInput = path.join(tempDir, `input-${unique}${extension}`);
    tempOutput = path.join(tempDir, `watermarked-${unique}${extension}`);
    fs.writeFileSync(tempInput, req.file.buffer);

    const compliance: ComplianceCheckResult | null = isVideo
      ? null
      : await analyzePhotoCompliance(tempInput);
    const watermarkMetadata = {
      latitude: latitude ? Number(latitude) : undefined,
      longitude: longitude ? Number(longitude) : undefined,
      address: address || undefined,
      weather: weather || undefined,
      altitude: req.body.altitude ? Number(req.body.altitude) : undefined,
      direction: req.body.direction ? Number(req.body.direction) : undefined,
      takenAt: new Date(),
    };
    const watermarked = await applyWatermark(tempInput, tempOutput, watermarkMetadata, { position: 'bottom-left' });
    const now = new Date();
    const folderPath = `future-jobs-pro-ai/projects/${projectId}/${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}/${isVideo ? 'videos' : 'photos'}`;
    const uploaded = await cloudinary.uploader.upload(watermarked.outputPath, {
      folder: folderPath,
      resource_type: isVideo ? 'video' : 'image',
    });
    const analysis = compliance ? {
      aiAnalyzed: compliance.aiAnalyzed,
      description: compliance.aiDescription,
      image: compliance.metadata,
    } : null;
    const result = await pool.query(
      `INSERT INTO photos (
         company_id, user_id, project_id, time_entry_id, s3_key, taken_at,
         latitude, longitude, metadata, file_type, verification_hash, folder_path,
         compliance_score, compliance_passed, compliance_issues,
         compliance_suggestions, compliance_analysis, compliance_model,
         compliance_analyzed_at, ai_tags
       ) VALUES (
         $1,$2,$3,$4,$5,NOW(),$6,$7,$8,$9,$10,$11,
         $12,$13,$14::jsonb,$15::jsonb,$16::jsonb,$17,$18,$19::jsonb
       ) RETURNING id`,
      [
        current.companyId, userId, projectId, timeEntryId || null, uploaded.secure_url,
        latitude || null, longitude || null,
        JSON.stringify({ template, watermarked: true, address, weather, verificationHash: watermarked.verificationHash }),
        isVideo ? 'video' : 'image', watermarked.verificationHash, folderPath,
        compliance?.score ?? null, compliance?.passed ?? null,
        JSON.stringify(compliance?.issues || []), JSON.stringify(compliance?.suggestions || []),
        JSON.stringify(analysis), compliance?.aiModel || null, compliance ? new Date() : null,
        JSON.stringify(compliance?.aiTags || []),
      ],
    );
    res.json({
      success: true,
      photoId: result.rows[0].id,
      verificationHash: watermarked.verificationHash,
      compliance: compliance || {
        analyzed: false,
        score: null,
        passed: null,
        issues: [],
        suggestions: ['Still-photo compliance scoring does not assign fabricated scores to video files.'],
      },
      fileType: isVideo ? 'video' : 'image',
    });
  } catch (error: any) {
    console.error('Photo upload error:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    removeFile(tempInput);
    removeFile(tempOutput);
  }
});

router.get('/verify/:id', async (req: Request, res: Response) => {
  try {
    const current = await actor(req);
    if (!current) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const result = await pool.query(
      `SELECT id, verification_hash, compliance_score, compliance_passed,
              compliance_analyzed_at, compliance_model
       FROM photos WHERE id = $1 AND company_id = $2`,
      [String(req.params.id), current.companyId],
    );
    if (!result.rowCount) return res.status(404).json({ success: false, message: 'Photo not found' });
    const photo = result.rows[0];
    res.json({
      success: true,
      verified: Boolean(photo.verification_hash),
      storedHash: photo.verification_hash,
      compliance: {
        score: photo.compliance_score,
        passed: photo.compliance_passed,
        analyzedAt: photo.compliance_analyzed_at,
        model: photo.compliance_model,
      },
      message: photo.verification_hash ? 'Evidence has a stored upload verification hash.' : 'No verification hash is stored.',
    });
  } catch (error: any) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/company', async (req: Request, res: Response) => {
  try {
    const current = await actor(req);
    if (!current) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const result = await pool.query('SELECT * FROM photos WHERE company_id = $1 ORDER BY taken_at DESC', [current.companyId]);
    res.json({ success: true, photos: result.rows });
  } catch (error: any) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/project/:projectId', async (req: Request, res: Response) => {
  try {
    const current = await actor(req);
    if (!current) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const result = await pool.query(
      'SELECT * FROM photos WHERE project_id = $1 AND company_id = $2 ORDER BY taken_at DESC',
      [String(req.params.projectId), current.companyId],
    );
    res.json({ success: true, photos: result.rows });
  } catch (error: any) { res.status(500).json({ success: false, message: error.message }); }
});

router.post('/report', async (req: Request, res: Response) => {
  try {
    const current = await actor(req);
    if (!current) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const { photoIds, reportTitle } = req.body;
    if (!Array.isArray(photoIds) || !photoIds.length) return res.status(400).json({ success: false, message: 'photoIds array required' });
    const photoResult = await pool.query(
      `SELECT p.id, p.s3_key, p.taken_at, p.user_id AS taken_by,
              p.compliance_score, p.verification_hash, p.company_id
       FROM photos p WHERE p.id = ANY($1) AND p.company_id = $2`,
      [photoIds, current.companyId],
    );
    if (!photoResult.rowCount) return res.status(404).json({ success: false, message: 'No photos found' });
    const company = await pool.query('SELECT name FROM companies WHERE id = $1', [current.companyId]);
    const pdf = await generateEvidenceReport(photoResult.rows, reportTitle || 'Job Evidence Report', company.rows[0]?.name || 'Future Jobs Pro AI');
    res.json({ success: true, reportUrl: `data:application/pdf;base64,${pdf.toString('base64')}` });
  } catch (error: any) {
    console.error('Report generation error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
