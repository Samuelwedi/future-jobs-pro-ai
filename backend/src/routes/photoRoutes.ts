import { validEvidenceKey, evidenceFingerprint, claimEvidence } from '../services/evidenceReceipts';
import { buildProjectPhotoExport, MAX_PROJECT_EXPORT_PHOTOS } from '../services/projectPhotoExport';
import type { PoolClient } from 'pg';
import { verifyToken } from '../utils/auth';
import express, { Request, Response } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { pool } from '../config/database';
import { applyWatermark } from '../services/watermarkService';
import { analyzePhotoCompliance, ComplianceCheckResult } from '../services/photoComplianceService';
import { uploadEvidenceFile } from '../services/evidenceUpload';
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

// Stream uploads to bounded temporary files instead of retaining up to 1 GB per video in RAM.
const mediaExtensions: Record<string, string> = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
  'image/heic': '.heic', 'image/heif': '.heif',
  'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/x-m4v': '.m4v',
};
const upload = multer({
  storage: multer.diskStorage({destination: tempDir, filename(req, file, done) {
    const filename = `input-${crypto.randomBytes(16).toString('hex')}${mediaExtensions[file.mimetype] || '.bin'}`;
    (req as any).evidenceUploadPath = path.join(tempDir, filename);
    done(null, filename);
  }}),
  fileFilter(_req, file, done) {
    if (!mediaExtensions[file.mimetype]) return done(new Error('Choose a supported photo or video format'));
    done(null, true);
  },
  limits: { fileSize: 1024 * 1024 * 1024, files: 1, fields: 16, fieldSize: 16384, parts: 18 },
});
let activeUploads = 0;
const MAX_ACTIVE_UPLOADS = 2;
async function receiveUpload(req: Request, res: Response): Promise<void> {
  // Multer 2.5 tears down interrupted streams and removes partial disk files before its callback.
  await new Promise<void>((resolve, reject) => {
    upload.single('file')(req, res, error => error ? reject(error) : resolve());
  });
}

async function actor(req: Request): Promise<{ userId: string; companyId: string; role: string } | null> {
  try {
    const decoded = verifyToken(req);
    const result = await pool.query("SELECT id, company_id, LOWER(COALESCE(role, 'employee')) AS role FROM users WHERE id = $1 AND COALESCE(is_active, TRUE) = TRUE", [decoded.id]);
    if (!result.rowCount || !result.rows[0].company_id) return null;
    return { userId: String(result.rows[0].id), companyId: String(result.rows[0].company_id), role: String(result.rows[0].role || 'employee') };
  } catch { return null; }
}

function removeFile(file: string | undefined) {
  try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch { console.warn('Could not remove an evidence temporary file'); }
}

async function readAuthorizedReceipt(current: {companyId:string;userId:string}, requestKey: string) {
  return pool.query(`SELECT r.state,r.response FROM evidence_upload_receipts r
      JOIN users a ON a.id::text=r.actor_id AND a.company_id::text=r.company_id AND COALESCE(a.is_active,TRUE)=TRUE
      JOIN users u ON u.id::text=r.user_id AND u.company_id::text=r.company_id
      JOIN projects p ON p.id::text=r.project_id AND p.company_id::text=r.company_id
      WHERE r.company_id=$1 AND r.actor_id=$2 AND r.request_key=$3
      AND (r.user_id=$2 OR LOWER(COALESCE(a.role,'employee')) IN ('boss','manager','admin'))
      AND (r.time_entry_id IS NULL OR EXISTS (SELECT 1 FROM time_entries te WHERE te.id::text=r.time_entry_id AND te.user_id::text=r.user_id AND te.project_id::text=r.project_id))`,
      [current.companyId,current.userId,requestKey]);
}

