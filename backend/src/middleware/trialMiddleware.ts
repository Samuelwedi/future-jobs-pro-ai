import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database';

const JWT_SECRET = process.env.JWT_SECRET!;

export const trialCheck = async (req: Request, res: Response, next: NextFunction) => {
  // Skip auth, stripe, health, and lucy endpoints
  if (
    req.path.startsWith('/api/auth') ||
    req.path.startsWith('/api/stripe') ||
    req.path === '/api/health' ||
    req.path === '/api/lucy'
  ) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }

  const token = authHeader.split(' ')[1];
  
  // ----- FORCE BYPASS FOR TEST USER -----
  // Decode the token without verifying to check the email
  let unverified: any = null;
  try {
    unverified = jwt.decode(token) as any;
  } catch (e) {}
  
  if (unverified && unverified.email === 'samuel@test.com') {
    console.log('✅ FULL BYPASS: Allowing test user (samuel@test.com)');
    // Attach a fake user object with the ID from the token
    (req as any).user = { id: unverified.id, email: unverified.email, role: unverified.role };
    return next();
  }

  // ----- Normal JWT verification for other users -----
  let decoded: any;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (verifyError: any) {
    console.error('JWT verification error:', verifyError.message);
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }

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

    (req as any).user = user;
    next();
  } catch (error: any) {
    console.error('Database error in trialCheck:', error.message);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};