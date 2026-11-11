import { verifyToken } from '../utils/auth';
import express, { Request, Response } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { pool } from '../config/database';
import { editVoiceTranscript, readVoiceTranscript, TranscriptEditError } from '../services/voiceTranscriptService';
import { processVoiceNote, processTranscriptOnly, transcribeAudio } from '../services/voiceService';
import { validVoiceKey, voiceFingerprint, beginVoiceReceipt, completeVoiceReceipt,
  markVoiceReceiptUncertain, readVoiceReceipt, VoiceReceiptError, VoiceReceiptClaim } from '../services/voiceReceipts';
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
  let decoded;
  try { decoded = verifyToken(req); } catch { throw new Error('Not authenticated'); }
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
  let receiptClaim: VoiceReceiptClaim | undefined;
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No audio file provided' });
    }

    const actor = await authenticatedActor(req);
    const { projectId, timeEntryId } = req.body;
    if (req.body.requestKey !== undefined &&
        (typeof projectId !== 'string' || (timeEntryId !== undefined && timeEntryId !== null && typeof timeEntryId !== 'string'))) {
      return res.status(400).json({ success: false, retryAllowed: false, message: 'Invalid project or shift' });
    }
    if (!projectId) {
      return res.status(400).json({ success: false, message: 'Missing projectId' });
    }
    await assertProjectAccess(String(projectId), actor.companyId);
    if (timeEntryId) {
      const entry = await pool.query('SELECT id FROM time_entries WHERE id = $1 AND user_id = $2 AND project_id = $3', [timeEntryId, actor.userId, projectId]);
      if (!entry.rowCount) return res.status(400).json({ success: false, message: 'The selected shift does not belong to this user and project.' });
    }
    // Missing flag preserves existing clients and offline queue entries. Reject malformed
    // flags rather than accidentally sending an audio-only note to a model.
    const mode = req.body.transcribe;
    if (mode !== undefined && ![true, false, 'true', 'false'].includes(mode)) {
      return res.status(400).json({ success: false, message: 'transcribe must be true or false' });
    }
    const transcribe = mode !== false && mode !== 'false';
    const checkConfiguration = () => {
      if ((transcribe && (!process.env.OPENAI_API_KEY || /^your[-_]/i.test(process.env.OPENAI_API_KEY))) ||
          !process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
        throw new VoiceReceiptError(503, 'Voice processing is not configured on the server. Contact support; your recording can be retried.');
      }
    };
    if (req.body.requestKey !== undefined) {
      if (!validVoiceKey(req.body.requestKey)) return res.status(400).json({ success: false, retryAllowed: false, message: 'A valid stable voice request key is required' });
      const claim: VoiceReceiptClaim = { actor, requestKey: req.body.requestKey,
        target: { projectId, timeEntryId: timeEntryId || null, mode: transcribe ? 'audio-transcribed' : 'audio-only' } };
      const previous = await beginVoiceReceipt(claim, voiceFingerprint(req.file.buffer, claim.target, req.file.originalname, req.file.mimetype), checkConfiguration);
      if (previous) return res.status(previous.status).json(previous.body);
      receiptClaim = claim;
    } else {
      try { checkConfiguration(); }
      catch (error: any) { return res.status(503).json({ success: false, message: error.message }); }
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

    // Audio-only bypasses the entire AI service (including adaptive events).
    // Duration comes from the media provider, never file size or invented hours.
    let result;
    if (transcribe) {
      stage = 'transcription';
      tempFile = audioTempPath(req.file.originalname);
      fs.writeFileSync(tempFile, req.file.buffer);
      result = await processVoiceNote(tempFile, actor.userId, projectId, timeEntryId);
    } else {
      result = { transcript: null, structuredData: null, clientSummary: null, tags: [],
        duration: Number.isFinite(uploadResult.duration) && uploadResult.duration >= 0 ? Math.round(uploadResult.duration) : null };
    }

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
      JSON.stringify({ structured: result.structuredData, tags: result.tags, transcriptionStatus: transcribe ? 'completed' : 'skipped' }),
      result.structuredData === null ? null : JSON.stringify(result.structuredData),
      result.clientSummary,
    ];
    stage = 'database save';
    const save = async (db: Pick<typeof pool, 'query'>) => {
      const dbResult = await db.query(query, values);
      return {
        success: true, voiceNoteId: dbResult.rows[0].id,
        transcriptionStatus: transcribe ? 'completed' : 'skipped', audioUrl,
        transcript: result.transcript, structuredData: result.structuredData,
        clientSummary: result.clientSummary, tags: result.tags, duration: result.duration,
      };
    };
    res.json(receiptClaim ? await completeVoiceReceipt(receiptClaim, save) : await save(pool));

  } catch (error: any) {
    console.error('Voice processing failed', { requestId, stage, code: error.code, message: error.message });
    if (receiptClaim) await markVoiceReceiptUncertain(receiptClaim).catch(() => undefined);
    if (validVoiceKey(req.body?.requestKey)) {
      const status = receiptClaim ? 500 : error instanceof VoiceReceiptError ? error.status : error.message === 'Not authenticated' ? 401 : error.message === 'Project not found in your company' ? 404 : 500;
      return res.status(status).json({ success: false, requestId, requestKey: req.body.requestKey,
        ...(status === 500 ? { state: 'uncertain' } : {}), retryAllowed: false,
        message: status === 500 ? 'Voice outcome is uncertain. Check status; do not submit again.' : status === 503 ? 'Voice processing is not configured on the server. Contact support.' : error.message });
    }
    const status = error instanceof VoiceReceiptError ? error.status : error.message === 'Not authenticated' ? 401 : error.message === 'Project not found in your company' ? 404 : 500;
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
  let receiptClaim: VoiceReceiptClaim | undefined;
  try {
    const actor = await authenticatedActor(req);
    const { projectId, timeEntryId, transcript } = req.body;

    // Validate required fields
    if (typeof projectId !== 'string' || !projectId || typeof transcript !== 'string' || !transcript.trim() || transcript.length > 50000) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: projectId, transcript'
      });
    }
    if (req.body.requestKey !== undefined && timeEntryId !== undefined && timeEntryId !== null && typeof timeEntryId !== 'string') {
      return res.status(400).json({ success: false, retryAllowed: false, message: 'Invalid shift' });
    }
    await assertProjectAccess(String(projectId), actor.companyId);

    if (timeEntryId) {
      const entry = await pool.query('SELECT id FROM time_entries WHERE id = $1 AND user_id = $2 AND project_id = $3', [timeEntryId, actor.userId, projectId]);
      if (!entry.rowCount) return res.status(400).json({ success: false, message: 'The selected shift does not belong to this user and project.' });
    }

    if (req.body.requestKey !== undefined) {
      if (!validVoiceKey(req.body.requestKey)) return res.status(400).json({ success: false, retryAllowed: false, message: 'A valid stable voice request key is required' });
      const claim: VoiceReceiptClaim = { actor, requestKey: req.body.requestKey,
        target: { projectId, timeEntryId: timeEntryId || null, mode: 'transcript' } };
      const previous = await beginVoiceReceipt(claim, voiceFingerprint(transcript, claim.target));
      if (previous) return res.status(previous.status).json(previous.body);
      receiptClaim = claim;
    }
    // Receipt admission precedes all model and adaptive-event work.
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
    const save = async (db: Pick<typeof pool, 'query'>) => {
      const dbResult = await db.query(query, values);
      return { success: true, voiceNoteId: dbResult.rows[0].id,
        transcript: result.transcript, structuredData: result.structuredData,
        clientSummary: result.clientSummary, tags: result.tags, duration: result.duration };
    };
    res.json(receiptClaim ? await completeVoiceReceipt(receiptClaim, save) : await save(pool));

  } catch (error: any) {
    console.error('Transcript processing failed:', error.message);
    if (receiptClaim) await markVoiceReceiptUncertain(receiptClaim).catch(() => undefined);
    const status = receiptClaim ? 500 : error instanceof VoiceReceiptError ? error.status : error.message === 'Not authenticated' ? 401 : error.message === 'Project not found in your company' ? 404 : 500;
    if (validVoiceKey(req.body?.requestKey)) return res.status(status).json({ success: false,
      requestKey: req.body.requestKey, ...(status === 500 ? { state: 'uncertain' } : {}), retryAllowed: false,
      message: status === 500 ? 'Voice outcome is uncertain. Check status; do not submit again.' : error.message });
    res.status(status).json({ success: false, message: status === 500 ? 'Failed to process transcript' : error.message });
  }
});

