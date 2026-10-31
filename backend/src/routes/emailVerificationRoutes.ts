import express from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { pool } from '../config/database';
import { verifyToken } from '../utils/auth';
import { sendVerificationEmail } from '../services/emailService';

const router = express.Router();
const digest = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const limit = () => rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });

router.get('/email-verification', async (req, res) => {
  let id: string;
  try { id = String(verifyToken(req).id); } catch { return res.status(401).json({ success: false, message: 'Sign in to view email verification.' }); }
  try {
    const result = await pool.query('SELECT email,email_verified_at FROM users WHERE id=$1 AND COALESCE(is_active,TRUE)=TRUE', [id]);
    if (!result.rowCount) return res.status(401).json({ success: false, message: 'This account is inactive.' });
    return res.set('Cache-Control', 'no-store').json({ success: true, email: result.rows[0].email, verified: Boolean(result.rows[0].email_verified_at) });
  } catch { return res.status(500).json({ success: false, message: 'Unable to load email verification.' }); }
});

router.post('/email-verification', limit(), async (req, res) => {
  let id: string;
  try { id = String(verifyToken(req).id); } catch { return res.status(401).json({ success: false, message: 'Sign in to verify your email.' }); }
  try {
    const result = await pool.query('SELECT email,email_verified_at FROM users WHERE id=$1 AND COALESCE(is_active,TRUE)=TRUE', [id]);
    if (!result.rowCount) return res.status(401).json({ success: false, message: 'This account is inactive.' });
    const user = result.rows[0];
    if (user.email_verified_at) return res.json({ success: true, verified: true, message: 'Email already verified.' });
    const token = crypto.randomBytes(32).toString('hex');
    const hash = digest(token);
    await pool.query('UPDATE users SET email_verification_token_hash=$1,email_verification_email=email,email_verification_expires_at=NOW()+INTERVAL \'1 hour\' WHERE id=$2 AND email=$3 AND email_verified_at IS NULL', [hash, id, user.email]);
    const link = new URL('/verify-email', process.env.FRONTEND_URL || process.env.CLIENT_URL || 'https://www.futurejobsproai.com');
    link.hash = new URLSearchParams({ token }).toString();
    try { await sendVerificationEmail(user.email, link.toString()); }
    catch {
      await pool.query('UPDATE users SET email_verification_token_hash=NULL,email_verification_expires_at=NULL WHERE id=$1 AND email_verification_token_hash=$2', [id, hash]);
      return res.status(503).json({ success: false, message: 'Verification email could not be sent. Try again later or contact support.' });
    }
    return res.json({ success: true, verified: false, message: 'Verification email sent. The link expires in one hour.' });
  } catch { return res.status(500).json({ success: false, message: 'Unable to send verification email.' }); }
});

// POST and an explicit user action prevent email-preview scanners consuming the link.
router.post('/verify-email', limit(), async (req, res) => {
  const token = req.body?.token;
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return res.status(400).json({ success: false, message: 'Invalid verification link.' });
  try {
    const result = await pool.query(`UPDATE users SET email_verified_at=NOW(),email_verification_token_hash=NULL,email_verification_expires_at=NULL
      WHERE email_verification_token_hash=$1 AND email_verification_email=email AND email_verification_expires_at>NOW() AND email_verified_at IS NULL AND COALESCE(is_active,TRUE)=TRUE RETURNING id`, [digest(token)]);
    if (!result.rowCount) return res.status(400).json({ success: false, message: 'Verification link expired or was already used. Request a new link from your profile.' });
    return res.set('Cache-Control', 'no-store').json({ success: true, message: 'Email verified successfully.' });
  } catch { return res.status(500).json({ success: false, message: 'Unable to verify email.' }); }
});
export default router;
