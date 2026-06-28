import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/auth';
import { pool } from '../config/database';

export const trialCheck = async (req: Request, res: Response, next: NextFunction) => {
  // Skip auth, stripe, health, lucy
  if (
    req.path.startsWith('/api/auth') ||
    req.path.startsWith('/api/stripe') ||
    req.path === '/api/health' ||
    req.path === '/api/lucy'
  ) {
    return next();
  }

  // ---- BYPASS FOR TEST USER ----
  const testUserHeader = req.headers['x-test-user'];
  if (testUserHeader === 'samuel@test.com') {
    // Set a dummy user object for the test user
    (req as any).user = { id: 'e0f62298-03f1-4908-bac2-8415e5a9d0e5', email: 'samuel@test.com', companyId: 'ed1887d9-3ffd-46e4-b281-338c8ad03a66' };
    (req as any).companyId = 'ed1887d9-3ffd-46e4-b281-338c8ad03a66';
    console.log('🧪 Test user bypassed trial check');
    return next();
  }

  try {
    const decoded = verifyToken(req);
    (req as any).user = decoded;
    (req as any).companyId = decoded.companyId || 'ed1887d9-3ffd-46e4-b281-338c8ad03a66';

    // Additional trial logic here...
    // (Keep the rest of the trial logic as is)

    const userRes = await pool.query(
      `SELECT trial_ends_at, grace_ends_at, stripe_payment_method_id, paid_months
       FROM users WHERE id = $1`,
      [decoded.id]
    );
    if (userRes.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    const user = userRes.rows[0];
    const now = new Date();
    const trialEnd = new Date(user.trial_ends_at);
    const graceEnd = user.grace_ends_at ? new Date(user.grace_ends_at) : null;
    const hasPaymentMethod = !!user.stripe_payment_method_id;
    const paidMonths = user.paid_months || 0;

    if (now < trialEnd) {
      return next();
    }

    if (!hasPaymentMethod && !graceEnd) {
      const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      await pool.query('UPDATE users SET grace_ends_at = $1 WHERE id = $2', [sevenDays, decoded.id]);
      console.log(`🆓 First grace period for user ${decoded.id} until ${sevenDays}`);
      return next();
    }

    if (hasPaymentMethod) {
      if (graceEnd && now < graceEnd) {
        return next();
      }
      if (paidMonths >= 3) {
        const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        await pool.query('UPDATE users SET grace_ends_at = $1 WHERE id = $2', [sevenDays, decoded.id]);
        console.log(`🆓 Grace period granted for loyal user ${decoded.id} (paid ${paidMonths} months) until ${sevenDays}`);
        return next();
      }
      return res.status(402).json({
        success: false,
        message: 'Payment required. Please update your payment method.',
      });
    }

    if (graceEnd && now >= graceEnd) {
      return res.status(402).json({
        success: false,
        message: 'Payment required. Please add a payment method.',
      });
    }

    next();
  } catch (error: any) {
    console.error('Trial check error:', error.message);
    return res.status(401).json({ success: false, message: error.message });
  }
};