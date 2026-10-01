import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { pool } from '../config/database';
import { verifyToken } from '../utils/auth';

const router = express.Router();
const PDF_DIR = path.join(__dirname, '../../pdfs');

router.get('/:filename', async (req: Request, res: Response) => {
  try {
    const actor = verifyToken(req);
    const filename = String(req.params.filename || '');
    if (path.basename(filename) !== filename || !/^[a-zA-Z0-9._-]+\.pdf$/i.test(filename)) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    const pdfUrl = `/pdfs/${filename}`;
    const access = await pool.query(
      `SELECT ps.id
         FROM pay_stubs ps
         JOIN users employee ON employee.id = ps.employee_id
         JOIN users requester ON requester.id = $2
        WHERE ps.pdf_url = $1
          AND COALESCE(requester.is_active, TRUE) = TRUE
          AND (
            ps.employee_id = requester.id
            OR (
              employee.company_id = requester.company_id
              AND LOWER(COALESCE(requester.role, '')) IN ('boss', 'owner', 'admin', 'manager')
            )
          )
        LIMIT 1`,
      [pdfUrl, actor.id],
    );
    if (!access.rowCount) return res.status(404).json({ success: false, message: 'File not found' });

    const filepath = path.resolve(PDF_DIR, filename);
    if (!filepath.startsWith(`${path.resolve(PDF_DIR)}${path.sep}`) || !fs.existsSync(filepath)) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    res.set('Cache-Control', 'private, no-store');
    return res.download(filepath, filename);
  } catch (error: any) {
    return res.status(401).json({ success: false, message: error.message || 'Authentication is required' });
  }
});

export default router;
