import {commercialPdf} from '../services/commercialPdf';
import Big from 'big.js';
import {validDate} from '../services/payPeriodCalendar';
import {validateInvoiceHeader,validateInvoiceLines,lockInvoiceLabor} from '../services/invoiceValidation';
import {createHash} from 'crypto';
import express, { Request, Response } from 'express';
import { pool } from '../config/database';
import { verifyToken } from '../utils/auth';
import { companyActor,manages } from '../middleware/companyActor';

const router = express.Router();
router.use(companyActor);
router.use((_req,res,next)=>{if(!manages(res.locals.actor))return res.status(403).json({message:'Manager access required'});next();});

// ─── Helper ───────────────────────────────────────────────────────
const getCompanyId = async (req: Request): Promise<string | null> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = verifyToken(req);
    const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
    return userRes.rows[0]?.company_id || null;
  } catch { return null; }
};

// ─── GET /api/invoices ───────────────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { status, clientId, start, end, limit = 50, offset = 0 } = req.query;
    let query = `
      SELECT i.*,
             p.name as project_name,
             u.first_name || ' ' || u.last_name as client_name,
             (SELECT COUNT(*) FROM payments WHERE invoice_id = i.id) as payment_count
      FROM invoices i
      LEFT JOIN projects p ON i.project_id = p.id
      LEFT JOIN users u ON i.client_id = u.id
      WHERE i.company_id = $1
    `;
    const params: any[] = [companyId];
    let paramCount = 1;

    if (status) { query += ` AND i.status = $${++paramCount}`; params.push(status); }
    if (clientId) { query += ` AND i.client_id = $${++paramCount}`; params.push(clientId); }
    if (start) { query += ` AND i.issue_date >= $${++paramCount}`; params.push(start); }
    if (end) { query += ` AND i.issue_date <= $${++paramCount}`; params.push(end); }

    query += ` ORDER BY i.issue_date DESC LIMIT $${++paramCount} OFFSET $${++paramCount}`;
    params.push(Number(limit), Number(offset));

    const result = await pool.query(query, params);
    res.json({ success: true, invoices: result.rows });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── GET /api/invoices/:id ──────────────────────────────────────
