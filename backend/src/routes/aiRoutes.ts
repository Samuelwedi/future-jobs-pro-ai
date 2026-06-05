import express, { Request, Response } from 'express';
import { pool } from '../config/database';

const router = express.Router();

// GET /api/ai/suggestions/:userId – AI suggestions for a user
router.get('/suggestions/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const result = await pool.query(
      'SELECT * FROM ai_insights WHERE target_user_id = $1 AND is_read = false ORDER BY created_at DESC LIMIT 5',
      [userId]
    );
    res.json({ success: true, suggestions: result.rows });
  } catch (error: any) {
    console.error('Failed to load AI suggestions:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/ai/event – record an AI event
router.post('/event', async (req: Request, res: Response) => {
  try {
    const { userId, eventType, eventData, latitude, longitude, deviceInfo } = req.body;
    if (!userId || !eventType) {
      return res.status(400).json({ success: false, message: 'Missing userId or eventType' });
    }

    await pool.query(
      `INSERT INTO user_events (user_id, event_type, event_data, location_lat, location_lng, device_info, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, '{}')`,
      [
        userId,
        eventType,
        JSON.stringify(eventData || {}),
        latitude || null,
        longitude || null,
        JSON.stringify(deviceInfo || {})
      ]
    );
    res.json({ success: true });
  } catch (error: any) {
    console.error('Failed to record AI event:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;