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

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const result = await pool.query(
      'SELECT email, trial_ends_at, stripe_payment_method_id FROM users WHERE id = $1',
      [decoded.id]
    );
    if (result.rows.length === 0)
      return res.status(401).json({ success: false, message: 'User not found' });

    const user = result.rows[0];

    // Allow test user to bypass trial for development
    if (user.email === 'samuel@test.com') {
      return next();
    }

    const now = new Date();
    if (new Date(user.trial_ends_at) < now && !user.stripe_payment_method_id) {
      return res.status(402).json({
        success: false,
        message: 'Trial expired. Please add a payment method.',
      });
    }

    next();
  } catch (error: any) {
    console.error('JWT Verify Error:', error.name, error.message);
    return res.status(401).json({
      success: false,
      message: 'Invalid token',
      error: { name: error.name, message: error.message },
    });
  }
};