import { verifyToken } from '../utils/auth';
// ============================================
// VOICE NOTES ROUTES
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import express, { Request, Response } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { processVoiceNote, getProjectVoiceNotes } from '../services/voiceService';

const router = express.Router();

// ------- Setup multer for audio uploads -------
const uploadDir = path.join(__dirname, '../../uploads/voice');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname) || '.m4a';
    cb(null, `voice-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },   // 100 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed!') as any, false);
    }
  }
});

// ---------------------------------------------------------------
// POST /api/voice/process
// Upload an audio file and get AI transcription + extraction
// ---------------------------------------------------------------
router.post('/process', upload.single('audio'), async (req: Request, res: Response) => {
  console.log('\n🎙️  ========== NEW VOICE NOTE – Samuel B. ==========');
  console.log('📋 Request body:', req.body);
  console.log('📎 File:', req.file ? req.file.originalname : 'NO FILE');

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No audio file provided' });
    }

    const { userId, projectId, timeEntryId } = req.body;

    if (!userId || !projectId || !timeEntryId) {
      console.log('❌ Missing fields:', { userId, projectId, timeEntryId });
      return res.status(400).json({ success: false, message: 'Missing required fields: userId, projectId, timeEntryId' });
    }

    console.log(`📁 File: ${req.file.originalname}`);
    console.log(`👤 User: ${userId}`);
    console.log(`📋 Project: ${projectId}`);

    const result = await processVoiceNote(req.file.path, userId, projectId, timeEntryId);

    res.json({
      success: true,
      voiceNoteId: result.id,
      transcript: result.transcript,
      structuredData: result.structuredData,
      clientSummary: result.clientSummary,
      tags: result.tags,
      duration: result.duration
    });

  } catch (error) {
    console.error('❌ Voice processing error:', error);
    res.status(500).json({ success: false, message: 'Failed to process voice note' });
  }
});

// ---------------------------------------------------------------
// GET /api/voice/project/:projectId
// Get all voice notes for a project
// ---------------------------------------------------------------
router.get('/project/:projectId', async (req: Request, res: Response) => {
  try {
    const notes = await getProjectVoiceNotes(req.params.projectId as string);
    res.json({ success: true, count: notes.length, notes });
  } catch (error) {
    console.error('❌ Fetch voice notes error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch voice notes' });
  }
});

export default router;