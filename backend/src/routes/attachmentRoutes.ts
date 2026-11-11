import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { verifyToken } from '../utils/auth';
import { pool } from '../config/database';
import { deleteAttachment, listAttachments, saveAttachment, AttachmentTarget } from '../services/attachmentService';
import { uploadAttachment } from '../services/cloudStorageService';
import { validAttachmentKey, attachmentFingerprint, claimAttachment } from '../services/attachmentReceipts';
import type { PoolClient } from 'pg';

const router = express.Router();
const uploadDir = path.join(__dirname, '../../uploads/attachments');
fs.mkdirSync(uploadDir, { recursive: true });
const allowed = new Set(['.pdf','.doc','.docx','.xls','.xlsx','.csv','.txt','.rtf','.png','.jpg','.jpeg','.webp','.mp3','.m4a','.wav','.mp4','.mov','.webm']);
const upload = multer({
  storage: multer.diskStorage({ destination: (_req, _file, cb) => cb(null, uploadDir), filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}${path.extname(file.originalname).toLowerCase()}`) }),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, allowed.has(path.extname(file.originalname).toLowerCase())),
});
async function actor(req: Request) {
  const decoded = verifyToken(req);
  const result = await pool.query('SELECT id, company_id, role FROM users WHERE id = $1 AND COALESCE(is_active,TRUE)=TRUE', [decoded.id]);
  if (!result.rowCount || !result.rows[0].company_id) throw new Error('Not authenticated');
  return { id: String(result.rows[0].id), companyId: String(result.rows[0].company_id) };
}
function target(source: any): AttachmentTarget { return { shiftId: source.shiftId, timeEntryId: source.timeEntryId, projectId: source.projectId, taskId: source.taskId, subjectUserId: source.subjectUserId }; }
async function validateTarget(companyId: string, value: AttachmentTarget, db: Pick<PoolClient, 'query'> = pool, lock = false) {
  const checks: Array<[string, string | undefined]> = [['projects',value.projectId], ['tasks',value.taskId], ['users',value.subjectUserId]];
  for (const [table, id] of checks) if (id) {
    const result = await db.query(`SELECT id FROM ${table} WHERE id=$1 AND company_id=$2${lock ? ' FOR SHARE' : ''}`, [id, companyId]);
    if (!result.rowCount) throw new Error('Attachment target was not found in your company');
  }
  if (value.timeEntryId) {
    const result = await db.query(`SELECT te.id FROM time_entries te JOIN users u ON u.id=te.user_id WHERE te.id=$1 AND u.company_id=$2${lock ? ' FOR SHARE OF te,u' : ''}`, [value.timeEntryId, companyId]);
    if (!result.rowCount) throw new Error('Time entry was not found in your company');
  }
  if (value.shiftId) {
    const sql = `SELECT s.id,s.project_id,s.created_by FROM shifts s LEFT JOIN projects p ON p.id=s.project_id LEFT JOIN users creator ON creator.id=s.created_by WHERE s.id=$1 AND (p.company_id=$2 OR creator.company_id=$2)`;
    const result = await db.query(sql + (lock ? ' FOR SHARE OF s' : ''), [value.shiftId, companyId]);
    if (!result.rowCount) throw new Error('Shift was not found in your company');
    if (lock) {
      const shift = result.rows[0];
      if (shift.project_id) await db.query('SELECT id FROM projects WHERE id=$1 FOR SHARE', [shift.project_id]);
      if (shift.created_by) await db.query('SELECT id FROM users WHERE id=$1 FOR SHARE', [shift.created_by]);
      if (!(await db.query(sql, [value.shiftId, companyId])).rowCount) throw new Error('Shift ownership changed');
    }
  }
}
// Reject unauthenticated/inactive accounts before accepting multipart bytes to disk.
async function authenticateUpload(req: Request, res: Response, next: NextFunction) {
  try { res.locals.attachmentUploadActor = await actor(req); next(); }
  catch { res.status(401).json({ success: false, message: 'Not authenticated' }); }
}
router.post('/upload', authenticateUpload, upload.single('file'), async (req: Request, res: Response) => {
  const localPath = req.file?.path;
  let receiptScope: string[] | undefined;
  let db: PoolClient | undefined;
  try {
    const current = await actor(req);
    const admitted = res.locals.attachmentUploadActor;
    if (!admitted || current.id !== admitted.id || current.companyId !== admitted.companyId) {
      return res.status(401).json({ success: false, message: 'Account changed during attachment upload' });
    }
    if (!req.file) return res.status(400).json({ success: false, message: 'Choose a supported file up to 100 MB' });
    const attachmentTarget = target(req.body);
    if (!Object.values(attachmentTarget).some(Boolean)) return res.status(400).json({ success: false, message: 'Choose an attachment target' });
    await validateTarget(current.companyId, attachmentTarget);
    // Multipart filename headers may be decoded as Latin-1. New receipt clients also
    // send the exact display name as a UTF-8 form field; keep it bound to the receipt.
    const originalFileName = req.body.requestKey !== undefined && req.body.originalFileName !== undefined
      ? req.body.originalFileName : req.file.originalname;
    if (typeof originalFileName !== 'string' || !originalFileName || originalFileName.length > 255
      || /[\\/\x00-\x1f\x7f]/.test(originalFileName) || !allowed.has(path.extname(originalFileName).toLowerCase())) {
      return res.status(400).json({ success: false, message: 'Invalid attachment filename' });
    }
    const category = String(req.body.category || 'general');
    if (req.body.requestKey !== undefined) {
      if (!validAttachmentKey(req.body.requestKey)) return res.status(400).json({ success: false, message: 'A valid stable attachment request key is required' });
      const scope = [current.companyId, current.id, req.body.requestKey];
      const fingerprint = await attachmentFingerprint(req.file.path, originalFileName, req.file.mimetype, attachmentTarget, category);
      const previous = await claimAttachment(scope, fingerprint, attachmentTarget);
      if (previous) {
        if (previous.fingerprint !== fingerprint) return res.status(409).json({ success: false, requestKey: req.body.requestKey, retryAllowed: false, message: 'Attachment key was already used for different content or metadata' });
        return await respondReceipt(res, current, req.body.requestKey, previous);
      }
      receiptScope = scope;
    }
    if (receiptScope) {
      const latest = await actor(req);
      if (latest.id !== current.id || latest.companyId !== current.companyId) throw new Error('Attachment authorization changed');
      await validateTarget(current.companyId, attachmentTarget);
    }
    const url = await uploadAttachment(req.file.path, `future-jobs-pro-ai/${current.companyId}/attachments`);
    if (receiptScope) {
      db = await pool.connect();
      await db.query('BEGIN');
      const live = await db.query('SELECT id FROM users WHERE id=$1 AND company_id=$2 AND COALESCE(is_active,TRUE)=TRUE FOR SHARE', [current.id, current.companyId]);
      if (!live.rowCount) throw new Error('Attachment authorization changed');
      await validateTarget(current.companyId, attachmentTarget, db, true);
    }
    const attachment = await saveAttachment(current.companyId, current.id, originalFileName, url, req.file.mimetype, req.file.size, attachmentTarget, category, db || pool);
    const response = { success: true, attachment, ...(receiptScope ? { requestKey: receiptScope[2] } : {}) };
    if (db && receiptScope) {
      const completed = await db.query("UPDATE attachment_upload_receipts SET state='completed',response=$4::jsonb WHERE company_id=$1 AND actor_id=$2 AND request_key=$3 AND state='processing' RETURNING request_key", [...receiptScope, JSON.stringify(response)]);
      if (!completed.rowCount) throw new Error('Attachment receipt completion failed');
      await db.query('COMMIT');
    }
    res.status(201).json(response);
  } catch (error: any) {
    if (db) { await db.query('ROLLBACK').catch(() => undefined); db.release(); db = undefined; }
    if (receiptScope) {
      await pool.query("UPDATE attachment_upload_receipts SET state='uncertain' WHERE company_id=$1 AND actor_id=$2 AND request_key=$3 AND state='processing'", receiptScope).catch(() => undefined);
      return res.status(500).json({ success: false, requestKey: receiptScope[2], state: 'uncertain', retryAllowed: false, message: 'Attachment outcome is uncertain. Check status; do not upload again.' });
    }
    res.status(/authenticated/i.test(error.message) ? 401 : 400).json({ success: false, message: error.message });
  } finally { db?.release(); if (localPath) fs.unlink(localPath, () => undefined); }
});
async function respondReceipt(res: Response, current: { id: string; companyId: string }, requestKey: string, receipt: any) {
  // Never disclose an old receipt after its actor or targets leave the original company.
  const live = await pool.query('SELECT id FROM users WHERE id=$1 AND company_id=$2 AND COALESCE(is_active,TRUE)=TRUE', [current.id,current.companyId]);
  if (!live.rowCount) throw new Error('Not authenticated');
  await validateTarget(current.companyId, receipt.target);
  if (receipt.state === 'completed') {
    const existing = await pool.query('SELECT id FROM attachments WHERE id=$1 AND company_id=$2', [receipt.response?.attachment?.id, current.companyId]);
    if (!existing.rowCount) return res.status(410).json({ success: false, requestKey, state: 'unavailable', retryAllowed: false, message: 'The completed attachment is no longer available' });
    return res.json(receipt.response);
  }
  return res.status(202).json({ success: false, requestKey, state: receipt.state, retryAllowed: false, message: 'Attachment is processing or uncertain. Check status; do not upload again.' });
}
router.get('/uploads/:requestKey', async (req: Request, res: Response) => {
  try {
    const current = await actor(req), key = req.params.requestKey;
    if (!validAttachmentKey(key)) return res.status(400).json({ success: false, message: 'Invalid attachment request key' });
    const receipt = await pool.query('SELECT state,response,target FROM attachment_upload_receipts WHERE company_id=$1 AND actor_id=$2 AND request_key=$3', [current.companyId,current.id,key]);
    if (!receipt.rowCount) return res.status(404).json({ success: false, requestKey: key, state: 'missing', retryAllowed: false });
    return await respondReceipt(res, current, key, receipt.rows[0]);
  } catch (error: any) { res.status(/authenticated|token/i.test(error.message) ? 401 : 403).json({ success: false, retryAllowed: false, message: 'Attachment status is unavailable' }); }
});
router.get('/', async (req: Request, res: Response) => {
  try { const current = await actor(req); const value = target(req.query); await validateTarget(current.companyId, value); res.json({ success: true, attachments: await listAttachments(current.companyId, value) }); }
  catch (error: any) { res.status(400).json({ success: false, message: error.message }); }
});
router.delete('/:id', async (req: Request, res: Response) => {
  try { const current = await actor(req); await deleteAttachment(current.companyId, String(req.params.id)); res.json({ success: true }); }
  catch (error: any) { res.status(404).json({ success: false, message: error.message }); }
});
export default router;
