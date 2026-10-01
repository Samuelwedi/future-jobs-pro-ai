// ============================================
// DISPUTE EVIDENCE ROUTES
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import express, { Request, Response } from 'express';
import { pool } from '../config/database';
import { companyActor, manages } from '../middleware/companyActor';
import {
  buildDisputeEvidencePackage,
  generateDisputePDF,
  checkHighRiskEntries
} from '../services/disputeService';

const router = express.Router();
router.use(companyActor);

const requireManager = (_req: Request, res: Response): boolean => {
  if (manages(res.locals.actor)) return true;
  res.status(403).json({ success: false, message: 'Manager access is required' });
  return false;
};

async function ownsTimeEntry(res: Response, timeEntryId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT te.id FROM time_entries te
       JOIN users u ON u.id=te.user_id
      WHERE te.id=$1 AND u.company_id=$2`,
    [timeEntryId, res.locals.actor.company_id],
  );
  if (result.rowCount) return true;
  res.status(404).json({ success: false, message: 'Time entry not found' });
  return false;
}

// POST /api/dispute/build/:timeEntryId – Build an evidence package
router.post('/build/:timeEntryId', async (req: Request, res: Response) => {
  try {
    if (!requireManager(req, res)) return;
    if (!(await ownsTimeEntry(res, String(req.params.timeEntryId)))) return;
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
    if (!requireManager(req, res)) return;
    const buffer = await generateDisputePDF(req.params.packageId as string, res.locals.actor.company_id);
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="dispute-${String(req.params.packageId).replace(/[^a-zA-Z0-9-]/g, '')}.pdf"`);
    res.set('Cache-Control', 'private, no-store');
    res.send(buffer);
  } catch (error: any) {
    res.status(error.status || 500).json({ success: false, message: error.status === 404 ? error.message : 'Failed to generate PDF' });
  }
});

// GET /api/dispute/high-risk/:companyId – Get high‑risk entries
router.get('/high-risk/:companyId', async (req: Request, res: Response) => {
  try {
    if (!requireManager(req, res)) return;
    if (String(req.params.companyId) !== String(res.locals.actor.company_id)) {
      return res.status(403).json({ success: false, message: 'Company access denied' });
    }
    const entries = await checkHighRiskEntries(res.locals.actor.company_id);
    res.json({ success: true, count: entries.length, entries });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch high‑risk entries' });
  }
});

export default router;