router.post('/upload', async (req: Request, res: Response) => {
  let tempInput: string | undefined;
  let tempOutput: string | undefined;
  let lease = false;
  let receiptScope: string[] | undefined;
  let db: PoolClient | undefined;
  try {
    let current = await actor(req);
    if (!current) return res.status(401).json({ success: false, message: 'Not authenticated' });
    if (activeUploads >= MAX_ACTIVE_UPLOADS) {
      res.setHeader('Retry-After', '10');
      return res.status(503).json({success:false, message:'Evidence uploads are busy. Retry shortly.'});
    }
    activeUploads += 1; lease = true;
    await receiveUpload(req, res);
    tempInput = req.file?.path;
    // Multipart reception may take minutes. Do not reuse pre-upload permissions.
    current = await actor(req);
    if (!current) return res.status(401).json({success:false, message:'Not authenticated'});
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const { userId, projectId, timeEntryId, template, latitude, longitude, weather, address } = req.body;
    if (typeof userId !== 'string' || typeof projectId !== 'string' || !userId || !projectId || (timeEntryId && typeof timeEntryId !== 'string')) return res.status(400).json({ success: false, message: 'Valid userId and projectId are required' });
    if (userId !== current.userId && !['boss','manager','admin'].includes(current.role)) return res.status(403).json({success:false, message:'Manager access is required to attribute evidence to another employee'});
    const ownership = await pool.query(
      `SELECT EXISTS(SELECT 1 FROM users WHERE id = $1 AND company_id = $3) valid_user,
              EXISTS(SELECT 1 FROM projects WHERE id = $2 AND company_id = $3) valid_project`,
      [userId, projectId, current.companyId],
    );
    if (!ownership.rows[0]?.valid_user || !ownership.rows[0]?.valid_project) {
      return res.status(403).json({ success: false, message: 'Employee or project is outside your company' });
    }

    if (timeEntryId) {
      const shift = await pool.query('SELECT te.id FROM time_entries te JOIN users u ON u.id = te.user_id WHERE te.id = $1 AND te.user_id = $2 AND te.project_id = $3 AND u.company_id = $4', [timeEntryId, userId, projectId, current.companyId]);
      if (!shift.rowCount) return res.status(400).json({success:false, message:'The selected shift does not belong to this employee and project'});
    }

    // Receipt semantics are opt-in for older installed clients that omit requestKey.
    // Legacy uploads remain non-idempotent: retries can create duplicate evidence.
    // An explicitly supplied malformed key must never fall back to that legacy path.
    if (Object.prototype.hasOwnProperty.call(req.body, 'requestKey')) {
      if (!validEvidenceKey(req.body.requestKey)) return res.status(400).json({success:false, message:'A valid upload requestKey is required when provided.'});
      const scope = [current.companyId, current.userId, req.body.requestKey];
      const fingerprint = await evidenceFingerprint(tempInput, req.file.mimetype, req.body);
      const previous = await claimEvidence(scope, fingerprint, req.body);
      if (previous) {
        if (previous.fingerprint !== fingerprint) return res.status(409).json({success:false, message:'Upload key was already used for different evidence.'});
        const authorized = await readAuthorizedReceipt(current, req.body.requestKey);
        if (!authorized.rowCount) return res.status(403).json({success:false, message:'Evidence access changed'});
        if (authorized.rows[0].state === 'completed') return res.json(authorized.rows[0].response);
        return res.status(202).json({success:false, state:previous.state, status:previous.state, message:"Upload outcome is pending or uncertain. Check status; do not upload again.", retryAllowed:false, requestKey:req.body.requestKey});
      }
      receiptScope = scope;
    }
    const isVideo = req.file.mimetype.startsWith('video/');
    const extension = isVideo ? '.mp4' : mediaExtensions[req.file.mimetype];
    tempOutput = path.join(tempDir, `watermarked-${crypto.randomBytes(16).toString('hex')}${extension}`);

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
    const uploaded = await uploadEvidenceFile(watermarked.outputPath, folderPath, isVideo);
    const analysis = compliance ? {
      aiAnalyzed: compliance.aiAnalyzed,
      description: compliance.aiDescription,
      image: compliance.metadata,
    } : null;
    db = await pool.connect();
    await db.query('BEGIN');
    // Lock authorization rows through commit so revocation cannot race persistence.
    const liveActor = await db.query('SELECT company_id, role, is_active FROM users WHERE id=$1 FOR SHARE', [current.userId]);
    const live = liveActor.rows[0];
    if (!live || live.is_active === false || String(live.company_id) !== current.companyId ||
        (userId !== current.userId && !['boss','manager','admin'].includes(String(live.role || 'employee').toLowerCase()))) throw new Error('Evidence authorization changed');
    const liveUser = await db.query('SELECT id FROM users WHERE id=$1 AND company_id=$2 FOR SHARE', [userId,current.companyId]);
    const liveProject = await db.query('SELECT id FROM projects WHERE id=$1 AND company_id=$2 FOR SHARE', [projectId,current.companyId]);
    if (!liveUser.rowCount || !liveProject.rowCount) throw new Error('Evidence ownership changed');
    if (timeEntryId) {
      const liveShift = await db.query('SELECT id FROM time_entries WHERE id=$1 AND user_id=$2 AND project_id=$3 FOR SHARE', [timeEntryId,userId,projectId]);
      if (!liveShift.rowCount) throw new Error('Evidence shift changed');
    }
    const result = await db.query(
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
        JSON.stringify({ template, watermarked: watermarked.applied, address, weather, verificationHash: watermarked.verificationHash }),
        isVideo ? 'video' : 'image', watermarked.verificationHash, folderPath,
        compliance?.score ?? null, compliance?.passed ?? null,
        JSON.stringify(compliance?.issues || []), JSON.stringify(compliance?.suggestions || []),
        JSON.stringify(analysis), compliance?.aiModel || null, compliance ? new Date() : null,
        JSON.stringify(compliance?.aiTags || []),
      ],
    );
    const response = {
      requestKey: req.body.requestKey,
      success: true,
      photoId: result.rows[0].id,
      verificationHash: watermarked.verificationHash,
      watermarkApplied: watermarked.applied,
      compliance: compliance || {
        analyzed: false,
        score: null,
        passed: null,
        issues: [],
        suggestions: ['Still-photo compliance scoring does not assign fabricated scores to video files.'],
      },
      fileType: isVideo ? 'video' : 'image',
    };
    if (receiptScope) {
      const completed = await db.query("UPDATE evidence_upload_receipts SET state='completed',response=$4::jsonb WHERE company_id=$1 AND actor_id=$2 AND request_key=$3 AND state='processing' RETURNING request_key", [...receiptScope, JSON.stringify(response)]);
      if (!completed.rowCount) throw new Error('Receipt completion failed');
    }
    await db.query('COMMIT');
    res.json(response);
  } catch (error: any) {
    if (db) { await db.query('ROLLBACK').catch(() => undefined); db.release(); db = undefined; }
    if (receiptScope) await pool.query("UPDATE evidence_upload_receipts SET state='uncertain' WHERE company_id=$1 AND actor_id=$2 AND request_key=$3 AND state='processing'", receiptScope).catch(() => undefined);
    console.error('Photo upload error:', error);
    if (!res.headersSent && !res.destroyed) {
      const invalidUpload = error instanceof multer.MulterError || error.message === 'Choose a supported photo or video format';
      res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : invalidUpload ? 400 : 500).json({ success: false, message: invalidUpload ? error.message : 'Evidence upload could not be completed. Check your saved evidence before retrying.' });
    }
  } finally {
    db?.release();
    removeFile(tempInput || (req as any).evidenceUploadPath);
    removeFile(tempOutput);
    if (lease) activeUploads -= 1;
  }
});

