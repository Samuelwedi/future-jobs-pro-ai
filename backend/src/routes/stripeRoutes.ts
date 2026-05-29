// ============================================
// STRIPE ROUTES
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

//import express, { Request, Response } from 'express';
//import {
  createCheckoutSession,
  cancelSubscription,
  getSubscriptionStatus,
  getPricingPlans,
  handleStripeWebhook,
} from '../services/stripeService';

const router = express.Router();

// GET /api/stripe/plans
router.get('/plans', async (req: Request, res: Response) => {
  try {
    const plans = await getPricingPlans();
    res.json({ success: true, plans, owner: 'Samuel B.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get plans' });
  }
});

// POST /api/stripe/create-checkout
router.post('/create-checkout', async (req: Request, res: Response) => {
  try {
    const { companyId, priceId, successUrl, cancelUrl } = req.body;
    const checkoutUrl = await createCheckoutSession(companyId, priceId, successUrl, cancelUrl);
    res.json({ success: true, checkoutUrl });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to create checkout' });
  }
});

// POST /api/stripe/cancel-subscription
router.post('/cancel-subscription', async (req: Request, res: Response) => {
  try {
    await cancelSubscription(req.body.subscriptionId);
    res.json({ success: true, message: 'Subscription canceled' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to cancel' });
  }
});

// GET /api/stripe/status/:companyId
router.get('/status/:companyId', async (req: Request, res: Response) => {
  try {
    const status = await getSubscriptionStatus(req.params.companyId as string);
    res.json({ success: true, ...status });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get status' });
  }
});

// POST /api/stripe/webhook (for your own Stripe account)
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  async (req: Request, res: Response) => {
    try {
      const signature = req.headers['stripe-signature'] as string;
      const result = await handleStripeWebhook(req.body, signature);
      res.json(result);
    } catch (error: any) {
      console.error('Webhook error:', error);
      res.status(400).send(`Webhook Error: ${error.message}`);
    }
  }
);

// POST /api/stripe/connected-webhook (for Stripe Connect accounts)
router.post(
  '/connected-webhook',
  express.raw({ type: 'application/json' }),
  async (req: Request, res: Response) => {
    try {
      const signature = req.headers['stripe-signature'] as string;
      // Use the same webhook handler, which now processes connected account events
      const result = await handleStripeWebhook(req.body, signature);
      // Also trigger QuickBooks sync for this event
      const { syncStripeEventToQuickBooks } = await import('../services/integrationService');
      await syncStripeEventToQuickBooks(JSON.parse(req.body.toString()));
      res.json(result);
    } catch (error: any) {
      console.error('Connected webhook error:', error);
      res.status(400).send(`Webhook Error: ${error.message}`);
    }
  }
);

export default router;