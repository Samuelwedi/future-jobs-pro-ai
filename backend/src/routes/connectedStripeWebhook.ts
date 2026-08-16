import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import { syncStripeEventToQuickBooks } from '../services/integrationService';
import { handleStripeWebhook } from '../services/stripeService';

const router = express.Router();

// Future Jobs Pro AI platform subscriptions. Uses STRIPE_WEBHOOK_SECRET.
router.post('/webhook', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  try {
    const signature = req.headers['stripe-signature'];
    if (typeof signature !== 'string') throw new Error('Missing Stripe-Signature header');
    res.json(await handleStripeWebhook(req.body, signature));
  } catch (error: any) {
    console.error('Stripe platform webhook failed:', error);
    res.status(400).json({ received: false, message: error.message });
  }
});

// Customer Stripe Connect data sync. Uses its own Connect webhook secret.
router.post('/connected-webhook', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  try {
    const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
    const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim();
    const signature = req.headers['stripe-signature'];
    if (!secretKey || !webhookSecret) throw new Error('Stripe Connect webhook is not configured');
    if (typeof signature !== 'string') throw new Error('Missing Stripe-Signature header');

    const stripe = new Stripe(secretKey);
    const event: any = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    await syncStripeEventToQuickBooks(event);
    res.json({ received: true });
  } catch (error: any) {
    console.error('Stripe Connect webhook failed:', error);
    res.status(400).json({ received: false, message: error.message });
  }
});

export default router;