// Receipt status is actor/company scoped and revalidates project + owned shift.
// Missing and stale processing claims are never permission to start another job.
router.get('/requests/:requestKey', async (req: Request, res: Response) => {
  try {
    const actor = await authenticatedActor(req), key = req.params.requestKey;
    if (!validVoiceKey(key)) return res.status(400).json({ success: false, retryAllowed: false, message: 'Invalid voice request key' });
    const result = await readVoiceReceipt(actor, key);
    return res.status(result.status).json(result.body);
  } catch (error: any) {
    const status = error instanceof VoiceReceiptError ? error.status : error.message === 'Not authenticated' ? 401 : 500;
    return res.status(status).json({ success: false, retryAllowed: false, message: 'Voice status is unavailable' });
  }
});

// Fetch only the current baseline after an optimistic edit conflict.
router.get('/:id/transcript', async (req: Request, res: Response) => {
  let userId: string;
  try {
    const decoded = verifyToken(req);
    if (!decoded?.id) throw new Error('Not authenticated');
    userId = decoded.id;
  } catch {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }
  const noteId = String(req.params.id);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(noteId)) {
    return res.status(400).json({ success: false, message: 'A valid note id is required.' });
  }
  try {
    return res.json(await readVoiceTranscript(userId, noteId));
  } catch (error) {
    if (error instanceof TranscriptEditError) return res.status(error.status).json({ success: false, message: error.message });
    console.error('Transcript read failed:', error instanceof Error ? error.message : 'Unknown error');
    return res.status(500).json({ success: false, message: 'Could not load transcript. Please retry.' });
  }
});

