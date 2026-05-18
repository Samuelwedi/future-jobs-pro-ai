// ============================================
// PHOTO ROUTES
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import express, { Request, Response } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { analyzePhotoCompliance, savePhotoToDatabase } from '../services/photoComplianceService';
import { recordUserEvent } from '../services/adaptiveAIService';
import { pool } from '../config/database';

const router = express.Router();

// ------- Setup multer for file uploads -------
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `photo-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },   // 50 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!') as any, false);
    }
  }
});

// ---------------------------------------------------------------
// POST /api/photos/upload
// Upload a job photo and get AI compliance result
// ---------------------------------------------------------------
router.post('/upload', upload.single('photo'), async (req: Request, res: Response) => {
  console.log('\n📸 ========== NEW PHOTO UPLOAD – Samuel B. ==========');

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No photo file provided' });
    }

    const {
      userId,
      projectId,
      timeEntryId,
      latitude,
      longitude,
      expectedLatitude,
      expectedLongitude
    } = req.body;

    console.log(`📁 File: ${req.file.originalname}`);
    console.log(`👤 User: ${userId}`);
    console.log(`📋 Project: ${projectId}`);

    // 1. Run compliance analysis
    const complianceResult = await analyzePhotoCompliance(
      req.file.path,
      expectedLatitude ? parseFloat(expectedLatitude) : undefined,
      expectedLongitude ? parseFloat(expectedLongitude) : undefined
    );

    // 2. Save photo to database
    const savedPhoto = await savePhotoToDatabase(
      userId,
      projectId,
      timeEntryId || null,
      req.file.path,
      complianceResult,
      latitude ? parseFloat(latitude) : undefined,
      longitude ? parseFloat(longitude) : undefined
    );

    // 3. Record event for AI learning
    await recordUserEvent({
      userId,
      eventType: 'photo_taken',
      eventData: {
        photoId: savedPhoto.id,
        complianceScore: complianceResult.score,
        passed: complianceResult.passed,
        issues: complianceResult.issues
      },
      latitude: latitude ? parseFloat(latitude) : undefined,
      longitude: longitude ? parseFloat(longitude) : undefined
    });

    // 4. Respond
    res.json({
      success: true,
      photoId: savedPhoto.id,
      compliance: {
        passed: complianceResult.passed,
        score: complianceResult.score,
        issues: complianceResult.issues,
        suggestions: complianceResult.suggestions
      },
      metadata: complianceResult.metadata,
      verificationHash: complianceResult.verificationHash,
      message: complianceResult.passed
        ? '✅ Photo passed compliance check!'
        : '⚠️ Photo has issues that may affect dispute resolution'
    });

  } catch (error) {
    console.error('❌ Photo upload error:', error);
    res.status(500).json({ success: false, message: 'Failed to process photo' });
  }
});

// ---------------------------------------------------------------
// GET /api/photos/report/:photoId
// Generate a compliance report for a specific photo
// ---------------------------------------------------------------
router.get('/report/:photoId', async (req: Request, res: Response) => {
  try {
    const { photoId } = req.params;
    const result = await pool.query(
      `SELECT p.*, u.first_name || ' ' || u.last_name as user_name, pr.name as project_name
       FROM photos p
       JOIN users u ON p.user_id = u.id
       JOIN projects pr ON p.project_id = pr.id
       WHERE p.id = $1`,
      [photoId]
    );
    const photo = result.rows[0];
    if (!photo) {
      return res.status(404).json({ success: false, message: 'Photo not found' });
    }

    res.json({
      success: true,
      report: {
        photoId: photo.id,
        takenBy: photo.user_name,
        project: photo.project_name,
        takenAt: photo.taken_at,
        location: { latitude: photo.latitude, longitude: photo.longitude },
        complianceScore: photo.compliance_score,
        verificationHash: photo.verification_hash,
        isCompliant: photo.compliance_score >= 70,
        reportGeneratedBy: 'Samuel B. – Future Jobs Pro AI'
      }
    });
  } catch (error) {
    console.error('❌ Report error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate report' });
  }
});

// ---------------------------------------------------------------
// GET /api/photos/project/:projectId
// Get all photos for a project
// ---------------------------------------------------------------
router.get('/project/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const result = await pool.query(
      `SELECT p.*, u.first_name || ' ' || u.last_name as taken_by
       FROM photos p
       JOIN users u ON p.user_id = u.id
       WHERE p.project_id = $1
       ORDER BY p.taken_at DESC`,
      [projectId]
    );
    res.json({ success: true, count: result.rows.length, photos: result.rows });
  } catch (error) {
    console.error('❌ Fetch photos error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch photos' });
  }
});

export default router;