import { verifyToken } from '../utils/auth';
import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { pool } from '../config/database';
import { applyPlanAllowance } from '../config/billingPlans';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET!;
const passwordFingerprint = (hash: string) => crypto.createHash('sha256').update(hash).digest('hex');
const resetRateLimitOptions = {
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many reset requests. Please try again in 15 minutes.' },
};
const forgotPasswordLimit = rateLimit(resetRateLimitOptions);
const resetPasswordLimit = rateLimit(resetRateLimitOptions);
const authenticationLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (_req, res) => res.status(429).json({ success: false, message: 'Too many sign-in attempts. Try again later.' }),
});

import { sendPasswordResetEmail } from '../services/emailService';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalizeEmail = (value: unknown): string => String(value || '').trim().toLowerCase();

router.post('/register', authenticationLimit, async (req: Request, res: Response) => {
  try {
    const { firstName, lastName, password } = req.body;
    const email = normalizeEmail(req.body.email);
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    if (!EMAIL_PATTERN.test(email)) return res.status(400).json({ success: false, message: 'Enter a valid email address' });
    if (String(password).length < 8) return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });

    const passwordHash = await bcrypt.hash(password, 10);
    const fullName = `${firstName} ${lastName}`;
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const client = await pool.connect();
    let user: any;
    let companyId: string;
    try {
      await client.query('BEGIN');
      const existing = await client.query(
        'SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1',
        [email],
      );
      if (existing.rowCount) {
        const duplicate: any = new Error('User already exists');
        duplicate.status = 409;
        throw duplicate;
      }

      const companyResult = await client.query(
        `INSERT INTO companies (
           name, subscription_tier, subscription_status,
           subscription_expires_at, subscription_current_period_end,
           subscription_provider, subscription_updated_at, stripe_trial_used_at
         ) VALUES ($1, 'trial', 'trialing', $2, $2, 'internal', NOW(), NOW())
         RETURNING id`,
        [`${fullName}'s Company`, trialEndsAt],
      );
      companyId = String(companyResult.rows[0].id);
      await applyPlanAllowance(client,companyId,'team_10');

      const result = await client.query(
        `INSERT INTO users (
           first_name, last_name, email, password_hash, role, full_name,
           trial_ends_at, company_id
         ) VALUES ($1, $2, $3, $4, 'boss', $5, $6, $7)
         RETURNING id, email, first_name, last_name, role, trial_ends_at`,
        [firstName, lastName, email, passwordHash, fullName, trialEndsAt, companyId],
      );
      user = result.rows[0];
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, role: user.role, companyId },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.status(201).json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        fullName: `${user.first_name} ${user.last_name}`,
        trialEndsAt: user.trial_ends_at,
        companyId,
        hasPaymentMethod: false,
      },
    });
  } catch (error: any) {
    console.error('Registration error:', error.message);
    const duplicate = error.status === 409 || error.code === '23505';
    res.status(duplicate ? 409 : 500).json({
      success: false,
      message: duplicate ? 'User already exists' : 'Registration failed',
    });
  }
});

router.post('/login', authenticationLimit, async (req: Request, res: Response) => {
  try {
    const password = req.body.password;
    const email = normalizeEmail(req.body.email);
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const user = result.rows[0];
    if (user.is_active === false) {
      return res.status(401).json({ success: false, message: 'This account is inactive' });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    const token = jwt.sign(
      { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, role: user.role, companyId: user.company_id },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        fullName: user.full_name || `${user.first_name} ${user.last_name}`,
        trialEndsAt: user.trial_ends_at,
        companyId: user.company_id,
        hasPaymentMethod: !!user.stripe_payment_method_id,
      },
    });
  } catch (error: any) {
    console.error('Login error:', error.message);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// GET /api/auth/session - authoritative account state for live role changes.
router.get('/session', async (req: Request, res: Response) => {
  try {
    const decoded = verifyToken(req);
    const result = await pool.query(
      `SELECT id,email,first_name,last_name,full_name,role,company_id,trial_ends_at,
              COALESCE(is_active,TRUE) AS is_active, stripe_payment_method_id
       FROM users WHERE id=$1`,
      [decoded.id],
    );
    const row = result.rows[0];
    if (!row?.is_active) return res.status(401).json({ success:false, message:'This account is inactive' });
    res.set('Cache-Control','no-store').json({ success:true, user:{
      id:row.id,email:row.email,firstName:row.first_name,lastName:row.last_name,
      fullName:row.full_name || `${row.first_name || ''} ${row.last_name || ''}`.trim(),
      role:row.role,companyId:row.company_id,trialEndsAt:row.trial_ends_at,
      hasPaymentMethod:Boolean(row.stripe_payment_method_id),
    }});
  } catch (error:any) {
    res.status(401).json({ success:false, message:error.message || 'Session is not valid' });
  }
});

// ----- CHANGE PASSWORD -----
router.post('/change-password', async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current and new password required' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const userId = decoded.id;

    const userRes = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const valid = await bcrypt.compare(currentPassword, userRes.rows[0].password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }
    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, userId]);
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error: any) {
    console.error('Change password error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to change password' });
  }
});

