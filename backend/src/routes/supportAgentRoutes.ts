import express, { NextFunction, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database';

const router = express.Router();
type AgentRole = 'agent' | 'supervisor' | 'owner';
type Agent = { id: string; email: string; firstName: string; lastName: string; role: AgentRole };
type AgentRequest = Request & { supportAgent?: Agent };

function secret(): string {
  const value = process.env.SUPPORT_AGENT_JWT_SECRET?.trim();
  if (!value) throw new Error('SUPPORT_AGENT_JWT_SECRET is not configured');
  return value;
}

function tokenFrom(req: Request): string {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) throw Object.assign(new Error('Agent authentication is required'), { status: 401 });
  return header.slice(7);
}

async function authenticateAgent(req: AgentRequest, res: Response, next: NextFunction) {
  try {
    const decoded = jwt.verify(tokenFrom(req), secret()) as any;
    if (decoded.tokenType !== 'platform_support_agent' || !decoded.agentId) throw new Error('Invalid agent token');
    const result = await pool.query(
      `SELECT id, email, first_name, last_name, role
       FROM platform_support_agents WHERE id = $1 AND is_active = TRUE`,
      [decoded.agentId],
    );
    if (!result.rowCount) throw new Error('Agent account is disabled or unavailable');
    const row = result.rows[0];
    req.supportAgent = {
      id: String(row.id), email: row.email, firstName: row.first_name,
      lastName: row.last_name, role: row.role,
    };
    next();
  } catch (error: any) {
    res.status(401).json({ success: false, message: error.message || 'Agent authentication failed' });
  }
}

function requireManager(req: AgentRequest, res: Response, next: NextFunction) {
  if (!req.supportAgent || !['owner', 'supervisor'].includes(req.supportAgent.role)) {
    return res.status(403).json({ success: false, message: 'Support supervisor access is required' });
  }
  next();
}

function publicAgent(agent: Agent) {
  return { id: agent.id, email: agent.email, firstName: agent.firstName, lastName: agent.lastName, role: agent.role };
}

router.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password are required' });
    const result = await pool.query(
      `SELECT id, email, password_hash, first_name, last_name, role
       FROM platform_support_agents WHERE LOWER(email) = $1 AND is_active = TRUE`,
      [email],
    );
    const row = result.rows[0];
    if (!row || !(await bcrypt.compare(password, row.password_hash))) {
      return res.status(401).json({ success: false, message: 'Invalid agent email or password' });
    }
    const agent: Agent = { id: String(row.id), email: row.email, firstName: row.first_name, lastName: row.last_name, role: row.role };
    const token = jwt.sign({ tokenType: 'platform_support_agent', agentId: agent.id, role: agent.role }, secret(), { expiresIn: '8h' });
    await pool.query('UPDATE platform_support_agents SET last_login_at = NOW() WHERE id = $1', [agent.id]);
    res.json({ success: true, token, agent: publicAgent(agent) });
  } catch (error: any) {
    res.status(/not configured/i.test(error.message) ? 503 : 500).json({ success: false, message: error.message });
  }
});

router.get('/me', authenticateAgent, (req: AgentRequest, res: Response) => {
  res.json({ success: true, agent: publicAgent(req.supportAgent!) });
});

router.get('/agents', authenticateAgent, requireManager, async (_req, res) => {
  const result = await pool.query(
    `SELECT id, email, first_name AS "firstName", last_name AS "lastName", role,
            is_active AS "isActive", last_login_at AS "lastLoginAt", created_at AS "createdAt"
     FROM platform_support_agents ORDER BY created_at DESC`,
  );
  res.json({ success: true, agents: result.rows });
});

