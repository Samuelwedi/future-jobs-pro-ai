// ============================================
// DISPUTE EVIDENCE ROUTES
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import express, { Request, Response } from 'express';
import {
  buildDisputeEvidencePackage,
  generateDisputePDF,
  checkHighRiskEntries
} from '../services/disputeService';

const router = express.Router();

// POST /api/dispute/build/:timeEntryId – Build an evidence package
router.post('/build/:timeEntryId', async (req: Request, res: Response) => {
  try {
    const pkg = await buildDisputeEvidencePackage(req.params.timeEntryId as string);
    res.json({
      success: true,
      packageId: pkg.packageId,
      riskScore: pkg.riskScore,
      verificationHash: pkg.verificationHash,
      evidence: {
        timeCard: pkg.evidence.timeCard,
        gpsPoints: pkg.evidence.gpsTrail.totalPoints,
        photoCount: pkg.evidence.photos.length,
        voiceNoteCount: pkg.evidence.voiceNotes.length,
      },
      message: pkg.riskScore >= 65
        ? '⚠️ High risk – evidence package ready for review'
        : '✅ Evidence package built successfully',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to build evidence package' });
  }
});

// GET /api/dispute/pdf/:packageId – Generate a PDF report
router.get('/pdf/:packageId', async (req: Request, res: Response) => {
  try {
    const pdfUrl = await generateDisputePDF(req.params.packageId as string);
    res.json({ success: true, pdfUrl });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to generate PDF' });
  }
});

// GET /api/dispute/high-risk/:companyId – Get high‑risk entries
router.get('/high-risk/:companyId', async (req: Request, res: Response) => {
  try {
    const entries = await checkHighRiskEntries(req.params.companyId as string);
    res.json({ success: true, count: entries.length, entries });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch high‑risk entries' });
  }
});

export default router;