import express from 'express';
import fs from 'fs';
import path from 'path';

const router = express.Router();
const PDF_DIR = path.join(__dirname, '../../pdfs');

router.get('/:filename', (req, res) => {
  const { filename } = req.params;
  const filepath = path.join(PDF_DIR, filename);

  // Security: prevent directory traversal
  if (!filepath.startsWith(PDF_DIR)) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ success: false, message: 'File not found' });
  }

  res.sendFile(filepath);
});

export default router;