router.post('/agents', authenticateAgent, requireManager, async (req: AgentRequest, res: Response) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const firstName = String(req.body?.firstName || '').trim();
    const lastName = String(req.body?.lastName || '').trim();
    const password = String(req.body?.password || '');
    const role = String(req.body?.role || 'agent') as AgentRole;
    if (!email || !firstName || !lastName || password.length < 12) {
      return res.status(400).json({ success: false, message: 'Name, email, and a password of at least 12 characters are required' });
    }
    if (!['agent', 'supervisor'].includes(role) || (role === 'supervisor' && req.supportAgent!.role !== 'owner')) {
      return res.status(403).json({ success: false, message: 'You cannot create that agent role' });
    }
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO platform_support_agents
         (email, password_hash, first_name, last_name, role, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, first_name AS "firstName", last_name AS "lastName", role, is_active AS "isActive"`,
      [email, hash, firstName, lastName, role, req.supportAgent!.id],
    );
    res.status(201).json({ success: true, agent: result.rows[0] });
  } catch (error: any) {
    res.status(error.code === '23505' ? 409 : 500).json({ success: false, message: error.code === '23505' ? 'That agent email is already in use' : error.message });
  }
});

router.patch('/agents/:agentId', authenticateAgent, requireManager, async (req: AgentRequest, res: Response) => {
  const agentId = String(req.params.agentId);
  const target = await pool.query('SELECT role FROM platform_support_agents WHERE id = $1', [agentId]);
  if (!target.rowCount) return res.status(404).json({ success: false, message: 'Agent was not found' });
  if (target.rows[0].role === 'owner' && req.supportAgent!.id !== agentId) {
    return res.status(403).json({ success: false, message: 'Another owner account cannot be changed here' });
  }
  const isActive = typeof req.body?.isActive === 'boolean' ? req.body.isActive : null;
  const firstName = req.body?.firstName ? String(req.body.firstName).trim() : null;
  const lastName = req.body?.lastName ? String(req.body.lastName).trim() : null;
  await pool.query(
    `UPDATE platform_support_agents SET
       is_active = COALESCE($1, is_active), first_name = COALESCE($2, first_name),
       last_name = COALESCE($3, last_name), updated_at = NOW() WHERE id = $4`,
    [isActive, firstName, lastName, agentId],
  );
  res.json({ success: true });
});

router.post('/agents/:agentId/reset-password', authenticateAgent, requireManager, async (req: AgentRequest, res: Response) => {
  const password = String(req.body?.password || '');
  if (password.length < 12) return res.status(400).json({ success: false, message: 'Password must contain at least 12 characters' });
  const hash = await bcrypt.hash(password, 12);
  const result = await pool.query(
    `UPDATE platform_support_agents SET password_hash = $1, updated_at = NOW()
     WHERE id = $2 AND role <> 'owner' RETURNING id`,
    [hash, req.params.agentId],
  );
  if (!result.rowCount) return res.status(404).json({ success: false, message: 'Agent was not found or cannot be reset' });
  res.json({ success: true });
});

router.get('/tickets', authenticateAgent, async (req: AgentRequest, res: Response) => {
  const result = await pool.query(
    `SELECT st.id AS "ticketId", st.company_id AS "companyId", st.user_id AS "userId",
            st.user_name AS "userName", st.status, st.priority, st.lucy_summary AS "lucySummary",
            st.assigned_agent_id AS "assignedAgentId", st.created_at AS "createdAt",
            psa.first_name || ' ' || psa.last_name AS "assignedAgentName",
            (SELECT message FROM platform_support_messages
             WHERE ticket_id = st.id::text ORDER BY created_at DESC LIMIT 1) AS "lastMessage"
     FROM support_tickets st
     LEFT JOIN platform_support_agents psa ON psa.id = st.assigned_agent_id
     WHERE st.status = 'open'
       AND (st.assigned_agent_id IS NULL OR st.assigned_agent_id = $1 OR $2 IN ('owner', 'supervisor'))
     ORDER BY CASE st.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, st.created_at ASC`,
    [req.supportAgent!.id, req.supportAgent!.role],
  );
  res.json({ success: true, tickets: result.rows });
});

router.post('/tickets/:ticketId/accept', authenticateAgent, async (req: AgentRequest, res: Response) => {
  const result = await pool.query(
    `UPDATE support_tickets SET assigned_agent_id = $1, accepted_at = NOW()
     WHERE id::text = $2 AND status = 'open'
       AND (assigned_agent_id IS NULL OR assigned_agent_id = $1)
     RETURNING id`,
    [req.supportAgent!.id, req.params.ticketId],
  );
  if (!result.rowCount) return res.status(409).json({ success: false, message: 'This ticket was accepted by another agent' });
  req.app.get('io')?.to(`room-support-ticket-${req.params.ticketId}`).emit('agent-joined', {
    agentName: `${req.supportAgent!.firstName} ${req.supportAgent!.lastName}`,
  });
  res.json({ success: true });
});

router.get('/tickets/:ticketId/messages', authenticateAgent, async (req: AgentRequest, res: Response) => {
  const access = await pool.query(
    `SELECT id FROM support_tickets WHERE id::text = $1
       AND (assigned_agent_id IS NULL OR assigned_agent_id = $2 OR $3 IN ('owner', 'supervisor'))`,
    [req.params.ticketId, req.supportAgent!.id, req.supportAgent!.role],
  );
  if (!access.rowCount) return res.status(403).json({ success: false, message: 'Ticket access is not available' });
  const messages = await pool.query(
    `SELECT id, sender_type AS "senderType", sender_name AS "senderName", message, created_at AS "createdAt"
     FROM platform_support_messages WHERE ticket_id = $1 ORDER BY created_at ASC`,
    [req.params.ticketId],
  );
  res.json({ success: true, messages: messages.rows });
});

router.post('/tickets/:ticketId/reply', authenticateAgent, async (req: AgentRequest, res: Response) => {
  const message = String(req.body?.message || '').trim();
  if (!message || message.length > 5000) return res.status(400).json({ success: false, message: 'A reply of 1â€“5000 characters is required' });
  const ticket = await pool.query(
    `SELECT id FROM support_tickets WHERE id::text = $1 AND assigned_agent_id = $2 AND status = 'open'`,
    [req.params.ticketId, req.supportAgent!.id],
  );
  if (!ticket.rowCount) return res.status(403).json({ success: false, message: 'Accept this ticket before replying' });
  const senderName = `${req.supportAgent!.firstName} ${req.supportAgent!.lastName}`;
  const inserted = await pool.query(
    `INSERT INTO platform_support_messages (ticket_id, support_agent_id, sender_type, sender_name, message)
     VALUES ($1, $2, 'agent', $3, $4)
     RETURNING id, sender_type AS "senderType", sender_name AS "senderName", message, created_at AS "createdAt"`,
    [req.params.ticketId, req.supportAgent!.id, senderName, message],
  );
  req.app.get('io')?.to(`room-support-ticket-${req.params.ticketId}`).emit('support-message', inserted.rows[0]);
  res.status(201).json({ success: true, message: inserted.rows[0] });
});

router.post('/tickets/:ticketId/resolve', authenticateAgent, async (req: AgentRequest, res: Response) => {
  const result = await pool.query(
    `UPDATE support_tickets SET status = 'resolved', resolved_at = NOW()
     WHERE id::text = $1 AND assigned_agent_id = $2 AND status = 'open' RETURNING id`,
    [req.params.ticketId, req.supportAgent!.id],
  );
  if (!result.rowCount) return res.status(403).json({ success: false, message: 'Only the assigned agent can resolve this ticket' });
  req.app.get('io')?.to(`room-support-ticket-${req.params.ticketId}`).emit('ticket-resolved', { ticketId: req.params.ticketId });
  res.json({ success: true });
});

export default router;
