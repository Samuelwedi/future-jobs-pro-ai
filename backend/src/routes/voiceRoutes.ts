import { verifyToken } from '../utils/auth';
import express, { Request, Response } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { pool } from '../config/database';
import { processVoiceNote, processTranscriptOnly, transcribeAudio } from '../services/voiceService';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { join, extname } from 'path';

const router = express.Router();

function audioTempPath(originalName: string): string {
  const extension = extname(originalName).toLowerCase();
  const supported = ['.m4a', '.mp4', '.mp3', '.wav', '.webm', '.ogg', '.flac'];
  return join(tmpdir(), `voice-${randomUUID()}${supported.includes(extension) ? extension : '.m4a'}`);
}

async function authenticatedActor(req: Request): Promise<{ userId: string; companyId: string }> {
  const decoded = verifyToken(req);
  if (!decoded?.id) throw new Error('Not authenticated');
  const result = await pool.query(
    'SELECT id, company_id FROM users WHERE id = $1 AND COALESCE(is_active, TRUE) = TRUE',
    [decoded.id],
  );
  if (!result.rowCount || !result.rows[0].company_id) throw new Error('Not authenticated');
  return { userId: String(result.rows[0].id), companyId: String(result.rows[0].company_id) };
}

async function assertProjectAccess(projectId: string, companyId: string): Promise<void> {
  const project = await pool.query('SELECT id FROM projects WHERE id = $1 AND company_id = $2', [projectId, companyId]);
  if (!project.rowCount) throw new Error('Project not found in your company');
}

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

// Lucy speech is transcription only. It must never create project evidence.
router.post('/assistant-transcribe', upload.single('audio'), async (req: Request, res: Response) => {
  let tempFile = '';
  try {
    await authenticatedActor(req);
    if (!req.file) return res.status(400).json({ success: false, message: 'No audio file provided' });
    tempFile = audioTempPath(req.file.originalname);
    fs.writeFileSync(tempFile, req.file.buffer);
    const transcript = (await transcribeAudio(tempFile)).trim();
    if (!transcript) return res.status(422).json({ success: false, message: 'No speech detected' });
    return res.json({ success: true, transcript });
  } catch (error: any) {
    const unauthorized = error.message === 'Not authenticated';
    console.error('Lucy transcription error:', error.message);
    return res.status(unauthorized ? 401 : 500).json({ success: false, message: unauthorized ? error.message : 'Could not transcribe speech' });
  } finally {
    if (tempFile && fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }
});

// ============================================================
// 1. ORIGINAL ENDPOINT: process an audio file (Whisper fallback)
//    POST /voice/process
// ============================================================
router.post('/process', upload.single('audio'), async (req: Request, res: Response) => {
  let tempFile = '';
  let stage = 'validation';
  const requestId = randomUUID();
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No audio file provided' });
    }

    const actor = await authenticatedActor(req);
    const { projectId, timeEntryId } = req.body;
    if (!projectId) {
      return res.status(400).json({ success: false, message: 'Missing projectId' });
    }
    await assertProjectAccess(String(projectId), actor.companyId);
    if (timeEntryId) {
      const entry = await pool.query('SELECT id FROM time_entries WHERE id = $1 AND user_id = $2 AND project_id = $3', [timeEntryId, actor.userId, projectId]);
      if (!entry.rowCount) return res.status(400).json({ success: false, message: 'The selected shift does not belong to this user and project.' });
    }
    if (!process.env.OPENAI_API_KEY || /^your[-_]/i.test(process.env.OPENAI_API_KEY) ||
        !process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return res.status(503).json({ success: false, message: 'Voice processing is not configured on the server. Contact support; your recording can be retried.' });
    }

    // Upload audio to Cloudinary
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const folderPath = `future-jobs-pro-ai/projects/${projectId}/${year}-${month}/voice-notes`;

    stage = 'audio upload';
    const uploadResult = await cloudinary.uploader.upload(
      `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`,
      {
        folder: folderPath,
        resource_type: 'video',
        public_id: `audio_${requestId}`,
      }
    );

    const audioUrl = uploadResult.secure_url;

    stage = 'transcription';
    tempFile = audioTempPath(req.file.originalname);
    fs.writeFileSync(tempFile, req.file.buffer);
    const result = await processVoiceNote(tempFile, actor.userId, projectId, timeEntryId);

    // Insert into voice_notes with company_id and audio_url
    const query = `
      INSERT INTO voice_notes
      (company_id, user_id, project_id, time_entry_id, audio_url, transcript, duration_seconds, taken_at, folder_path, metadata, structured_data, client_summary)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, $10, $11)
      RETURNING id
    `;
    const values = [
      actor.companyId,
      actor.userId,
      projectId,
      timeEntryId || null,
      audioUrl,
      result.transcript,
      result.duration,
      folderPath,
      JSON.stringify({ structured: result.structuredData, tags: result.tags }),
      JSON.stringify(result.structuredData),
      result.clientSummary,
    ];
    stage = 'database save';
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
    console.error('Voice processing failed', { requestId, stage, code: error.code, message: error.message });
    const status = error.message === 'Not authenticated' ? 401 : error.message === 'Project not found in your company' ? 404 : 500;
    res.status(status).json({ success: false, requestId, message: status !== 500 ? error.message : `Voice processing failed during ${stage}. Please retry your saved recording or contact support with reference ${requestId}.` });
  } finally {
    if (tempFile) await fs.promises.unlink(tempFile).catch(() => {});
  }
});

// ============================================================
// 2. NEW ENDPOINT: process a transcript (Deepgram streaming)
//    POST /voice/process-transcript
// ============================================================
router.post('/process-transcript', async (req: Request, res: Response) => {
  try {
    const actor = await authenticatedActor(req);
    const { projectId, timeEntryId, transcript } = req.body;

    // Validate required fields
    if (!projectId || !transcript) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: projectId, transcript'
      });
    }
    await assertProjectAccess(String(projectId), actor.companyId);

    // Process the transcript (extract structured data, generate summary, tags)
    const result = await processTranscriptOnly(transcript, actor.userId, projectId, timeEntryId);

    // Insert into voice_notes with company_id (no audio_url – set to NULL)
    const query = `
      INSERT INTO voice_notes
      (company_id, user_id, project_id, time_entry_id, audio_url, transcript, duration_seconds, taken_at, folder_path, metadata)
      VALUES ($1, $2, $3, $4, NULL, $5, $6, NOW(), NULL, $7)
      RETURNING id
    `;
    const values = [
      actor.companyId,
      actor.userId,
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
