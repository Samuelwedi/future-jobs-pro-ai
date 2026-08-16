import express, { Request, Response } from 'express';
import { verifyToken } from '../utils/auth';
import { getSubscriptionStatus } from '../services/stripeService';

const router = express.Router();

// Mobile entitlements must never be granted from an unverified client receipt.
// Apple App Store Server API and Google Play Developer API verification are Step 2.
router.post('/verify', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    message: 'Verified Apple and Google subscription processing is not enabled yet.',
  });
});

router.get('/status', async (req: Request, res: Response) => {
  try {
    const decoded = verifyToken(req);
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, subscription: await getSubscriptionStatus(decoded.companyId) });
  } catch (error: any) {
    res.status(401).json({ success: false, message: error.message });
  }
});

export default router;
