import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/auth';
import { pool } from '../config/database';

export const trialCheck = async (req: Request, res: Response, next: NextFunction) => {
  // Skip auth routes and health
  if (
    req.path.startsWith('/api/auth') ||
    req.path.startsWith('/api/stripe') ||
    req.path === '/api/health' ||
    req.path === '/api/lucy'
  ) {
    return next();
  }

  try {
    // Use the shared verifyToken helper (which includes test user bypass)
    const decoded = verifyToken(req);
    (req as any).user = decoded;
    (req as any).companyId = decoded.companyId || 'ed1887d9-3ffd-46e4-b281-338c8ad03a66';

    // Optional trial expiration logic for non-test users
    if (decoded.email !== 'samuel@test.com') {
      const userRes = await pool.query(
        'SELECT trial_ends_at, stripe_payment_method_id FROM users WHERE id = $1',
        [decoded.id]
      );
      if (userRes.rows.length === 0) {
        return res.status(401).json({ success: false, message: 'User not found' });
      }
      const user = userRes.rows[0];
      const now = new Date();
      if (new Date(user.trial_ends_at) < now && !user.stripe_payment_method_id) {
        return res.status(402).json({
          success: false,
          message: 'Trial expired. Please add a payment method.',
        });
      }
    }

    next();
  } catch (error: any) {
    console.error('Trial check error:', error.message);
    return res.status(401).json({ success: false, message: error.message });
  }
};