// Edit saved text only: no transcription, summary generation, uploads or shift writes.
router.patch('/:id/transcript', async (req: Request, res: Response) => {
  let userId: string;
  try {
    const decoded = verifyToken(req);
    if (!decoded?.id) throw new Error('Not authenticated');
    userId = decoded.id;
  } catch {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }
  const { transcript, expectedTranscript } = req.body || {};
  const noteId = String(req.params.id);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(noteId) ||
      typeof transcript !== 'string' || !transcript.trim() || transcript.trim().length > 50000 ||
      typeof expectedTranscript !== 'string') {
    return res.status(400).json({ success: false, message: 'A valid note id, nonempty transcript (up to 50000 characters), and expectedTranscript are required.' });
  }
  try {
    return res.json(await editVoiceTranscript(userId, noteId, transcript.trim(), expectedTranscript));
  } catch (error) {
    if (error instanceof TranscriptEditError) return res.status(error.status).json({ success: false, message: error.message });
    console.error('Transcript edit failed:', error instanceof Error ? error.message : 'Unknown error');
    return res.status(500).json({ success: false, message: 'Could not save transcript. Please retry.' });
  }
});

// ============================================================
// 3. GET voice notes for a project
//    GET /voice/project/:projectId
// ============================================================
router.get('/project/:projectId', async (req: Request, res: Response) => {
  try {
    const actor = await authenticatedActor(req);
    const projectId = String(req.params.projectId);
    await assertProjectAccess(projectId, actor.companyId);
    const result = await pool.query(
      'SELECT * FROM voice_notes WHERE project_id = $1 AND user_id = $2 AND company_id = $3 ORDER BY taken_at DESC',
      [projectId, actor.userId, actor.companyId]
    );
    res.json({ success: true, notes: result.rows });
  } catch (error: any) {
    console.error('❌ Fetch voice notes error:', error);
    const status = error.message === 'Not authenticated' ? 401 : error.message === 'Project not found in your company' ? 404 : 500;
    res.status(status).json({ success: false, message: status === 500 ? 'Failed to fetch voice notes' : error.message });
  }
});

export default router;
