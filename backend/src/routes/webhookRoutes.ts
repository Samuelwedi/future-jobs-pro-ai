import { verifyToken } from '../utils/auth';
import express, { Request, Response } from 'express';
import { handleIncomingWebhook } from '../services/webhookService';

const router = express.Router();

// POST /api/webhooks/trigger – Zapier calls this endpoint
router.post('/trigger', async (req: Request, res: Response) => {
  try {
    verifyToken(req);
    const { trigger, payload } = req.body;
    if (!trigger) {
      return res.status(400).json({ success: false, message: 'Trigger name is required' });
    }
    const data = await handleIncomingWebhook(trigger, payload || {});
    res.json({ success: true, data });
  } catch (error: any) {
    console.error('Webhook error:', error);
    const status = /token|authenticated/i.test(String(error.message || '')) ? 401 : 500;
    res.status(status).json({ success: false, message: status === 401 ? 'Authentication is required' : 'Webhook processing failed' });
  }
});

export default router;
