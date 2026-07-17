import { verifyToken } from '../utils/auth';
import express, { Request, Response } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { pool } from '../config/database';
import { processVoiceNote, processTranscriptOnly } from '../services/voiceService';
import * as fs from 'fs';

const router = express.Router();

// ------------------------------
// Cloudinary configuration
// ------------------------------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ------------------------------
// Multer configuration (for audio file uploads)
// ------------------------------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed!') as any, false);
    }
  }
});

// ============================================================
// 1. ORIGINAL ENDPOINT: process an audio file (Whisper fallback)
//    POST /voice/process
// ============================================================
router.post('/process', upload.single('audio'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No audio file provided' });
    }

    const { userId, projectId, timeEntryId } = req.body;
    if (!userId || !projectId) {
      return res.status(400).json({ success: false, message: 'Missing userId or projectId' });
    }

    // ✅ Fetch company_id from the users table
    const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId]);
    const companyId = userRes.rows[0]?.company_id;
    if (!companyId) {
      return res.status(401).json({ success: false, message: 'User has no company' });
    }

    // Upload audio to Cloudinary
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const folderPath = `future-jobs-pro-ai/projects/${projectId}/${year}-${month}/voice-notes`;

    const uploadResult = await cloudinary.uploader.upload(
      `data:audio/m4a;base64,${req.file.buffer.toString('base64')}`,
      {
        folder: folderPath,
        resource_type: 'video',
        public_id: `audio_${Date.now()}`,
      }
    );

    const audioUrl = uploadResult.secure_url;

    // Process transcription (saves voice note record internally)
    const tempFile = `/tmp/voice-${Date.now()}.m4a`;
    fs.writeFileSync(tempFile, req.file.buffer);
    const result = await processVoiceNote(tempFile, userId, projectId, timeEntryId);
    fs.unlinkSync(tempFile);

    // Insert into voice_notes with company_id and audio_url
    const query = `
      INSERT INTO voice_notes
      (company_id, user_id, project_id, time_entry_id, audio_url, transcript, duration_seconds, taken_at, folder_path, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9)
      RETURNING id
    `;
    const values = [
      companyId,
      userId,
      projectId,
      timeEntryId || null,
      audioUrl,
      result.transcript,
      result.duration,
      folderPath,
      JSON.stringify({ structured: result.structuredData, tags: result.tags })
    ];
    const dbResult = await pool.query(query, values);

    res.json({
      success: true,
      voiceNoteId: dbResult.rows[0].id,
      transcript: result.transcript,
      structuredData: result.structuredData,
      clientSummary: result.clientSummary,
      tags: result.tags,
      duration: result.duration,
    });

  } catch (error) {
    console.error('❌ Voice processing error:', error);
    res.status(500).json({ success: false, message: 'Failed to process voice note' });
  }
});

// ============================================================
// 2. NEW ENDPOINT: process a transcript (Deepgram streaming)
//    POST /voice/process-transcript
// ============================================================
router.post('/process-transcript', async (req: Request, res: Response) => {
  try {
    const { userId, projectId, timeEntryId, transcript } = req.body;

    // Validate required fields
    if (!userId || !projectId || !transcript) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: userId, projectId, transcript'
      });
    }

    // Fetch company_id from the users table (needed for DB insert)
    const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId]);
    const companyId = userRes.rows[0]?.company_id;
    if (!companyId) {
      return res.status(401).json({ success: false, message: 'User has no company' });
    }

    // Process the transcript (extract structured data, generate summary, tags)
    const result = await processTranscriptOnly(transcript, userId, projectId, timeEntryId);

    // Insert into voice_notes with company_id (no audio_url – set to NULL)
    const query = `
      INSERT INTO voice_notes
      (company_id, user_id, project_id, time_entry_id, audio_url, transcript, duration_seconds, taken_at, folder_path, metadata)
      VALUES ($1, $2, $3, $4, NULL, $5, $6, NOW(), NULL, $7)
      RETURNING id
    `;
    const values = [
      companyId,
      userId,
      projectId,
      timeEntryId || null,
      result.transcript,
      result.duration,
      JSON.stringify({ structured: result.structuredData, tags: result.tags })
    ];
    const dbResult = await pool.query(query, values);

    res.json({
      success: true,
      voiceNoteId: dbResult.rows[0].id,
      transcript: result.transcript,
      structuredData: result.structuredData,
      clientSummary: result.clientSummary,
      tags: result.tags,
      duration: result.duration,
    });

  } catch (error: any) {
    console.error('❌ Transcript processing error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to process transcript'
    });
  }
});

// ============================================================
// 3. GET voice notes for a project
//    GET /voice/project/:projectId
// ============================================================
router.get('/project/:projectId', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const decoded = verifyToken(req);
    if (!decoded?.id) return res.status(401).json({ success: false, message: 'Invalid token' });

    const { projectId } = req.params;
    const result = await pool.query(
      'SELECT * FROM voice_notes WHERE project_id = $1 AND user_id = $2 ORDER BY taken_at DESC',
      [projectId, decoded.id]
    );
    res.json({ success: true, notes: result.rows });
  } catch (error) {
    console.error('❌ Fetch voice notes error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch voice notes' });
  }
});

export default router;