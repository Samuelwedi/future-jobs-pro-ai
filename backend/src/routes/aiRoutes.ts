import express, { Request, Response } from 'express';
import { getPendingSuggestions, dismissSuggestion } from '../services/adaptiveAIService';
import { pool } from '../config/database';

const router = express.Router();

router.get('/suggestions/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const result = await pool.query(
      'SELECT * FROM ai_insights WHERE target_user_id = $1 AND is_read = false ORDER BY created_at DESC LIMIT 5',
      [userId]
    );
    res.json({ success: true, suggestions: result.rows });
  } catch (error: any) {
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