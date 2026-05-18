import express, { Request, Response } from 'express';
import { clockIn, clockOut } from '../services/timeEntryService';

const router = express.Router();

router.post('/clock-in', async (req: Request, res: Response) => {
  try {
    const { userId, projectId, latitude, longitude } = req.body;
    if (!userId || !projectId) {
      return res.status(400).json({ success: false, message: 'Missing userId or projectId' });
    }
    const entry = await clockIn(userId, projectId, latitude || 0, longitude || 0);
    res.json({ success: true, timeEntryId: entry.id, clockIn: entry.clock_in });
  } catch (error: any) {
    console.error('Clock-in error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/clock-out', async (req: Request, res: Response) => {
  try {
    const { timeEntryId, latitude, longitude } = req.body;
    if (!timeEntryId) {
      return res.status(400).json({ success: false, message: 'Missing timeEntryId' });
    }
    const entry = await clockOut(req.body.userId, timeEntryId, latitude || 0, longitude || 0);
    if (!entry) {
      return res.status(404).json({ success: false, message: 'Active time entry not found' });
    }
    res.json({ success: true, clockOut: entry.clock_out });
  } catch (error: any) {
    console.error('Clock-out error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;