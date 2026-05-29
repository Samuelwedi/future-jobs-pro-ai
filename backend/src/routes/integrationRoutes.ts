import express, { Request, Response } from 'express';

const router = express.Router();

// Placeholder – QuickBooks integration coming soon
router.get('/status', (req: Request, res: Response) => {
  res.json({ status: 'disabled', message: 'Integration service coming soon' });
});

export default router;