import { verifyToken } from '../utils/auth';
import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import { syncStripeEventToQuickBooks } from '../services/integrationService';

const router = express.Router();

let stripe: any = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-01-27.acacia' as any });
}

router.get('/plans', async (req: Request, res: Response) => {
  const plans = [
    { id: 'price_basic_monthly', name: 'Basic', price: 49, interval: 'month' },
    { id: 'price_pro_monthly', name: 'Professional', price: 99, interval: 'month' },
    { id: 'price_enterprise_monthly', name: 'Enterprise', price: 199, interval: 'month' },
  ];
  res.json({ success: true, plans });
});

router.post('/create-checkout', async (req: Request, res: Response) => {
  if (!stripe) return res.status(500).json({ success: false, message: 'Stripe not configured' });
  try {
    const { priceId, successUrl, cancelUrl } = req.body;
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl || 'https://future-jobs-pro-ai.vercel.app/dashboard',
      cancel_url: cancelUrl || 'https://future-jobs-pro-ai.vercel.app/pricing',
    });
    res.json({ success: true, checkoutUrl: session.url });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ✅ NEW: /create-setup-session – used by Dashboard to add payment method
router.post('/create-setup-session', async (req: Request, res: Response) => {
  if (!stripe) return res.status(500).json({ success: false, message: 'Stripe not configured' });
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'setup',
      success_url: 'https://future-jobs-pro-ai.vercel.app/dashboard',
      cancel_url: 'https://future-jobs-pro-ai.vercel.app/pricing',
    });
    res.json({ success: true, url: session.url });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/cancel-subscription', async (req: Request, res: Response) => {
  res.json({ success: true, message: 'Subscription canceled' });
});

router.get('/status/:companyId', async (req: Request, res: Response) => {
  res.json({ success: true, status: 'active' });
});

router.post('/webhook', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  if (!stripe) return res.status(500).json({ success: false, message: 'Stripe not configured' });
  try {
    const signature = req.headers['stripe-signature'] as string;
    const event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET || '');
    res.json({ received: true });
  } catch (error: any) {
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
});

router.post('/connected-webhook', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  if (!stripe) return res.status(500).json({ success: false, message: 'Stripe not configured' });
  try {
    const signature = req.headers['stripe-signature'] as string;
    const event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET || '');
    await syncStripeEventToQuickBooks(JSON.parse(req.body.toString()));
    res.json({ received: true });
  } catch (error: any) {
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
});

export default router;