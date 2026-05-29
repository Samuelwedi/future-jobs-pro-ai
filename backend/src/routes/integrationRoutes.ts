// ============================================
// INTEGRATION ROUTES (OAuth endpoints)
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

//import express, { Request, Response } from 'express';
//import {
  getQuickBooksAuthUrl,
  getStripeConnectUrl,
  handleQuickBooksCallback,
  handleStripeConnectCallback,
} from '../services/integrationService';

const router = express.Router();

// GET /api/integrations/quickbooks/auth – start OAuth
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