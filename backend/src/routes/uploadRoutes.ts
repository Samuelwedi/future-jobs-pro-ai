import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { pool } from '../config/database';
import { verifyToken } from '../utils/auth';

const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

type UploadActor = { id: string; companyId: string };
const getUploadActor = async (req: Request): Promise<UploadActor | null> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = verifyToken(req);
    const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1 AND COALESCE(is_active, TRUE) = TRUE', [decoded.id]);
    // Token may expire while the database query is pending.
    if (verifyToken(req).id !== decoded.id) return null;
    const companyId = userRes.rows[0]?.company_id;
    return companyId ? { id: decoded.id, companyId } : null;
  } catch {
    return null;
  }
};

const admitUpload = async (req: Request, res: Response, next: NextFunction) => {
  const actor = await getUploadActor(req);
  if (!actor || !tokenStillMatches(req, actor)) return res.status(401).json({ success: false, message: 'Not authenticated' });
  res.locals.uploadActor = actor;
  next();
};

const sameActor = (a: UploadActor | null, b: UploadActor): boolean =>
  !!a && a.id === b.id && a.companyId === b.companyId;

const tokenStillMatches = (req: Request, actor: UploadActor): boolean => {
  try { return verifyToken(req).id === actor.id; } catch { return false; }
};

// POST /api/upload – generic file upload for attachments
router.post('/', admitUpload, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const admitted = res.locals.uploadActor as UploadActor;
    if (!sameActor(await getUploadActor(req), admitted) || !tokenStillMatches(req, admitted)) {
      return res.status(403).json({ success: false, message: 'Access unavailable' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const { purpose } = req.body;
    const folder = `future-jobs-pro-ai/attachments/${purpose || 'general'}/${Date.now()}`;
    const uploadResult = await cloudinary.uploader.upload(
      `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`,
      {
        folder: folder,
        resource_type: 'auto',
        public_id: `${Date.now()}_${req.file.originalname}`,
      }
    );

    // A completed provider upload is not a reason to disclose its URL after
    // token expiry, deactivation or company transfer. Do not retry/delete an upload
    // with an uncertain outcome here.
    if (!sameActor(await getUploadActor(req), admitted) || !tokenStillMatches(req, admitted)) {
      return res.status(403).json({ success: false, message: 'Access unavailable' });
    }

    res.json({
      success: true,
      url: uploadResult.secure_url,
      type: req.file.mimetype,
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