// ----- FORGOT PASSWORD -----
router.post('/forgot-password', forgotPasswordLimit, async (req: Request, res: Response) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!EMAIL_PATTERN.test(email)) return res.status(400).json({ success: false, message: 'Enter a valid email address' });

    const userRes = await pool.query('SELECT id, email, password_hash FROM users WHERE LOWER(email) = $1 AND COALESCE(is_active,TRUE)=TRUE', [email]);
    if (userRes.rows.length === 0) {
      // Don't reveal user existence
      return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    }

    const user = userRes.rows[0];
    const resetToken = jwt.sign({ userId: user.id, purpose: 'password-reset', fingerprint: passwordFingerprint(user.password_hash) }, JWT_SECRET, { expiresIn: '1h', issuer: 'future-jobs-pro-ai', audience: 'password-reset' });
    const resetLink = `${(process.env.FRONTEND_URL || process.env.CLIENT_URL || 'https://www.futurejobsproai.com').replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(resetToken)}`;
    // Do not make the public response reveal SMTP availability or account existence.
    // Delivery continues asynchronously and failures remain visible in server logs.
    void sendPasswordResetEmail(user.email, resetLink).catch((deliveryError: any) => {
      console.error('Password reset email delivery failed:', deliveryError?.message || deliveryError);
    });
    
    res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
  } catch (error: any) {
    console.error('Forgot password error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to send reset link' });
  }
});

// ----- RESET PASSWORD -----
router.post('/reset-password', resetPasswordLimit, async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;
    if (typeof token !== 'string' || typeof newPassword !== 'string' || Buffer.byteLength(newPassword, 'utf8') > 72 || !token || !newPassword) {
      return res.status(400).json({ success: false, message: 'Token and new password required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }

    const decoded = jwt.verify(token, JWT_SECRET, { issuer: 'future-jobs-pro-ai', audience: 'password-reset' }) as { userId: string; purpose?: string; fingerprint?: string };
    const account = await pool.query('SELECT password_hash FROM users WHERE id=$1 AND COALESCE(is_active,TRUE)=TRUE', [decoded.userId]);
    if (!account.rowCount || decoded.fingerprint !== passwordFingerprint(account.rows[0].password_hash)) return res.status(400).json({ success:false, message:'Reset link was already used or is invalid' });
    if (decoded.purpose !== 'password-reset') return res.status(400).json({ success: false, message: 'Invalid password reset link' });
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    const changed = await pool.query('UPDATE users SET password_hash=$1, must_change_password=FALSE, updated_at=NOW() WHERE id=$2 AND password_hash=$3 AND COALESCE(is_active,TRUE)=TRUE RETURNING id', [hashedPassword, decoded.userId, account.rows[0].password_hash]);
    if (!changed.rowCount) return res.status(400).json({success:false,message:'Reset link was already used'});
    
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return res.status(400).json({ success: false, message: 'Reset link has expired. Please request a new one.' });
    }
    if (error.name === 'JsonWebTokenError' || error.name === 'NotBeforeError') return res.status(400).json({success:false,message:'Reset link is invalid. Request a new one.'});
    console.error('Reset password error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to reset password' });
  }
});

export default router;
