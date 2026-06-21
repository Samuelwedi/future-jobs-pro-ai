import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Stripe from 'stripe';
import { pool } from '../config/database';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET!;

let stripe: any = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-01-27.acacia' as any });
}

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { firstName, lastName, email, password } = req.body;
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'User already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const fullName = `${firstName} ${lastName}`;
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    let stripeCustomerId: string | null = null;
    if (stripe) {
      try {
        const customer = await stripe.customers.create({ email, name: fullName });
        stripeCustomerId = customer.id;
      } catch (err) {
        console.error('Stripe customer creation failed:', err);
      }
    }

    const result = await pool.query(
      `INSERT INTO users (first_name, last_name, email, password_hash, role, full_name, trial_ends_at, stripe_customer_id)
       VALUES ($1, $2, $3, $4, 'boss', $5, $6, $7)
       RETURNING id, email, first_name, last_name, role, trial_ends_at, stripe_customer_id`,
      [firstName, lastName, email, passwordHash, fullName, trialEndsAt, stripeCustomerId]
    );

    const user = result.rows[0];

    const companyResult = await pool.query(
      `INSERT INTO companies (name) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id`,
      [`${fullName}'s Company`]
    );
    const companyId = companyResult.rows[0]?.id;
    if (companyId) {
      await pool.query('UPDATE users SET company_id = $1 WHERE id = $2', [companyId, user.id]);
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, role: user.role, companyId: user.company_id },
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
    res.status(500).json({ success: false, message: 'Registration failed' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    const token = jwt.sign(
      { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role, companyId: user.company_id },
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

export default router;