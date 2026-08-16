import express, { Request, Response } from 'express';
import { verifyToken } from '../utils/auth';
import {
  createBillingPortalSession,
  createCheckoutSession,
  getPricingPlans,
  getSubscriptionStatus,
  setSubscriptionCancellation,
} from '../services/stripeService';

const router = express.Router();

function actor(req: Request) {
  const decoded = verifyToken(req);
  return { userId: decoded.id, companyId: decoded.companyId };
}

function statusFor(error: any): number {
  const message = String(error?.message || 'Billing request failed');
  if (/token|authenticated/i.test(message)) return 401;
  if (/owner|administrator/i.test(message)) return 403;
  if (/not configured/i.test(message)) return 503;
  return 400;
}

router.get('/plans', async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, plans: await getPricingPlans() });
  } catch (error: any) {
    res.status(statusFor(error)).json({ success: false, message: error.message });
  }
});

router.get('/status', async (req: Request, res: Response) => {
  try {
    const { companyId } = actor(req);
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, subscription: await getSubscriptionStatus(companyId) });
  } catch (error: any) {
    res.status(statusFor(error)).json({ success: false, message: error.message });
  }
});

router.post('/create-checkout', async (req: Request, res: Response) => {
  try {
    const { userId, companyId } = actor(req);
    const checkoutUrl = await createCheckoutSession(userId, companyId, req.body?.plan);
    res.json({ success: true, checkoutUrl });
  } catch (error: any) {
    res.status(statusFor(error)).json({ success: false, message: error.message });
  }
});

router.post('/billing-portal', async (req: Request, res: Response) => {
  try {
    const { userId, companyId } = actor(req);
    res.json({ success: true, url: await createBillingPortalSession(userId, companyId) });
  } catch (error: any) {
    res.status(statusFor(error)).json({ success: false, message: error.message });
  }
});

router.post('/cancel-subscription', async (req: Request, res: Response) => {
  try {
    const { userId, companyId } = actor(req);
    await setSubscriptionCancellation(userId, companyId, true);
    res.json({ success: true, message: 'Subscription will end after the current billing period.' });
  } catch (error: any) {
    res.status(statusFor(error)).json({ success: false, message: error.message });
  }
});

router.post('/resume-subscription', async (req: Request, res: Response) => {
  try {
    const { userId, companyId } = actor(req);
    await setSubscriptionCancellation(userId, companyId, false);
    res.json({ success: true, message: 'Scheduled cancellation was removed.' });
  } catch (error: any) {
    res.status(statusFor(error)).json({ success: false, message: error.message });
  }
});

export default router;
