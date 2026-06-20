import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database';

const JWT_SECRET = process.env.JWT_SECRET!;

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

  // ----- TEST USER BYPASS: If the special header is present, skip token validation -----
  const testUserHeader = req.headers['x-test-user'];
  if (testUserHeader === 'samuel@test.com') {
    console.log('✅ TEST USER BYPASS (no token required)');
    // Attach a fake user object
    (req as any).user = { id: 'e0f62298-03f1-4908-bac2-8415e5a9d0e5', email: 'samuel@test.com', role: 'boss' };
    (req as any).companyId = 'ed1887d9-3ffd-46e4-b281-338c8ad03a66';
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }

  const token = authHeader.split(' ')[1];
  let decoded: any;
  let isTestUser = false;

  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (verifyError) {
    const unverified = jwt.decode(token) as any;
    if (unverified && unverified.email === 'samuel@test.com') {
      isTestUser = true;
      decoded = unverified;
    } else {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
  }

  // If not test user, proceed with normal trial check
  if (!isTestUser) {
    try {
      const result = await pool.query(
        'SELECT email, trial_ends_at, stripe_payment_method_id FROM users WHERE id = $1',
        [decoded.id]
      );
      if (result.rows.length === 0)
        return res.status(401).json({ success: false, message: 'User not found' });

      const user = result.rows[0];
      const now = new Date();
      if (new Date(user.trial_ends_at) < now && !user.stripe_payment_method_id) {
        return res.status(402).json({
          success: false,
          message: 'Trial expired. Please add a payment method.',
        });
      }
    } catch (dbErr) {
      console.error('Trial DB error:', dbErr);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  }

  // Attach user to request
  (req as any).user = decoded;
  (req as any).companyId = decoded.companyId || 'ed1887d9-3ffd-46e4-b281-338c8ad03a66';
  next();
};