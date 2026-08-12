import { verifyToken } from '../utils/auth';
import express, { Request, Response } from 'express';
import { askAssistant } from '../services/assistantService';

const router = express.Router();

// ORIGINAL endpoint
router.post('/query', async (req: Request, res: Response) => {
  try {
    const decoded = verifyToken(req);
    const { question } = req.body;
    if (!question) return res.status(400).json({ success: false, message: 'Missing question' });
    const answer = await askAssistant(question, decoded.id, false);
    res.json({ success: true, answer });
  } catch (error: any) {
    console.error('Assistant error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// NEW endpoint for voice commands
router.post('/voice-command', async (req: Request, res: Response) => {
  try {
    const decoded = verifyToken(req);
    const { transcript } = req.body;
    if (!transcript) {
      return res.status(400).json({ success: false, message: 'Missing transcript' });
    }
    const answer = await askAssistant(transcript, decoded.id, true);
    res.json({ success: true, answer });
  } catch (error: any) {
    console.error('Voice command error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
