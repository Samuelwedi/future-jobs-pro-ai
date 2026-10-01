import express, { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database';
import { collectDiagnosticSnapshot, reportSystemIncident } from '../services/lucyReliabilityService';
import { verifyToken } from '../utils/auth';

const router = express.Router();
type AgentRequest = Request & { supportAgent?: { id: string; role: string } };

async function authenticateAgent(req: AgentRequest, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) throw new Error('Agent authentication is required');
    const secret = process.env.SUPPORT_AGENT_JWT_SECRET?.trim();
    if (!secret) return res.status(503).json({ success: false, message: 'Support agent authentication is not configured' });
    const decoded = jwt.verify(header.slice(7), secret) as any;
    if (decoded.tokenType !== 'platform_support_agent' || !decoded.agentId) throw new Error('Invalid agent token');
    const result = await pool.query('SELECT id, role FROM platform_support_agents WHERE id = $1 AND is_active = TRUE', [decoded.agentId]);
    if (!result.rowCount) throw new Error('Agent account is disabled or unavailable');
    req.supportAgent = { id: String(result.rows[0].id), role: String(result.rows[0].role) };
    next();
  } catch (error: any) {
    res.status(401).json({ success: false, message: error.message || 'Agent authentication failed' });
  }
}

router.post('/client-events', async (req, res) => {
  try {
    const actor = verifyToken(req);
    const component = String(req.body?.component || 'client').slice(0, 80);
    const summary = String(req.body?.summary || 'Client error').slice(0, 500);
    const severity = ['info', 'warning', 'critical'].includes(req.body?.severity) ? req.body.severity : 'warning';
    const incident = await reportSystemIncident({
      component, severity, summary,
      details: { userId: actor.id, companyId: actor.companyId, context: req.body?.context || {} },
    });
    res.status(202).json({ success: true, incidentId: incident.id });
  } catch (error: any) {
    res.status(/token/i.test(error.message) ? 401 : 500).json({ success: false, message: 'Unable to record diagnostic event' });
  }
});

router.get('/incidents', authenticateAgent, async (req: AgentRequest, res) => {
  const status = String(req.query.status || 'open');
  const result = await pool.query(
    `SELECT id, component, severity, summary, details, status, occurrences,
            first_seen_at AS "firstSeenAt", last_seen_at AS "lastSeenAt"
     FROM system_incidents WHERE ($1 = 'all' OR status = $1)
     ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, last_seen_at DESC LIMIT 250`,
    [status],
  );
  res.json({ success: true, incidents: result.rows });
});

router.post('/diagnostics', authenticateAgent, async (_req, res) => {
  try { res.json({ success: true, ...(await collectDiagnosticSnapshot()) }); }
  catch { res.status(503).json({ success: false, message: 'Diagnostics are unavailable' }); }
});

router.patch('/incidents/:id', authenticateAgent, async (req: AgentRequest, res) => {
  const status = String(req.body?.status || '');
  if (!['acknowledged', 'resolved'].includes(status)) return res.status(400).json({ success: false, message: 'Invalid incident status' });
  const result = await pool.query(
    `UPDATE system_incidents SET status = $1,
       acknowledged_by = CASE WHEN $1 = 'acknowledged' THEN $2 ELSE acknowledged_by END,
       resolved_by = CASE WHEN $1 = 'resolved' THEN $2 ELSE resolved_by END,
       resolved_at = CASE WHEN $1 = 'resolved' THEN NOW() ELSE resolved_at END
     WHERE id = $3 RETURNING id`,
    [status, req.supportAgent!.id, req.params.id],
  );
  if (!result.rowCount) return res.status(404).json({ success: false, message: 'Incident not found' });
  res.json({ success: true });
});

export default router;
