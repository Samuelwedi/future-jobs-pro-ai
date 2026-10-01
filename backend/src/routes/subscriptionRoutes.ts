import { hasComplimentaryAccess, complimentarySubscription } from '../services/complimentaryAccess';
import express, { Request, Response } from 'express';
import { verifyToken } from '../utils/auth';
import { getSubscriptionStatus } from '../services/stripeService';
import { appleBillingReady, processAppleNotification, verifyApplePurchase } from '../services/appleSubscriptionService';
import { loadSubscriptionActor } from '../middleware/trialMiddleware';
import { BillingError, googleAccountId, googleBilling, googleBillingReady, verifyGooglePush } from '../services/googleSubscriptionService';

const router = express.Router();
async function actor(req: Request) {
  const decoded = verifyToken(req);
  return loadSubscriptionActor(decoded.id, decoded.companyId);
}
router.get('/capabilities', async (req, res) => {
  try {
    const a = await actor(req);
    res.set('Cache-Control','no-store');
    res.json({ success:true, google:googleBillingReady(),
      apple:appleBillingReady(),
      canPurchase:!hasComplimentaryAccess(a.id,a.companyId) && ['boss','owner','admin'].includes(a.role),
      googleAccountId:googleAccountId(a.companyId,a.id) });
  } catch { res.status(401).json({success:false,message:'Sign in to load billing options'}); }
});

router.post('/verify', async (req: Request, res: Response) => {
  try {
    const decoded = await actor(req);
    if (!['boss','owner','admin'].includes(decoded.role)) throw new BillingError('Only a company owner or administrator can change billing',403);
    const platform = String(req.body?.platform || '').toLowerCase();
    if (!['ios','apple','android','google'].includes(platform)) throw new BillingError('Unsupported store platform');
    const productId = String(req.body?.productId || '');
    const signedTransaction = String(req.body?.purchaseToken || '');
    if (!productId || !signedTransaction) {
      return res.status(400).json({ success: false, message: 'Product and purchase proof are required.' });
    }
    const subscription = ['android','google'].includes(platform) ? await googleBilling.verify({
      companyId:decoded.companyId,userId:decoded.id,productId,purchaseToken:signedTransaction,
    }) : await verifyApplePurchase({
      companyId: decoded.companyId,
      userId: decoded.id,
      productId,
      signedTransaction,
    });
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, subscription });
  } catch (error: any) {
    const message = String(error?.message || 'Apple purchase verification failed');
    const status = error instanceof BillingError ? error.status : /token|authenticated/i.test(message) ? 401 : /not configured|certificates/i.test(message) ? 503 : /another workspace/i.test(message) ? 409 : 400;
    res.status(status).json({ success: false, message });
  }
});

router.post('/google/notifications', async (req,res) => {
  try {
    await verifyGooglePush(req.headers.authorization);
    res.json(await googleBilling.notification(req.body));
  } catch (error) {
    const status = error instanceof BillingError ? error.status : 503;
    res.status(status).json({success:false,message:'Notification could not be processed'});
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
    const decoded = await actor(req);
    if (hasComplimentaryAccess(decoded.id,decoded.companyId)) {
      res.set('Cache-Control', 'no-store');
      return res.json({success:true,subscription:complimentarySubscription()});
    }
    if (decoded.subscriptionProvider === 'google') await googleBilling.refresh(decoded.companyId);
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, subscription: await getSubscriptionStatus(decoded.companyId) });
  } catch (error: any) {
    res.status(error instanceof BillingError ? error.status : 401).json({ success: false, message: error.message });
  }
});

export default router;
