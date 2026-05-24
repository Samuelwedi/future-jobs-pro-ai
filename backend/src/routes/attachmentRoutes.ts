import express, { Request, Response } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { saveAttachment, getShiftAttachments, getTimeEntryAttachments, deleteAttachment } from '../services/attachmentService';
import { uploadPhoto } from '../services/cloudStorageService';

const router = express.Router();

const uploadDir = path.join(__dirname, '../../uploads/attachments');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `attachment-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

// POST /api/attachments/upload
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file provided' });

    const { companyId, uploadedBy, shiftId, timeEntryId, projectId } = req.body;

    // Upload to Cloudinary
    const cloudUrl = await uploadPhoto(req.file.path, 'attachments');

    const attachment = await saveAttachment(
      companyId, uploadedBy, req.file.originalname, cloudUrl,
      req.file.mimetype, req.file.size,
      shiftId, timeEntryId, projectId
    );

    // Clean up local file
    fs.unlink(req.file.path, () => {});

    res.json({ success: true, attachment });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/attachments/shift/:shiftId
router.get('/shift/:shiftId', async (req: Request, res: Response) => {
  try {
    const attachments = await getShiftAttachments(req.params.shiftId as string);
    res.json({ success: true, attachments });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/attachments/time-entry/:timeEntryId
router.get('/time-entry/:timeEntryId', async (req: Request, res: Response) => {
  try {
    const attachments = await getTimeEntryAttachments(req.params.timeEntryId as string);
    res.json({ success: true, attachments });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/attachments/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await deleteAttachment(req.params.id as string);
    res.json({ success: true, message: 'Attachment deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;