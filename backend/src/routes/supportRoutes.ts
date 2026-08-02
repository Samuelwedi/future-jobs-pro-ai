import express, { Request, Response } from 'express';
import { verifyToken } from '../utils/auth';
import { pool } from '../config/database';

const router = express.Router();

// ─── GET /support/status/global ───────────────────────────────────
router.get('/status/global', async (req, res) => {
  res.json({ active: false });
});

// ─── POST /support/request-human ──────────────────────────────────
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

    // Emit new ticket to agents
    const io = req.app.get('io');
    if (io) {
      io.to('agent-dashboard').emit('new-ticket', {
        ticketId,
        userId,
        companyId,
        userName: userName || 'User',
        roomId,
        status: 'open',
        createdAt: new Date().toISOString(),
      });
    }

    res.json({ success: true, ticketId, roomId });
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── GET /support/tickets ──────────────────────────────────────────
router.get('/tickets', async (req: Request, res: Response) => {
  try {
    const decoded = verifyToken(req);
    if (!decoded) return res.status(401).json({ success: false, message: 'Unauthorized' });

    // Only allow bosses/managers to view tickets
    const userRes = await pool.query('SELECT role FROM users WHERE id = $1', [decoded.id]);
    if (!['boss', 'manager'].includes(userRes.rows[0]?.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    // Get all open tickets with the latest message from chat_messages
    const result = await pool.query(`
      SELECT 
        st.id AS "ticketId",
        st.user_id AS "userId",
        st.user_name AS "userName",
        st.company_id AS "companyId",
        st.status,
        st.created_at AS "createdAt",
        (SELECT message FROM chat_messages 
         WHERE room_id = 'support-ticket-' || st.id 
         ORDER BY created_at DESC LIMIT 1) AS "lastMessage"
      FROM support_tickets st
      WHERE st.status = 'open'
      ORDER BY st.created_at DESC
    `);

    const tickets = result.rows.map(row => ({
      ...row,
      roomId: `support-ticket-${row.ticketId}`,
      lastMessage: row.lastMessage || 'No messages',
    }));

    res.json({ success: true, tickets });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── POST /support/resolve ──────────────────────────────────────────
router.post('/resolve', async (req: Request, res: Response) => {
  try {
    const decoded = verifyToken(req);
    if (!decoded) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { ticketId } = req.body;
    if (!ticketId) {
      return res.status(400).json({ success: false, message: 'Missing ticketId' });
    }

    // Update ticket status
    await pool.query(
      `UPDATE support_tickets SET status = 'resolved', resolved_at = NOW(), resolved_by = $1
       WHERE id = $2 AND status = 'open'`,
      [decoded.id, ticketId]
    );

    // Emit event to all agents
    const io = req.app.get('io');
    if (io) {
      io.to('agent-dashboard').emit('ticket-resolved', { ticketId });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error resolving ticket:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── POST /api/support/tickets/:ticketId/suggest ──────────────
router.post('/tickets/:ticketId/suggest', async (req: Request, res: Response) => {
  try {
    const decoded = verifyToken(req);
    if (!decoded) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { ticketId } = req.params;
    if (!ticketId) {
      return res.status(400).json({ success: false, message: 'Missing ticketId' });
    }

    // 1. Fetch ticket details
    const ticketRes = await pool.query(
      `SELECT id, company_id, user_id, user_name, status FROM support_tickets WHERE id = $1`,
      [ticketId]
    );
    if (ticketRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    const ticket = ticketRes.rows[0];
    const roomId = `support-ticket-${ticketId}`;

    // 2. Fetch conversation history
    const messagesRes = await pool.query(
      `SELECT sender_id, sender_name, message, created_at
       FROM chat_messages
       WHERE room_id = $1
       ORDER BY created_at ASC`,
      [roomId]
    );
    const conversation = messagesRes.rows;

    // 3. Fetch knowledge base for this company
    const kbRes = await pool.query(
      `SELECT question, answer FROM knowledge_base WHERE company_id = $1 OR company_id IS NULL`,
      [ticket.company_id]
    );
    const knowledge = kbRes.rows.map(row => `Q: ${row.question}\nA: ${row.answer}`).join('\n');

    // 4. Build prompt
    let historyText = conversation.map(msg => {
      const sender = msg.sender_name || (msg.sender_id === ticket.user_id ? 'Customer' : 'Agent');
      return `${sender}: ${msg.message}`;
    }).join('\n');

    // If no conversation, use a fallback
    if (!historyText) {
      historyText = 'No previous messages.';
    }

    const prompt = `
You are a senior customer support agent for Future Jobs Pro AI.

Company Knowledge:
${knowledge || 'No specific policy documents found.'}

Ticket ID: ${ticketId}
Customer: ${ticket.user_name || 'User'}

Conversation so far:
${historyText}

Please write a professional, helpful reply to the customer. Keep it concise and clear.
If you need more information, politely ask for it.
Do not mention that you are an AI.
`;

    // 5. Call OpenAI
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ success: false, message: 'OpenAI API key not configured' });
    }

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a helpful support agent. Generate a draft reply for the customer.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    const data = (await openaiRes.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
        };
      }>;
    };
    const reply = data.choices?.[0]?.message?.content ?? "I'm sorry, I couldn't generate a reply. Please try again.";

    res.json({ success: true, reply });
  } catch (error) {
    console.error('Error generating AI suggestion:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
