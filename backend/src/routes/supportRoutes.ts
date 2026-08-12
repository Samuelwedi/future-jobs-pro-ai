import express, { Request, Response } from 'express';
import OpenAI from 'openai';
import { verifyToken } from '../utils/auth';
import { pool } from '../config/database';

const router = express.Router();
const agentRoles = new Set(['admin', 'support_agent', 'boss', 'manager']);
const globalAgentRoles = new Set(['admin', 'support_agent']);

type Actor = {
  id: string;
  companyId: string;
  role: string;
  name: string;
};

async function authenticatedActor(req: Request): Promise<Actor> {
  const decoded = verifyToken(req);
  const result = await pool.query(
    `SELECT id, company_id, role,
            TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) AS name
     FROM users
     WHERE id = $1 AND COALESCE(is_active, TRUE) = TRUE`,
    [decoded.id],
  );
  if (!result.rowCount) throw new Error('Authenticated user was not found');
  const user = result.rows[0];
  return {
    id: String(user.id),
    companyId: String(user.company_id || ''),
    role: String(user.role || ''),
    name: String(user.name || '').trim() || 'User',
  };
}

function requireAgent(actor: Actor): void {
  if (!agentRoles.has(actor.role)) {
    const error: any = new Error('Support agent access is required');
    error.status = 403;
    throw error;
  }
}

function statusFor(error: any): number {
  if (Number.isInteger(error?.status)) return error.status;
  if (/token|authenticated/i.test(String(error?.message))) return 401;
  return 500;
}

async function accessibleTicket(actor: Actor, ticketId: string): Promise<any> {
  requireAgent(actor);
  const params: unknown[] = [ticketId];
  let companyClause = '';
  if (!globalAgentRoles.has(actor.role)) {
    params.push(actor.companyId);
    companyClause = ' AND company_id = $2';
  }
  const result = await pool.query(
    `SELECT id, company_id, user_id, user_name, status, created_at
     FROM support_tickets
     WHERE id = $1${companyClause}`,
    params,
  );
  if (!result.rowCount) {
    const error: any = new Error('Support ticket was not found');
    error.status = 404;
    throw error;
  }
  return result.rows[0];
}

router.get('/status/global', async (_req: Request, res: Response) => {
  res.json({ active: false });
});

router.post('/request-human', async (req: Request, res: Response) => {
  try {
    const actor = await authenticatedActor(req);
    if (!actor.companyId) {
      return res.status(400).json({ success: false, message: 'Your user is not assigned to a company' });
    }

    const existing = await pool.query(
      `SELECT id FROM support_tickets
       WHERE company_id = $1 AND user_id = $2 AND status = 'open'
       ORDER BY created_at DESC LIMIT 1`,
      [actor.companyId, actor.id],
    );

    let ticketId: string;
    let created = false;
    if (existing.rowCount) {
      ticketId = String(existing.rows[0].id);
    } else {
      const inserted = await pool.query(
        `INSERT INTO support_tickets (company_id, user_id, user_name, status)
         VALUES ($1, $2, $3, 'open') RETURNING id`,
        [actor.companyId, actor.id, actor.name],
      );
      ticketId = String(inserted.rows[0].id);
      created = true;
    }

    const roomId = `support-ticket-${ticketId}`;
    if (created) {
      const io = req.app.get('io');
      const payload = {
        ticketId,
        userId: actor.id,
        companyId: actor.companyId,
        userName: actor.name,
        roomId,
        status: 'open',
        createdAt: new Date().toISOString(),
      };
      io?.to('agent-dashboard-global').emit('new-ticket', payload);
      io?.to(`agent-dashboard-${actor.companyId}`).emit('new-ticket', payload);
    }

    res.status(created ? 201 : 200).json({ success: true, ticketId, roomId, created });
  } catch (error: any) {
    console.error('Error creating support ticket:', error);
    res.status(statusFor(error)).json({ success: false, message: error.message || 'Internal server error' });
  }
});

