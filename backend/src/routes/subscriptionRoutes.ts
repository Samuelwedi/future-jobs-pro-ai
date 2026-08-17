import express, { Request, Response } from 'express';
import { verifyToken } from '../utils/auth';
import { getSubscriptionStatus } from '../services/stripeService';
import { processAppleNotification, verifyApplePurchase } from '../services/appleSubscriptionService';

const router = express.Router();

router.post('/verify', async (req: Request, res: Response) => {
  try {
    const decoded = verifyToken(req);
    const platform = String(req.body?.platform || '').toLowerCase();
    if (platform !== 'ios' && platform !== 'apple') {
      return res.status(501).json({ success: false, message: 'Google Play verification will be enabled after Apple validation is complete.' });
    }
    const productId = String(req.body?.productId || '');
    const signedTransaction = String(req.body?.purchaseToken || '');
    if (!productId || !signedTransaction) {
      return res.status(400).json({ success: false, message: 'Apple product and signed transaction are required.' });
    }
    const subscription = await verifyApplePurchase({
      companyId: decoded.companyId,
      userId: decoded.id,
      productId,
      signedTransaction,
    });
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, subscription });
  } catch (error: any) {
    const message = String(error?.message || 'Apple purchase verification failed');
    const status = /token|authenticated/i.test(message) ? 401 : /not configured|certificates/i.test(message) ? 503 : /another workspace/i.test(message) ? 409 : 400;
    res.status(status).json({ success: false, message });
  }
});

router.post('/apple/notifications', async (req: Request, res: Response) => {
  try {
    const signedPayload = String(req.body?.signedPayload || '');
    if (!signedPayload) return res.status(400).json({ success: false, message: 'signedPayload is required' });
    res.json(await processAppleNotification(signedPayload));
  } catch (error: any) {
    console.error('Apple subscription notification verification failed:', error?.message || error);
    res.status(400).json({ success: false });
  }
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