router.get('/upload-status/:requestKey', async (req: Request, res: Response) => {
  try {
    const current = await actor(req);
    if (!current) return res.status(401).json({success:false});
    if (!validEvidenceKey(req.params.requestKey)) return res.status(400).json({success:false});
    const result = await readAuthorizedReceipt(current, String(req.params.requestKey));
    if (!result.rowCount) return res.status(404).json({success:false,code:'EVIDENCE_REQUEST_NOT_FOUND',requestKey:req.params.requestKey});
    const receipt = result.rows[0];
    if (receipt.state === 'completed') return res.json(receipt.response);
    return res.status(202).json({success:false,state:receipt.state,status:receipt.state,message:"Upload outcome is pending or uncertain. Check status; do not upload again.",retryAllowed:false,requestKey:req.params.requestKey});
  } catch { return res.status(503).json({success:false,message:'Upload status unavailable. Do not retry until status can be checked.'}); }
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

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const canFilePhotos = (role: string) => ['boss', 'manager', 'admin'].includes(role);

router.get('/project/:projectId/reference-targets', async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const current = await actor(req);
    if (!current) return res.status(401).json({success:false, message:'Not authenticated'});
    if (!canFilePhotos(current.role) || req.get('X-Project-Actor') !== current.userId ||
        req.get('X-Project-Company') !== current.companyId) {
      return res.status(403).json({success:false, message:'Manager access and the current account are required'});
    }
    const source = String(req.params.projectId).toLowerCase();
    if (!uuid.test(source)) return res.status(404).json({success:false, message:'Project not found'});
    const result = await pool.query(
      `SELECT destination.id, destination.name
       FROM projects source
       JOIN users requester ON requester.id=$3 AND requester.company_id=source.company_id
         AND COALESCE(requester.is_active, TRUE) AND LOWER(requester.role) IN ('boss','manager','admin')
       JOIN projects destination ON destination.company_id=source.company_id
         AND destination.id<>source.id AND destination.archived_at IS NULL
       WHERE source.id=$1 AND source.company_id=$2 ORDER BY destination.name,destination.id LIMIT 1000`,
      [source,current.companyId,current.userId],
    );
    return res.json({success:true, projects:result.rows});
  } catch { return res.status(503).json({success:false, message:'Destination projects are unavailable'}); }
});