router.get('/tickets', async (req: Request, res: Response) => {
  try {
    const actor = await authenticatedActor(req);
    requireAgent(actor);
    const params: unknown[] = [];
    let companyClause = '';
    if (!globalAgentRoles.has(actor.role)) {
      params.push(actor.companyId);
      companyClause = ' AND st.company_id = $1';
    }

    const result = await pool.query(
      `SELECT st.id AS "ticketId", st.user_id AS "userId",
              st.user_name AS "userName", st.company_id AS "companyId",
              st.status, st.created_at AS "createdAt",
              (SELECT message FROM chat_messages
               WHERE room_id = 'support-ticket-' || st.id
               ORDER BY created_at DESC LIMIT 1) AS "lastMessage"
       FROM support_tickets st
       WHERE st.status = 'open'${companyClause}
       ORDER BY st.created_at DESC`,
      params,
    );

    res.json({
      success: true,
      tickets: result.rows.map((row) => ({
        ...row,
        roomId: `support-ticket-${row.ticketId}`,
        lastMessage: row.lastMessage || 'No messages',
      })),
      agent: { id: actor.id, name: actor.name, role: actor.role },
    });
  } catch (error: any) {
    console.error('Error fetching tickets:', error);
    res.status(statusFor(error)).json({ success: false, message: error.message || 'Internal server error' });
  }
});

router.post('/resolve', async (req: Request, res: Response) => {
  try {
    const actor = await authenticatedActor(req);
    const ticketId = String(req.body?.ticketId || '');
    if (!ticketId) return res.status(400).json({ success: false, message: 'Missing ticketId' });
    const ticket = await accessibleTicket(actor, ticketId);

    const result = await pool.query(
      `UPDATE support_tickets
       SET status = 'resolved', resolved_at = NOW(), resolved_by = $1
       WHERE id = $2 AND status = 'open'
       RETURNING id`,
      [actor.id, ticketId],
    );
    if (!result.rowCount) return res.status(409).json({ success: false, message: 'Ticket is already resolved' });

    const io = req.app.get('io');
    io?.to('agent-dashboard-global').emit('ticket-resolved', { ticketId });
    io?.to(`agent-dashboard-${ticket.company_id}`).emit('ticket-resolved', { ticketId });
    io?.to(`room-support-ticket-${ticketId}`).emit('ticket-resolved', { ticketId });
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error resolving ticket:', error);
    res.status(statusFor(error)).json({ success: false, message: error.message || 'Internal server error' });
  }
});

router.post('/tickets/:ticketId/suggest', async (req: Request, res: Response) => {
  try {
    const actor = await authenticatedActor(req);
    const ticketId = String(req.params.ticketId || '');
    const ticket = await accessibleTicket(actor, ticketId);
    const roomId = `support-ticket-${ticketId}`;

    const [messagesRes, kbRes] = await Promise.all([
      pool.query(
        `SELECT sender_id, sender_name, message, created_at
         FROM chat_messages WHERE room_id = $1
         ORDER BY created_at ASC LIMIT 100`,
        [roomId],
      ),
      pool.query(
        `SELECT question, answer FROM knowledge_base
         WHERE company_id = $1 OR company_id IS NULL LIMIT 100`,
        [ticket.company_id],
      ),
    ]);

    const history = messagesRes.rows
      .map((msg) => `${msg.sender_name || (String(msg.sender_id) === String(ticket.user_id) ? 'Customer' : 'Agent')}: ${msg.message}`)
      .join('\n') || 'No previous messages.';
    const knowledge = kbRes.rows
      .map((row) => `Q: ${row.question}\nA: ${row.answer}`)
      .join('\n') || 'No company-specific knowledge-base entries are available.';

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) return res.status(503).json({ success: false, message: 'OpenAI API key is not configured' });
    const openai = new OpenAI({ apiKey });
    const response = await openai.responses.create({
      model: process.env.OPENAI_SUPPORT_MODEL?.trim() || process.env.OPENAI_LUCY_MODEL?.trim() || 'gpt-5',
      instructions: `Draft a concise, professional customer-support reply for Future Jobs Pro AI.
Use only the supplied conversation and knowledge base. Do not invent policies, account facts, or completed actions.
Ask a clear follow-up question when required. Return only the proposed reply and never claim to be the human agent.`,
      input: `Company knowledge:\n${knowledge}\n\nCustomer: ${ticket.user_name || 'User'}\nConversation:\n${history}`,
      reasoning: { effort: 'low' },
      max_output_tokens: 500,
      store: false,
    });
    const reply = response.output_text?.trim();
    if (!reply) throw new Error('The AI service returned an empty suggestion');
    res.json({ success: true, reply, model: response.model });
  } catch (error: any) {
    console.error('Error generating support suggestion:', error);
    res.status(statusFor(error)).json({ success: false, message: error.message || 'Internal server error' });
  }
});

export default router;
