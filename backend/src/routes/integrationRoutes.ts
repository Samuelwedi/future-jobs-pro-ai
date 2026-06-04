import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database';
import {
  getQuickBooksAuthUrl,
  getStripeConnectUrl,
  handleQuickBooksCallback,
  handleStripeConnectCallback,
} from '../services/integrationService';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET!;

// GET /api/integrations/status – check integration status for the company
router.get('/status', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    const result = await pool.query(
      `SELECT provider, is_active FROM integrations WHERE company_id = $1`,
      [decoded.companyId]
    );

    const status: any = {};
    for (const row of result.rows) {
      status[row.provider] = { connected: row.is_active };
    }

    res.json({ success: true, ...status });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/integrations/quickbooks/auth – start QuickBooks OAuth
router.get('/quickbooks/auth', async (req: Request, res: Response) => {
  const { companyId } = req.query;
  if (!companyId) return res.status(400).json({ success: false, message: 'Missing companyId' });
  const url = await getQuickBooksAuthUrl(companyId as string);
  res.redirect(url);
});

// GET /api/integrations/quickbooks/callback – OAuth callback
router.get('/quickbooks/callback', async (req: Request, res: Response) => {
  try {
    const { code, realmId, state } = req.query;
    const companyId = 'from-state'; // In production, retrieve companyId from state param
    await handleQuickBooksCallback(companyId, code as string, realmId as string, state as string);
    res.send('QuickBooks connected! You can close this tab.');
  } catch (error) {
    console.error('QuickBooks callback error:', error);
    res.status(500).send('Connection failed');
  }
});

// GET /api/integrations/stripe/auth – start Stripe Connect
router.get('/stripe/auth', (req: Request, res: Response) => {
  const { companyId } = req.query;
  if (!companyId) return res.status(400).json({ success: false, message: 'Missing companyId' });
  const url = getStripeConnectUrl(companyId as string);
  res.redirect(url);
});

// GET /api/integrations/stripe/callback – Stripe Connect callback
router.get('/stripe/callback', async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query;
    const companyId = 'from-state'; // Retrieve from state
    await handleStripeConnectCallback(companyId, code as string, state as string);
    res.send('Stripe connected! You can close this tab.');
  } catch (error) {
    console.error('Stripe callback error:', error);
    res.status(500).send('Connection failed');
  }
});

export default router;