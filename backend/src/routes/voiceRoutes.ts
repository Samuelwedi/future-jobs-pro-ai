import { verifyToken } from '../utils/auth';
import express, { Request, Response } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { pool } from '../config/database';
import { processVoiceNote } from '../services/voiceService';
import * as fs from 'fs';

const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed!') as any, false);
    }
  }
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

// POST /api/voice/process
router.post('/process', upload.single('audio'), async (req: Request, res: Response) => {
  console.log('\n🎙️  ========== NEW VOICE NOTE ==========');
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No audio file provided' });
    }

    const { userId, projectId, timeEntryId } = req.body;
    if (!userId || !projectId) {
      return res.status(400).json({ success: false, message: 'Missing userId or projectId' });
    }

    // Get company ID
    const companyId = await getCompanyId(req);
    if (!companyId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    // --- DYNAMIC FOLDER PATH ---
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const folderPath = `future-jobs-pro-ai/projects/${projectId}/${year}-${month}/voice-notes`;

    // Upload audio to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(
      `data:audio/m4a;base64,${req.file.buffer.toString('base64')}`,
      {
        folder: folderPath,
        resource_type: 'video', // audio is treated as video
        public_id: `audio_${Date.now()}`,
      }
    );

    const audioUrl = uploadResult.secure_url;
    console.log('🎵 Audio uploaded to Cloudinary:', audioUrl);

    // Process the audio (transcription, etc.)
    const tempFile = `/tmp/voice-${Date.now()}.m4a`;
    fs.writeFileSync(tempFile, req.file.buffer);
    const result = await processVoiceNote(tempFile, userId, projectId, timeEntryId);
    fs.unlinkSync(tempFile);

    // Save to voice_notes table with audio_url and folder_path
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

// GET /api/voice/project/:projectId
router.get('/project/:projectId', async (req, res) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const { projectId } = req.params;
    const result = await pool.query(
      'SELECT * FROM voice_notes WHERE project_id = $1 AND company_id = $2 ORDER BY taken_at DESC',
      [projectId, companyId]
    );
    res.json({ success: true, notes: result.rows });
  } catch (error) {
    console.error('❌ Fetch voice notes error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch voice notes' });
  }
});

export default router;