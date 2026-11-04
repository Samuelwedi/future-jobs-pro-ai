import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { sendEmail } from '../services/emailService';

const router = Router();
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const contactLimit = rateLimit({windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({success:false,message:'Too many contact requests. Please try again later.'})});

// Public contact form: fixed recipient, bounded input and no customer-account lookup.
router.post('/', contactLimit, async (req, res) => {
  const {name, email, message} = req.body || {};
  if (typeof name !== 'string' || !name.trim() || name.length > 200 || typeof email !== 'string' || email.length > 254 || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email.trim()) || typeof message !== 'string' || !message.trim() || message.length > 5000) {
    return res.status(400).json({success:false,message:'Enter your name, a valid email and a message of up to 5,000 characters.'});
  }
  try {
    await sendEmail('support@futurejobsproai.com', 'Future Jobs Pro AI contact request',
      `<h2>Contact request</h2><p>Name: ${escapeHtml(name.trim())}</p><p>Email: ${escapeHtml(email.trim())}</p><p style="white-space:pre-wrap">${escapeHtml(message.trim())}</p>`);
    return res.status(202).json({success:true,message:'Your message was accepted for delivery to support.'});
  } catch {
    return res.status(503).json({success:false,message:'Delivery could not be confirmed. Your text has been kept. Check with support before retrying to avoid duplicate messages.'});
  }
});
export default router;
