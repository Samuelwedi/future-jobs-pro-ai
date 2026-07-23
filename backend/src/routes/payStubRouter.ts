import express, { Request, Response } from 'express';
import { pool } from '../config/database';
import { verifyToken } from '../utils/auth';
import { getPayStubsByEmployee } from '../services/payStubGenerator';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// ─── Helper to get current user from token ──────────────────────
const getUserId = (req: Request): string | null => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = verifyToken(req);
    return decoded.id || null;
  } catch { return null; }
};

// ─── GET /api/pay-stubs ──────────────────────────────────────────
// Returns pay stubs for the logged-in employee
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const stubs = await getPayStubsByEmployee(userId);
    res.json({ success: true, payStubs: stubs });
  } catch (error: any) {
    console.error('Error fetching pay stubs:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── GET /api/pay-stubs/:id/download ─────────────────────────────
// Downloads the PDF file for a pay stub
router.get('/:id/download', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { id } = req.params;
    // Verify the pay stub belongs to this user
    const result = await pool.query(
      'SELECT pdf_url FROM pay_stubs WHERE id = $1 AND employee_id = $2',
      [id, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Pay stub not found' });
    }
    const pdfUrl = result.rows[0].pdf_url;
    // pdf_url is something like /pdfs/filename.pdf
    // We need to map to actual file path
    const filePath = path.join(__dirname, '../../pdfs', path.basename(pdfUrl));
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }
    res.sendFile(filePath);
  } catch (error: any) {
    console.error('Error downloading pay stub:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;