router.put('/project/:projectId/photo/:photoId/reference', async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'private, no-store');
  let db: PoolClient | undefined;
  try {
    const current = await actor(req);
    if (!current) return res.status(401).json({success:false, message:'Not authenticated'});
    const projectId = String(req.params.projectId).toLowerCase();
    const photoId = String(req.params.photoId).toLowerCase();
    const expectedSource = typeof req.body?.sourceProjectId==='string' ? req.body.sourceProjectId.toLowerCase() : '';
    if (!uuid.test(projectId) || !uuid.test(photoId)) return res.status(404).json({success:false, message:'Photo or project not found'});
    if (!canFilePhotos(current.role) || req.get('X-Project-Actor') !== current.userId ||
        req.get('X-Project-Company') !== current.companyId) {
      return res.status(403).json({success:false, message:'Manager access and the current account are required'});
    }
    if (!uuid.test(expectedSource)) return res.status(400).json({success:false, message:'Original project is required'});
    db = await pool.connect();
    await db.query('BEGIN');
    const liveActor = (await db.query(
      "SELECT company_id, LOWER(COALESCE(role,'employee')) AS role FROM users WHERE id=$1 AND COALESCE(is_active,TRUE) FOR SHARE",
      [current.userId],
    )).rows[0];
    if (liveActor?.company_id !== current.companyId || !canFilePhotos(liveActor.role)) {
      await db.query('ROLLBACK');
      return res.status(403).json({success:false, message:'Manager access and the current account are required'});
    }
    const stored = (await db.query(
      "SELECT project_id FROM photos WHERE id=$1 AND company_id=$2 AND file_type='image' FOR SHARE",
      [photoId, current.companyId],
    )).rows[0];
    if (!stored?.project_id) {
      await db.query('ROLLBACK');
      return res.status(404).json({success:false, message:'Photo or project not found'});
    }
    if (stored.project_id !== expectedSource) {
      await db.query('ROLLBACK');
      return res.status(409).json({success:false, message:'The original project changed. Refresh the album.'});
    }
    if (stored.project_id === projectId) {
      await db.query('ROLLBACK');
      return res.status(409).json({success:false, message:'This is the original project'});
    }
    const projects = await db.query(
      `SELECT id FROM projects WHERE id=ANY($1::uuid[]) AND company_id=$2
       AND (id<>$3 OR archived_at IS NULL) ORDER BY id FOR SHARE`,
      [[projectId, stored.project_id], current.companyId, projectId],
    );
    if (projects.rowCount !== 2) {
      await db.query('ROLLBACK');
      return res.status(404).json({success:false, message:'Photo or project not found'});
    }
    await db.query(
      `INSERT INTO project_photo_references(company_id, photo_id, source_project_id, project_id, copied_by)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (project_id, photo_id) DO NOTHING`,
      [current.companyId, photoId, stored.project_id, projectId, current.userId],
    );
    // A conflicting stale link must not be reported as a successful copy.
    const row = (await db.query(
      `SELECT id,source_project_id,album_project_id,copied_by,copied_at
       FROM project_photo_inventory WHERE company_id=$1 AND album_project_id=$2 AND id=$3 AND copied_at IS NOT NULL`,
      [current.companyId, projectId, photoId],
    )).rows[0];
    if (!row) {
      await db.query('ROLLBACK');
      return res.status(409).json({success:false, message:'Photo filing has changed; refresh the album'});
    }
    await db.query('COMMIT');
    return res.json({success:true, reference:row});
  } catch {
    if (db) await db.query('ROLLBACK').catch(() => undefined);
    return res.status(503).json({success:false, message:'Photo filing is unavailable. Refresh the album before retrying.'});
  } finally { db?.release(); }
});

