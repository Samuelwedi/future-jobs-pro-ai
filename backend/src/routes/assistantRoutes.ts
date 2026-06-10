import { verifyToken } from '../utils/auth';
import express, { Request, Response } from 'express';
import { askAssistant } from '../services/assistantService';

const router = express.Router();

router.post('/query', async (req: Request, res: Response) => {
  try {
    const { question, userId } = req.body;
    if (!question || !userId) return res.status(400).json({ success: false, message: 'Missing question or userId' });
    const answer = await askAssistant(question, userId);
    res.json({ success: true, answer });
  } catch (error: any) {
    console.error('Assistant error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;