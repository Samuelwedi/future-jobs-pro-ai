import express, { Request, Response } from 'express';
import { verifyToken } from '../utils/auth';
import { pool } from '../config/database';

const router = express.Router();

// GET /support/status/global – check if any agent is active (optional)
router.get('/status/global', async (req, res) => {
  // For simplicity, return false. You can track this with a flag in memory/DB.
  res.json({ active: false });
});

// POST /support/request-human – create a ticket and emit to agents
router.post('/request-human', async (req: Request, res: Response) => {
  try {
    const { userId, companyId, userName } = req.body;
    if (!userId || !companyId) {
      return res.status(400).json({ success: false, message: 'Missing userId or companyId' });
    }

    // Insert ticket
    const result = await pool.query(
      `INSERT INTO support_tickets (company_id, user_id, user_name, status)
       VALUES ($1, $2, $3, 'open') RETURNING id`,
      [companyId, userId, userName || 'User']
    );
    const ticketId = result.rows[0].id;
    const roomId = `support-ticket-${ticketId}`;

    // Emit new ticket to all agents (they listen on 'agent-dashboard')
    const io = req.app.get('io');
    io.to('agent-dashboard').emit('new-ticket', {
      ticketId,
      userId,
      companyId,
      userName: userName || 'User',
      roomId,
      timestamp: new Date().toISOString(),
    });

    res.json({ success: true, ticketId, roomId });
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;