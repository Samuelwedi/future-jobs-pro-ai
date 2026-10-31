import {mountSupportMedia,supportMessageQuery} from '../services/supportMedia';
import express, { Request, Response } from 'express';
import {lucyInferenceReady,lucyResponse} from '../services/lucyInference';
import { verifyToken } from '../utils/auth';
import { pool } from '../config/database';

const router = express.Router();

async function customer(req: Request) {
  const decoded = verifyToken(req);
  const result = await pool.query(
    `SELECT id, company_id, TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) AS name
     FROM users WHERE id = $1 AND COALESCE(is_active, TRUE) = TRUE`,
    [decoded.id],
  );
  if (!result.rowCount) throw Object.assign(new Error('Authenticated customer was not found'), { status: 401 });
  return { id: String(result.rows[0].id), companyId: String(result.rows[0].company_id || ''), name: result.rows[0].name || 'Customer' };
}

async function ownedTicket(userId: string, ticketId: string) {
  const result = await pool.query(
    `SELECT id, status, assigned_agent_id FROM support_tickets WHERE id::text = $1 AND user_id = $2`,
    [ticketId, userId],
  );
  if (!result.rowCount) throw Object.assign(new Error('Support ticket was not found'), { status: 404 });
  return result.rows[0];
}

function fail(res: Response, error: any) {
  res.status(error.status || (/token|authenticated/i.test(error.message) ? 401 : 500))
    .json({ success: false, message: error.message || 'Support service failed' });
}

router.get('/status/global', (_req, res) => res.json({ active: true }));

router.get('/active', async (req: Request, res: Response) => {
  try {
    const actor = await customer(req);
    const result = await pool.query(
      `SELECT id, status, assigned_agent_id AS "assignedAgentId"
       FROM support_tickets WHERE user_id = $1 AND status = 'open'
       ORDER BY created_at DESC LIMIT 1`,
      [actor.id],
    );
    if (!result.rowCount) return res.json({ success: true, ticket: null });
    res.json({ success: true, ticket: { ...result.rows[0], roomId: `support-ticket-${result.rows[0].id}` } });
  } catch (error: any) { fail(res, error); }
});

router.post('/request-human', async (req: Request, res: Response) => {
  try {
    const actor = await customer(req);
    if (!actor.companyId) return res.status(400).json({ success: false, message: 'Your account is not assigned to a company' });
    const lucyMessages = Array.isArray(req.body?.lucyMessages) ? req.body.lucyMessages.slice(-20) : [];
    const summary = String(req.body?.lucySummary || '').trim().slice(0, 8000);
    const existing = await pool.query(
      `SELECT id FROM support_tickets WHERE user_id = $1 AND status = 'open'
       ORDER BY created_at DESC LIMIT 1`, [actor.id],
    );
    let ticketId: string;
    let created = false;
    if (existing.rowCount) ticketId = String(existing.rows[0].id);
    else {
      const inserted = await pool.query(
        `INSERT INTO support_tickets (company_id, user_id, user_name, status, lucy_summary)
         VALUES ($1, $2, $3, 'open', $4) RETURNING id`,
        [actor.companyId, actor.id, actor.name, summary || null],
      );
      ticketId = String(inserted.rows[0].id);
      created = true;
      for (const item of lucyMessages) {
        const message = String(item?.message || '').trim().slice(0, 5000);
        if (!message) continue;
        const isLucy = Boolean(item?.is_ai) || String(item?.sender_id) === 'lucy-ai';
        await pool.query(
          `INSERT INTO platform_support_messages
             (ticket_id, customer_user_id, sender_type, sender_name, message)
           VALUES ($1, $2, $3, $4, $5)`,
          [ticketId, isLucy ? null : actor.id, isLucy ? 'lucy' : 'customer', isLucy ? 'Lucy' : actor.name, message],
        );
      }
      req.app.get('io')?.to('platform-support-queue').emit('new-ticket', { ticketId, userName: actor.name, status: 'open' });
    }
    res.status(created ? 201 : 200).json({ success: true, ticketId, roomId: `support-ticket-${ticketId}`, created });
  } catch (error: any) { fail(res, error); }
});

router.get('/tickets/:ticketId/messages', async (req: Request, res: Response) => {
  try {
    const actor = await customer(req);
    const ticket = await ownedTicket(actor.id, String(req.params.ticketId));
    const messages = await pool.query(
      supportMessageQuery, [req.params.ticketId],
    );
    res.json({ success: true, status: ticket.status, agentActive: Boolean(ticket.assigned_agent_id), messages: messages.rows });
  } catch (error: any) { fail(res, error); }
});

router.post('/tickets/:ticketId/messages', async (req: Request, res: Response) => {
  try {
    const actor = await customer(req);
    const ticket = await ownedTicket(actor.id, String(req.params.ticketId));
    if (ticket.status !== 'open') return res.status(409).json({ success: false, message: 'This support ticket is closed' });
    const message = String(req.body?.message || '').trim();
    if (!message || message.length > 5000) return res.status(400).json({ success: false, message: 'A message of 1â€“5000 characters is required' });
    const inserted = await pool.query(
      `INSERT INTO platform_support_messages (ticket_id, customer_user_id, sender_type, sender_name, message)
       VALUES ($1, $2, 'customer', $3, $4)
       RETURNING id, sender_type AS "senderType", sender_name AS "senderName", message, created_at AS "createdAt"`,
      [req.params.ticketId, actor.id, actor.name, message],
    );
    req.app.get('io')?.to('platform-support-queue').emit('support-message', { ticketId: req.params.ticketId, ...inserted.rows[0] });
    res.status(201).json({ success: true, message: inserted.rows[0] });
  } catch (error: any) { fail(res, error); }
});

router.post('/tickets/:ticketId/suggest', async (req: Request, res: Response) => {
  let authenticated=false;
  try {
    const actor = await customer(req);authenticated=true;
    await ownedTicket(actor.id, String(req.params.ticketId));
    const messages = await pool.query(
      `SELECT sender_name, message FROM platform_support_messages WHERE ticket_id = $1 ORDER BY created_at ASC LIMIT 100`,
      [req.params.ticketId],
    );
    if(!lucyInferenceReady())return res.status(503).json({success:false,message:'Lucy is temporarily unavailable. You can still message a support agent.'});
    const response=await lucyResponse({instructions:'You are Lucy, Future Jobs Pro AI customer support. Resolve product questions safely. Never claim account changes occurred. If human action is required, say a support agent will continue.',input:[{role:'user',content:messages.rows.map(m=>`${m.sender_name}: ${m.message}`).join('\n')}],maxOutputTokens:400});
    res.json({ success: true, reply: response.output_text?.trim() || 'A support agent will continue helping you.' });
  } catch (error:any) {if(authenticated)res.status(503).json({success:false,message:'Lucy is temporarily unavailable. You can still message your support agent.'});else fail(res,error);}
});

mountSupportMedia(router,async(req,ticketId,write)=>{
 const actor=await customer(req);const ticket=await ownedTicket(actor.id,ticketId);
 if(write&&ticket.status!=='open')throw Object.assign(new Error('This ticket is closed'),{status:409});
 return {id:actor.id,name:actor.name,type:'customer'};
},(req:any,res:any,next:any)=>{try{verifyToken(req);next();}catch{res.status(401).json({success:false,message:'Sign in to use support media'});}});
export default router;
