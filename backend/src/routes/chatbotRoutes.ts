import express, { Request, Response } from 'express';
import { verifyToken } from '../utils/auth';
import { askAssistant } from '../services/assistantService';

const router = express.Router();

// POST /api/chatbot/query
router.post('/query', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const decoded = verifyToken(req);
    const { question } = req.body;
    if (!question) {
      return res.status(400).json({ success: false, message: 'Question required' });
    }

    const answer = await askAssistant(question, decoded.id);
    res.json({ success: true, answer });
  } catch (error: any) {
    console.error('Chatbot error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;