router.get('/project/:projectId', async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const current = await actor(req);
    if (!current) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const actorHeader = req.get('X-Project-Actor'), companyHeader = req.get('X-Project-Company');
    if ((actorHeader !== undefined || companyHeader !== undefined) &&
        (actorHeader !== current.userId || companyHeader !== current.companyId)) {
      return res.status(403).json({success:false, message:'Reopen the current project'});
    }
    const projectId = String(req.params.projectId).toLowerCase();
    if (!uuid.test(projectId)) return res.status(404).json({success:false, message:'Project not found'});
    const result = await pool.query(
      `SELECT p.*, i.album_project_id, i.copied_at
       FROM project_photo_inventory i JOIN photos p USING (id, company_id)
       JOIN users requester ON requester.id=$3 AND requester.company_id=i.company_id AND COALESCE(requester.is_active,TRUE)
       WHERE i.album_project_id = $1 AND i.company_id = $2 ORDER BY p.taken_at DESC, p.id`,
      [projectId, current.companyId, current.userId],
    );
    res.json({ success: true, photos: result.rows });
  } catch { res.status(503).json({success:false, message:'Project album is unavailable'}); }
});

let activeProjectPhotoExports = 0;
router.post('/project/:projectId/export', async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'private, no-store');
  let ownsSlot = false;
  try {
    const current = await actor(req);
    if (!current) return res.status(401).json({success:false, message:'Not authenticated'});
    if (!canFilePhotos(current.role) || req.get('X-Project-Actor') !== current.userId ||
        req.get('X-Project-Company') !== current.companyId) {
      return res.status(403).json({success:false, message:'Manager access and the current account are required'});
    }
    const projectId = String(req.params.projectId).toLowerCase();
    const ids = req.body?.photoIds;
    if (!uuid.test(projectId) || !Array.isArray(ids) || !ids.length || ids.length > MAX_PROJECT_EXPORT_PHOTOS ||
        !ids.every(id => typeof id === 'string' && uuid.test(id))) {
      return res.status(400).json({success:false, message:'Select between 1 and 25 project photos'});
    }
    const selectedIds: string[] = [...new Set<string>(ids.map(id => id.toLowerCase()))];
    const readSelection = async () => {
      const result = await pool.query(
        `SELECT p.id, p.user_id, p.s3_key, p.taken_at, p.verification_hash, i.source_project_id,
                src.name AS source_project_name, i.copied_by, i.copied_at, alb.name AS album_name
         FROM project_photo_inventory i JOIN photos p USING(id, company_id)
         JOIN projects src ON src.id=i.source_project_id AND src.company_id=i.company_id
         JOIN projects alb ON alb.id=i.album_project_id AND alb.company_id=i.company_id
         JOIN users requester ON requester.id=$4 AND requester.company_id=i.company_id
           AND COALESCE(requester.is_active,TRUE) AND LOWER(requester.role) IN ('boss','manager','admin')
         WHERE i.company_id=$1 AND i.album_project_id=$2 AND p.id=ANY($3::uuid[]) AND p.file_type='image'
         ORDER BY p.taken_at, p.id`,
        [current.companyId, projectId, selectedIds, current.userId],
      );
      return result.rows;
    };
    const selected = await readSelection();
    if (selected.length !== selectedIds.length) return res.status(404).json({success:false, message:'One or more photos are unavailable in this project'});
    if (activeProjectPhotoExports >= 2) return res.status(429).json({success:false, message:'Photo exports are busy. Try again shortly.'});
    activeProjectPhotoExports += 1; ownsSlot = true;
    const bytes = await buildProjectPhotoExport({id:projectId, name:selected[0].album_name}, selected);
    if (JSON.stringify(await readSelection()) !== JSON.stringify(selected)) {
      return res.status(409).json({success:false, message:'The selection changed. Refresh the album before exporting.'});
    }
    return res.attachment(`project-photos-${projectId}.zip`).type('application/zip').send(bytes);
  } catch {
    return res.status(503).json({success:false, message:'Could not export every selected original photo. No partial file was returned.'});
  } finally { if (ownsSlot) activeProjectPhotoExports -= 1; }
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
