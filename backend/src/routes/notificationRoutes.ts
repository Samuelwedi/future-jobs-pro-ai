// ============================================
// NOTIFICATION ROUTES
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import express, { Request, Response } from 'express';
import { registerPushToken, sendPushNotification, sendCompanyNotification } from '../services/notificationService';

const router = express.Router();

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { userId, token, deviceType } = req.body;
    await registerPushToken(userId, token, deviceType);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false });
  }
});

router.post('/send', async (req: Request, res: Response) => {
  try {
    const { userId, title, body, data } = req.body;
    await sendPushNotification(userId, title, body, data);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false });
  }
});

router.post('/send-company', async (req: Request, res: Response) => {
  try {
    const { companyId, title, body, data } = req.body;
    await sendCompanyNotification(companyId, title, body, data);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false });
  }
});

export default router;