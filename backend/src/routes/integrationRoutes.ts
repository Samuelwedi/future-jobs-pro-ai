import express, { Request, Response } from 'express';
import { verifyToken } from '../utils/auth';
import {
  disconnectIntegration,
  getIntegrationStatus,
  getQuickBooksAuthUrl,
  getStripeConnectUrl,
  handleQuickBooksCallback,
  handleStripeConnectCallback,
  integrationResultUrl,
  syncRecentStripePayments,
} from '../services/integrationService';

const router = express.Router();

function authenticatedCompany(req: Request): { companyId: string; userId: string } {
  const decoded = verifyToken(req);
  if (!decoded.companyId) throw new Error('Your user is not assigned to a company');
  return { companyId: decoded.companyId, userId: decoded.id };
}

function errorStatus(message: string): number {
  if (/token|authenticated|company/i.test(message)) return 401;
  if (/not configured/i.test(message)) return 503;
  return 400;
}

router.get('/status', async (req: Request, res: Response) => {
  try {
    const { companyId } = authenticatedCompany(req);
    res.json({ success: true, ...(await getIntegrationStatus(companyId)) });
  } catch (error: any) {
    res.status(errorStatus(error.message)).json({ success: false, message: error.message });
  }
});

router.get('/quickbooks/auth', async (req: Request, res: Response) => {
  try {
    const { companyId, userId } = authenticatedCompany(req);
    res.json({ success: true, url: await getQuickBooksAuthUrl(companyId, userId) });
  } catch (error: any) {
    res.status(errorStatus(error.message)).json({ success: false, message: error.message });
  }
});

router.get('/quickbooks/callback', async (req: Request, res: Response) => {
  const state = String(req.query.state || '');
  try {
    if (req.query.error) throw new Error(String(req.query.error_description || req.query.error));
    const realmId = String(req.query.realmId || '');
    const baseUrl = (process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    await handleQuickBooksCallback(`${baseUrl}${req.originalUrl}`, state, realmId);
    res.redirect(integrationResultUrl('quickbooks', 'connected'));
  } catch (error: any) {
    console.error('QuickBooks callback failed:', error);
    res.redirect(integrationResultUrl('quickbooks', 'error', error.message));
  }
});

router.get('/stripe/auth', async (req: Request, res: Response) => {
  try {
    const { companyId, userId } = authenticatedCompany(req);
    res.json({ success: true, url: await getStripeConnectUrl(companyId, userId) });
  } catch (error: any) {
    res.status(errorStatus(error.message)).json({ success: false, message: error.message });
  }
});

router.get('/stripe/callback', async (req: Request, res: Response) => {
  const state = String(req.query.state || '');
  try {
    if (req.query.error) throw new Error(String(req.query.error_description || req.query.error));
    await handleStripeConnectCallback(String(req.query.code || ''), state);
    res.redirect(integrationResultUrl('stripe', 'connected'));
  } catch (error: any) {
    console.error('Stripe callback failed:', error);
    res.redirect(integrationResultUrl('stripe', 'error', error.message));
  }
});

router.post('/:provider/disconnect', async (req: Request, res: Response) => {
  try {
    const provider = req.params.provider;
    if (provider !== 'quickbooks' && provider !== 'stripe') {
      return res.status(400).json({ success: false, message: 'Unknown integration provider' });
    }
    const { companyId } = authenticatedCompany(req);
    await disconnectIntegration(companyId, provider);
    res.json({ success: true });
  } catch (error: any) {
    res.status(errorStatus(error.message)).json({ success: false, message: error.message });
  }
});

router.post('/sync/stripe-to-quickbooks', async (req: Request, res: Response) => {
  try {
    const { companyId } = authenticatedCompany(req);
    res.json({ success: true, result: await syncRecentStripePayments(companyId) });
  } catch (error: any) {
    res.status(errorStatus(error.message)).json({ success: false, message: error.message });
  }
});

export default router;
