import express, { Request, Response } from 'express';
import { clockIn, clockOut, getTimeEntries, manualTimeEntry, updateTimeEntry } from '../services/timeEntryService';

const router = express.Router();

router.post('/clock-in', async (req: Request, res: Response) => {
  try {
    const { userId, projectId, latitude, longitude } = req.body;
    if (!userId || !projectId) return res.status(400).json({ success: false, message: 'Missing userId or projectId' });
    const entry = await clockIn(userId, projectId, latitude || 0, longitude || 0);
    res.json({ success: true, timeEntryId: entry.id, clockIn: entry.clock_in });
  } catch (error: any) { res.status(500).json({ success: false, message: error.message }); }
});

router.post('/clock-out', async (req: Request, res: Response) => {
  try {
    const { timeEntryId, userId, latitude, longitude } = req.body;
    if (!timeEntryId || !userId) return res.status(400).json({ success: false, message: 'Missing timeEntryId or userId' });
    const entry = await clockOut(userId, timeEntryId, latitude || 0, longitude || 0);
    if (!entry) return res.status(404).json({ success: false, message: 'Active time entry not found' });
    res.json({ success: true, clockOut: entry.clock_out });
  } catch (error: any) { res.status(500).json({ success: false, message: error.message }); }
});

// GET /api/time-entries?userId=xxx&start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/', async (req: Request, res: Response) => {
  try {
    const { userId, start, end } = req.query;
    if (!userId || !start || !end) return res.status(400).json({ success: false, message: 'userId, start, and end are required' });
    const entries = await getTimeEntries(userId as string, start as string, end as string);
    res.json({ success: true, entries });
  } catch (error: any) { res.status(500).json({ success: false, message: error.message }); }
});

// POST /api/time-entries/manual – add manual time entry
router.post('/manual', async (req: Request, res: Response) => {
  try {
    const { userId, projectId, clockIn, clockOut, breakMinutes, notes, createdBy } = req.body;
    if (!userId || !projectId || !clockIn || !clockOut || !createdBy) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    const entry = await manualTimeEntry(userId, projectId, clockIn, clockOut, breakMinutes || 0, notes || '', createdBy);
    res.json({ success: true, entry });
  } catch (error: any) { res.status(500).json({ success: false, message: error.message }); }
});

// PUT /api/time-entries/:id – edit a time entry
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const updates = req.body;
    const entry = await updateTimeEntry(req.params.id as string, updates);
    res.json({ success: true, entry });
  } catch (error: any) { res.status(500).json({ success: false, message: error.message }); }
});

export default router;