router.get('/unbilled', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { projectId } = req.query;
    if (!projectId) {
      return res.status(400).json({ success: false, message: 'projectId required' });
    }

    const result = await pool.query(
      `SELECT te.id, te.project_id, te.user_id,
              u.first_name || ' ' || u.last_name as employee_name,
              te.clock_in, te.clock_out,
              te.regular_hours, te.overtime_hours,
              (te.regular_hours + te.overtime_hours) as total_hours,
              te.total_wage as amount
       FROM time_entries te
       JOIN users u ON te.user_id = u.id
       WHERE te.project_id = $1 AND u.company_id=$2
         AND te.status = 'completed' AND te.approval_status='approved'
         AND NOT EXISTS (
           SELECT 1 FROM invoice_items ii
           WHERE ii.time_entry_ids @> ARRAY[te.id]
         )
       ORDER BY te.clock_in`,
      [projectId,companyId]
    );

    res.json({ success: true, unbilled: result.rows });
  } catch (error) {
    console.error('Error fetching unbilled:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});


router.get('/:id', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { id } = req.params;
    const invoiceRes = await pool.query(
      `SELECT i.*,
              p.name as project_name,
              u.first_name || ' ' || u.last_name as client_name
       FROM invoices i
       LEFT JOIN projects p ON i.project_id = p.id
       LEFT JOIN users u ON i.client_id = u.id
       WHERE i.id = $1 AND i.company_id = $2`,
      [id, companyId]
    );
    if (invoiceRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    const itemsRes = await pool.query(
      'SELECT * FROM invoice_items WHERE invoice_id = $1',
      [id]
    );

    const paymentsRes = await pool.query(
      'SELECT * FROM payments WHERE invoice_id = $1 ORDER BY payment_date DESC',
      [id]
    );

    res.json({
      success: true,
      invoice: invoiceRes.rows[0],
      items: itemsRes.rows,
      payments: paymentsRes.rows,
    });
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── GET /api/invoices/unbilled ─────────────────────────────────
// ─── POST /api/invoices ─────────────────────────────────────────
router.post('/', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const {
      projectId,
      clientId,
      issueDate,
      dueDate,
      taxRate,
      notes,
      clientNotes,
      items,
      timeEntryIds, // optional: auto‑populate from time entries
      isRecurring,
      recurringFrequency,
      recurringEndDate,
    } = req.body;

    validateInvoiceHeader(issueDate,dueDate,taxRate);
    const validated=validateInvoiceLines(items);
    const requestKey=req.body.requestKey;
    if(requestKey!==undefined&&(typeof requestKey!=='string'||!/^[-_a-zA-Z0-9]{8,100}$/.test(requestKey)))throw Error('Invalid invoice request key.');
    const requestHash=createHash('sha256').update(JSON.stringify({projectId:projectId||null,clientId:clientId||null,issueDate,dueDate,taxRate:taxRate||0,notes:notes||null,clientNotes:clientNotes||null,items,isRecurring:isRecurring||false,recurringFrequency:recurringFrequency||null,recurringEndDate:recurringEndDate||null})).digest('hex');
    await client.query('BEGIN');
    await client.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE',[companyId]);
    if(requestKey){const prior=await client.query('SELECT * FROM invoices WHERE company_id=$1 AND creation_request_key=$2',[companyId,requestKey]);if(prior.rowCount){if(prior.rows[0].creation_request_hash!==requestHash){await client.query('ROLLBACK');return res.status(409).json({success:false,message:'This request key was already used for different invoice data.'});}await client.query('COMMIT');return res.json({success:true,invoice:prior.rows[0],replayed:true});}}
    if(projectId){const own=await client.query('SELECT id FROM projects WHERE id=$1 AND company_id=$2',[projectId,companyId]);if(!own.rowCount)throw new Error('Project outside company');}
    if(clientId){const own=await client.query('SELECT id FROM users WHERE id=$1 AND company_id=$2',[clientId,companyId]);if(!own.rowCount)throw new Error('Client outside company');}
    await lockInvoiceLabor(client,companyId,validated.ids,null,projectId||null);
    // If clientId not provided, try to get from project
    let finalClientId = clientId || null;
    if (!finalClientId && projectId) {
      const projRes = await client.query('SELECT client_id FROM projects WHERE id = $1', [projectId]);
      if (projRes.rows.length > 0) {
        finalClientId = projRes.rows[0].client_id;
      }
    }

    const subtotal=validated.subtotal;

    const userId = res.locals.actor.id;

    const invoiceResult = await client.query(
      `INSERT INTO invoices
       (company_id, project_id, client_id, issue_date, due_date, tax_rate,
        subtotal, notes, client_notes, created_by, is_recurring,
        recurring_frequency, recurring_end_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'draft')
       RETURNING id`,
      [
        companyId,
        projectId || null,
        finalClientId,
        issueDate,
        dueDate,
        taxRate || 0,
        subtotal,
        notes || null,
        clientNotes || null,
        userId,
        isRecurring || false,
        recurringFrequency || null,
        recurringEndDate || null,
      ]
    );
    const invoiceId = invoiceResult.rows[0].id;
    if(requestKey)await client.query('UPDATE invoices SET creation_request_key=$1,creation_request_hash=$2 WHERE id=$3',[requestKey,requestHash,invoiceId]);

    // Insert items
    for (const item of items) {
      await client.query(
        `INSERT INTO invoice_items
         (invoice_id, description, quantity, unit_price, time_entry_ids)
         VALUES ($1, $2, $3, $4, $5)`,
        [invoiceId, item.description, item.quantity || 1, item.unit_price, item.timeEntryIds || []]
      );
    }

    // If timeEntryIds provided, link them (but they should already be in items)
    // No need to duplicate.

    await client.query('COMMIT');

    const invoice = await client.query('SELECT * FROM invoices WHERE id = $1', [invoiceId]);
    res.status(201).json({ success: true, invoice: invoice.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating invoice:', error);
    res.status(400).json({ success: false, message: 'Invoice could not be saved. Check dates, lines and linked labor.' });
  } finally {
    client.release();
  }
});

// ─── PUT /api/invoices/:id (draft only) ────────────────────────
router.put('/:id', async (req: Request, res: Response) => {
 const client=await pool.connect();
 try {
  const companyId=res.locals.actor.company_id;
  await client.query('BEGIN');
  await client.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE',[companyId]);
  const selected=await client.query("SELECT * FROM invoices WHERE id=$1 AND company_id=$2 AND status='draft' FOR UPDATE",[req.params.id,companyId]);
  if(!selected.rowCount){await client.query('ROLLBACK');return res.status(404).json({success:false,message:'Draft invoice not found'});}
  const previous=selected.rows[0];
  const {issueDate,dueDate,taxRate,notes,clientNotes,status,items}=req.body;
  if(status!==undefined&&status!=='draft')throw Error('Use the invoice issuing or payment workflow to change status.');
  const dates={issue:issueDate??String(previous.issue_date instanceof Date?previous.issue_date.toISOString():previous.issue_date).slice(0,10),due:dueDate??String(previous.due_date instanceof Date?previous.due_date.toISOString():previous.due_date).slice(0,10)};
  validateInvoiceHeader(dates.issue,dates.due,taxRate??previous.tax_rate);
  const paid=await client.query('SELECT id FROM payments WHERE invoice_id=$1 LIMIT 1',[req.params.id]);if(paid.rowCount)throw Error('An invoice with payment records cannot be edited.');
  let subtotal=previous.subtotal;
  if(items!==undefined){const checked=validateInvoiceLines(items);await lockInvoiceLabor(client,companyId,checked.ids,String(req.params.id),previous.project_id);subtotal=checked.subtotal;await client.query('DELETE FROM invoice_items WHERE invoice_id=$1',[req.params.id]);for(const item of items)await client.query('INSERT INTO invoice_items(invoice_id,description,quantity,unit_price,time_entry_ids) VALUES($1,$2,$3,$4,$5)',[req.params.id,item.description,item.quantity??1,item.unit_price,item.timeEntryIds||[]]);}
  const result=await client.query(`UPDATE invoices SET issue_date=$1,due_date=$2,tax_rate=$3,notes=COALESCE($4,notes),client_notes=COALESCE($5,client_notes),subtotal=$6 WHERE id=$7 AND company_id=$8 AND status='draft' RETURNING *`,[dates.issue,dates.due,taxRate??previous.tax_rate,notes,clientNotes,subtotal,req.params.id,companyId]);
  await client.query('COMMIT');res.json({success:true,invoice:result.rows[0]});
 }catch(error:any){await client.query('ROLLBACK').catch(()=>{});res.status(400).json({success:false,message:error.message||'Invoice could not be saved'});}finally{client.release();}
});

// ─── DELETE /api/invoices/:id (draft only) ─────────────────────
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM invoices WHERE id = $1 AND company_id = $2 AND status = $3 RETURNING id',
      [id, companyId, 'draft']
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Invoice not found or not draft' });
    }
    res.json({ success: true, message: 'Invoice deleted' });
  } catch (error) {
    console.error('Error deleting invoice:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Record delivery completed outside the app. No email or synthetic payment link is generated.
router.post('/:id/send',async(req,res)=>{
 try{const result=await pool.query("UPDATE invoices SET status='sent',sent_at=COALESCE(sent_at,NOW()) WHERE id=$1 AND company_id=$2 AND status IN ('draft','sent') RETURNING *",[req.params.id,res.locals.actor.company_id]);if(!result.rowCount)return res.status(409).json({message:'Draft or sent invoice not found'});res.json({success:true,invoice:result.rows[0],message:'External delivery recorded. No email was sent.'});}catch(error:any){res.status(400).json({message:error.message});}
});
// Record an already completed external payment, never transfer or charge money.
router.post('/:id/payments',async(req,res)=>{
 const c=await pool.connect();
 try{
  const b=req.body,key=b.requestKey,amount=String(b.amount),date=b.paymentDate;
  if(typeof key!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(key)||b.confirmed!==true)throw Error('Confirm the external payment and provide a request key.');
  if(!/^\d+(\.\d{1,2})?$/.test(amount)||new Big(amount).lte(0)||new Big(amount).gt('99999999.99')||!validDate(date))throw Error('Use a positive two-decimal amount and valid payment date.');
  if(typeof b.reference!=='string'||b.reference.trim().length<4||b.reference.length>200)throw Error('Provide the external payment reference (4 to 200 characters).');
  if(b.method&&(!['bank_transfer','ach','cash','check','credit_card','other'].includes(b.method)))throw Error('Invalid payment method.');
  const hash=createHash('sha256').update(JSON.stringify({amount:new Big(amount).toFixed(2),date,reference:b.reference.trim(),method:b.method||null,notes:b.notes||null})).digest('hex');
  await c.query('BEGIN');
  const found=await c.query('SELECT * FROM invoices WHERE id=$1 AND company_id=$2 FOR UPDATE',[req.params.id,res.locals.actor.company_id]);
  if(!found.rowCount){await c.query('ROLLBACK');return res.status(404).json({message:'Invoice not found'});}const invoice=found.rows[0];
  const prior=await c.query('SELECT * FROM payments WHERE invoice_id=$1 AND record_request_key=$2',[req.params.id,key]);
  if(prior.rowCount){if(prior.rows[0].record_request_hash!==hash){await c.query('ROLLBACK');return res.status(409).json({message:'Payment key already used with different values'});}await c.query('COMMIT');return res.json({success:true,invoice,payment:prior.rows[0],replayed:true});}
  if(!['sent','overdue'].includes(invoice.status))throw Error('Only an issued unpaid invoice can receive a payment record.');
  const existing=await c.query('SELECT COALESCE(SUM(amount),0) amount FROM payments WHERE invoice_id=$1',[req.params.id]);const paid=new Big(existing.rows[0].amount).plus(amount),total=new Big(invoice.total);
  if(paid.gt(total))throw Error('Payment exceeds the remaining invoice balance.');
  const payment=(await c.query('INSERT INTO payments(invoice_id,amount,payment_date,method,reference,notes,record_request_key,record_request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[req.params.id,new Big(amount).toFixed(2),date,b.method||null,b.reference.trim(),b.notes||null,key,hash])).rows[0];
  // Recompute from payment records; the legacy trigger may already have updated paid_amount.
  const updated=await c.query("UPDATE invoices SET paid_amount=$1,status=CASE WHEN $1::numeric>=total THEN 'paid' ELSE status END,paid_at=CASE WHEN $1::numeric>=total THEN NOW() ELSE paid_at END WHERE id=$2 AND company_id=$3 RETURNING *",[paid.toFixed(2),req.params.id,res.locals.actor.company_id]);
  await c.query('COMMIT');res.json({success:true,invoice:updated.rows[0],payment,replayed:false});
 }catch(error:any){await c.query('ROLLBACK').catch(()=>{});res.status(400).json({success:false,message:error.message||'Payment record failed'});}finally{c.release();}
});

// ─── GET /api/invoices/client/:clientId ────────────────────────
// Customer Hub – get client summary
router.get('/client/:clientId', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { clientId } = req.params;
    // Get client info
    const clientRes = await pool.query(
      `SELECT id, first_name, last_name, email, phone FROM users WHERE id = $1 AND company_id = $2`,
      [clientId, companyId]
    );
    if (clientRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }
    const client = clientRes.rows[0];

    // Get invoices summary
    const invoicesRes = await pool.query(
      `SELECT id, invoice_number, issue_date, due_date, status, total, paid_amount, balance
       FROM invoices
       WHERE client_id = $1 AND company_id = $2
       ORDER BY issue_date DESC
       LIMIT 20`,
      [clientId,companyId]
    );

    // Get projects
    const projectsRes = await pool.query(
      `SELECT id, name, status, created_at
       FROM projects
       WHERE client_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [clientId]
    );

    // Compute totals
    const totalsRes = await pool.query(
      `SELECT
         COUNT(*) as total_invoices,
         COALESCE(SUM(total), 0) as total_billed,
         COALESCE(SUM(paid_amount), 0) as total_paid,
         COALESCE(SUM(balance), 0) as total_balance
       FROM invoices
       WHERE client_id = $1`,
      [clientId]
    );

    res.json({
      success: true,
      client,
      invoices: invoicesRes.rows,
      projects: projectsRes.rows,
      totals: totalsRes.rows[0],
    });
  } catch (error) {
    console.error('Error fetching client hub:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/:id/pdf',async(req,res)=>{try{const bytes=await commercialPdf('invoice',String(req.params.id),res.locals.actor.company_id);res.type('application/pdf').set('Content-Disposition','attachment; filename="invoice.pdf"').send(bytes);}catch(error:any){res.status(error.status||400).json({message:error.message});}});
export default router;