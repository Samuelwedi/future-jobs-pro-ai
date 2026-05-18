// ============================================
// AUTHENTICATION ROUTES
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { Secret } from 'jsonwebtoken';
import { pool } from '../config/database';
import { recordUserEvent } from '../services/adaptiveAIService';

const router = express.Router();

// JWT secret with proper type
const JWT_SECRET: Secret = process.env.JWT_SECRET || 'fallback-secret-change-me';

// ---------------------------------------------------------------
// POST /api/auth/register
// Create a new company + boss user
// ---------------------------------------------------------------
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName, role, companyName } = req.body;

    // 1. Check if user already exists
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    // 2. Create a new company
    const companyResult = await pool.query(
      `INSERT INTO companies (name) VALUES ($1) RETURNING id`,
      [companyName || `${firstName}'s Company`]
    );
    const companyId = companyResult.rows[0].id;

    // 3. Hash the password
    const passwordHash = await bcrypt.hash(password, 10);

    // 4. Insert the user
    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, company_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, first_name, last_name, role, company_id`,
      [email, passwordHash, firstName, lastName, role || 'boss', companyId]
    );
    const user = userResult.rows[0];

    // 5. Create JWT token (using typed secret and literal expiresIn)
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // 6. Record event for AI learning
    await recordUserEvent({
      userId: user.id,
      eventType: 'register',
      eventData: { email, role: user.role, companyName }
    });

    // 7. Respond
    res.status(201).json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        companyId: user.company_id
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, message: 'Registration failed' });
  }
});

// ---------------------------------------------------------------
// POST /api/auth/login
// Log in an existing user
// ---------------------------------------------------------------
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // 1. Find user by email (join with company)
    const result = await pool.query(
      `SELECT u.*, c.name as company_name
       FROM users u
       LEFT JOIN companies c ON u.company_id = c.id
       WHERE u.email = $1`,
      [email]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // 2. Compare password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // 3. Update last login
    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    // 4. Create JWT (using typed secret and literal expiresIn)
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // 5. Record event for AI
    await recordUserEvent({
      userId: user.id,
      eventType: 'login',
      eventData: { email }
    });

    // 6. Respond
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        companyId: user.company_id,
        companyName: user.company_name
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// ---------------------------------------------------------------
// POST /api/auth/logout
// (optional, mostly handled client-side)
// ---------------------------------------------------------------
router.post('/logout', async (req: Request, res: Response) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

export default router;