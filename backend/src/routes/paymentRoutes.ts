import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import Stripe from 'stripe';
import { pool } from '../config/database';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2025-01-27.acacia' as any });

const getUserFromToken = async (req: Request) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.id]);
    return result.rows[0] || null;
  } catch { return null; }
};

// POST /api/stripe/create-setup-session
router.post('/create-setup-session', async (req: Request, res: Response) => {
  try {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false, message: 'Not authenticated' });

    if (!user.stripe_customer_id) {
      return res.status(400).json({ success: false, message: 'Stripe customer not found. Please re-register.' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'setup',
      customer: user.stripe_customer_id,
      success_url: `${process.env.CLIENT_URL || 'https://future-jobs-pro-ai.vercel.app'}/dashboard?setup=success`,
      cancel_url: `${process.env.CLIENT_URL || 'https://future-jobs-pro-ai.vercel.app'}/dashboard?setup=cancel`,
    });

    res.json({ success: true, url: session.url });
  } catch (error: any) {
    console.error('Setup session error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to create setup session' });
  }
});

// GET /api/stripe/setup-success?session_id=...
router.get('/setup-success', async (req: Request, res: Response) => {
  try {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const session = await stripe.checkout.sessions.retrieve(req.query.session_id as string);
    const setupIntent = await stripe.setupIntents.retrieve(session.setup_intent as string);
    const paymentMethodId = setupIntent.payment_method as string;

    await pool.query('UPDATE users SET stripe_payment_method_id = $1 WHERE id = $2', [paymentMethodId, user.id]);

    res.json({ success: true, message: 'Payment method saved!' });
  } catch (error: any) {
    console.error('Setup success error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to save payment method' });
  }
});

export default router;