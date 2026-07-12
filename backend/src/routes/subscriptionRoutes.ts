import express, { Request, Response } from 'express';
import { verifyToken } from '../utils/auth';
import { pool } from '../config/database';

const router = express.Router();

// ─── POST /api/subscriptions/verify ───
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const decoded = verifyToken(req);
    const userId = decoded.id;

    const { receipt, platform, productId } = req.body;
    if (!receipt || !platform || !productId) {
      return res.status(400).json({ success: false, message: 'Missing receipt, platform, or productId' });
    }

    // ─── For production, call Apple/Google APIs here ───
    // For now, we'll trust the receipt and create a subscription record.
    // In real life, you MUST validate the receipt with the respective store.

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1); // assume 1‑month subscription

    await pool.query(
      `INSERT INTO user_subscriptions (user_id, product_id, platform, receipt_data, expires_at, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (user_id, product_id) DO UPDATE
       SET receipt_data = EXCLUDED.receipt_data,
           expires_at = EXCLUDED.expires_at,
           is_active = true,
           updated_at = NOW()`,
      [userId, productId, platform, receipt, expiresAt]
    );

    res.json({ success: true, message: 'Subscription verified and saved.' });
  } catch (error: any) {
    console.error('Subscription verification error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── GET /api/subscriptions/status ───
router.get('/status', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const decoded = verifyToken(req);
    const userId = decoded.id;

    const result = await pool.query(
      `SELECT product_id, expires_at, is_active FROM user_subscriptions
       WHERE user_id = $1 AND is_active = true AND expires_at > NOW()
       ORDER BY expires_at DESC LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.json({ success: true, subscribed: false });
    }
    res.json({
      success: true,
      subscribed: true,
      subscription: result.rows[0],
    });
  } catch (error: any) {
    console.error('Subscription status error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;