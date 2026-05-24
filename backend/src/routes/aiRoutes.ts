import express, { Request, Response } from 'express';
import { getPendingSuggestions, dismissSuggestion } from '../services/adaptiveAIService';

const router = express.Router();

router.get('/suggestions/:userId', async (req: Request, res: Response) => {
  try {
    const suggestions = await getPendingSuggestions(req.params.userId as string);
    res.json({ success: true, suggestions });
  } catch (error: any) {
    console.error('❌ Suggestions error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/event', async (req: Request, res: Response) => {
  try {
    const { recordUserEvent } = await import('../services/adaptiveAIService');
    await recordUserEvent(req.body);
    res.json({ success: true, message: 'Event recorded for AI learning' });
  } catch (error: any) {
    console.error('Error recording event:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/suggestions/:suggestionId/dismiss', async (req: Request, res: Response) => {
  try {
    await dismissSuggestion(req.params.suggestionId as string);
    res.json({ success: true, message: 'Suggestion dismissed' });
  } catch (error: any) {
    console.error('❌ Dismiss error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;