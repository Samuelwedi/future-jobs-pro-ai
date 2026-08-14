import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { verifyToken } from '../utils/auth';
import { pool } from '../config/database';
import { deleteAttachment, listAttachments, saveAttachment, AttachmentTarget } from '../services/attachmentService';
import { uploadAttachment } from '../services/cloudStorageService';

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
  const result = await pool.query('SELECT id, company_id, role FROM users WHERE id = $1', [decoded.id]);
  if (!result.rowCount || !result.rows[0].company_id) throw new Error('Not authenticated');
  return { id: String(result.rows[0].id), companyId: String(result.rows[0].company_id) };
}
function target(source: any): AttachmentTarget { return { shiftId: source.shiftId, timeEntryId: source.timeEntryId, projectId: source.projectId, taskId: source.taskId, subjectUserId: source.subjectUserId }; }
async function validateTarget(companyId: string, value: AttachmentTarget) {
  const checks: Array<[string, string | undefined]> = [['projects',value.projectId], ['tasks',value.taskId], ['users',value.subjectUserId]];
  for (const [table, id] of checks) if (id) {
    const result = await pool.query(`SELECT id FROM ${table} WHERE id=$1 AND company_id=$2`, [id, companyId]);
    if (!result.rowCount) throw new Error('Attachment target was not found in your company');
  }
  if (value.timeEntryId) {
    const result = await pool.query('SELECT te.id FROM time_entries te JOIN users u ON u.id=te.user_id WHERE te.id=$1 AND u.company_id=$2', [value.timeEntryId, companyId]);
    if (!result.rowCount) throw new Error('Time entry was not found in your company');
  }
  if (value.shiftId) {
    const result = await pool.query('SELECT s.id FROM shifts s JOIN projects p ON p.id=s.project_id WHERE s.id=$1 AND p.company_id=$2', [value.shiftId, companyId]);
    if (!result.rowCount) throw new Error('Shift was not found in your company');
  }
}
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  const localPath = req.file?.path;
  try {
    const current = await actor(req);
    if (!req.file) return res.status(400).json({ success: false, message: 'Choose a supported file up to 100 MB' });
    const attachmentTarget = target(req.body);
    if (!Object.values(attachmentTarget).some(Boolean)) return res.status(400).json({ success: false, message: 'Choose an attachment target' });
    await validateTarget(current.companyId, attachmentTarget);
    const url = await uploadAttachment(req.file.path, `future-jobs-pro-ai/${current.companyId}/attachments`);
    const attachment = await saveAttachment(current.companyId, current.id, req.file.originalname, url, req.file.mimetype, req.file.size, attachmentTarget, String(req.body.category || 'general'));
    res.status(201).json({ success: true, attachment });
  } catch (error: any) { res.status(/authenticated/i.test(error.message) ? 401 : 400).json({ success: false, message: error.message }); }
  finally { if (localPath) fs.unlink(localPath, () => undefined); }
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
