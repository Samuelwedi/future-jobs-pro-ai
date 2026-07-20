import express, { Request, Response } from 'express';
import { pool } from '../config/database';
import { verifyToken } from '../utils/auth';

const router = express.Router();

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
       WHERE te.project_id = $1
         AND te.status = 'completed'
         AND NOT EXISTS (
           SELECT 1 FROM invoice_items ii
           WHERE ii.time_entry_ids @> ARRAY[te.id]
         )
       ORDER BY te.clock_in`,
      [projectId]
    );

    res.json({ success: true, unbilled: result.rows });
  } catch (error) {
    console.error('Error fetching unbilled:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

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

    if (!issueDate || !dueDate || !items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'issueDate, dueDate, and items required' });
    }

    // If clientId not provided, try to get from project
    let finalClientId = clientId || null;
    if (!finalClientId && projectId) {
      const projRes = await client.query('SELECT client_id FROM projects WHERE id = $1', [projectId]);
      if (projRes.rows.length > 0) {
        finalClientId = projRes.rows[0].client_id;
      }
    }

    let subtotal = 0;
    for (const item of items) {
      subtotal += (item.quantity || 1) * item.unit_price;
    }

    const userId = (req as any).user?.id || null;

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
    res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    client.release();
  }
});

// ─── PUT /api/invoices/:id (draft only) ────────────────────────
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { id } = req.params;
    const { issueDate, dueDate, taxRate, notes, clientNotes, status, items } = req.body;

    const check = await pool.query(
      'SELECT id FROM invoices WHERE id = $1 AND company_id = $2 AND status = $3',
      [id, companyId, 'draft']
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Invoice not found or not draft' });
    }

    // Update invoice header
    const result = await pool.query(
      `UPDATE invoices
       SET issue_date = COALESCE($1, issue_date),
           due_date = COALESCE($2, due_date),
           tax_rate = COALESCE($3, tax_rate),
           notes = COALESCE($4, notes),
           client_notes = COALESCE($5, client_notes),
           status = COALESCE($6, status)
       WHERE id = $7 RETURNING *`,
      [issueDate, dueDate, taxRate, notes, clientNotes, status, id]
    );

    // Update items if provided
    if (items && Array.isArray(items)) {
      await pool.query('DELETE FROM invoice_items WHERE invoice_id = $1', [id]);
      for (const item of items) {
        await pool.query(
          `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, time_entry_ids)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, item.description, item.quantity || 1, item.unit_price, item.timeEntryIds || []]
        );
      }
    }

    res.json({ success: true, invoice: result.rows[0] });
  } catch (error) {
    console.error('Error updating invoice:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
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

// ─── POST /api/invoices/:id/send ───────────────────────────────
router.post('/:id/send', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { id } = req.params;
    // Generate payment link (you can integrate Stripe here)
    const paymentLink = `${process.env.FRONTEND_URL}/pay/invoice/${id}`;

    const result = await pool.query(
      `UPDATE invoices
       SET status = 'sent', sent_at = NOW(), payment_link = $1
       WHERE id = $2 AND company_id = $3
       RETURNING *`,
      [paymentLink, id, companyId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    // TODO: Send email to client (using your emailService)

    res.json({ success: true, invoice: result.rows[0] });
  } catch (error) {
    console.error('Error sending invoice:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── POST /api/invoices/:id/payments ────────────────────────────
router.post('/:id/payments', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { id } = req.params;
    const { amount, paymentDate, method, reference, notes } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid amount required' });
    }

    // Check invoice exists
    const invoiceRes = await pool.query(
      'SELECT id, status, total, paid_amount FROM invoices WHERE id = $1 AND company_id = $2',
      [id, companyId]
    );
    if (invoiceRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }
    const invoice = invoiceRes.rows[0];

    // Prevent overpayment
    const newPaid = Number(invoice.paid_amount) + amount;
    if (newPaid > Number(invoice.total)) {
      return res.status(400).json({ success: false, message: 'Payment exceeds invoice total' });
    }

    // Record payment
    await pool.query(
      `INSERT INTO payments (invoice_id, amount, payment_date, method, reference, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, amount, paymentDate || new Date().toISOString().split('T')[0], method || null, reference || null, notes || null]
    );

    // Update invoice status if fully paid
    const updated = await pool.query(
      `UPDATE invoices
       SET status = CASE
         WHEN paid_amount + $1 >= total THEN 'paid'
         ELSE status
       END,
       paid_at = CASE
         WHEN paid_amount + $1 >= total THEN NOW()
         ELSE paid_at
       END
       WHERE id = $2
       RETURNING *`,
      [amount, id]
    );

    res.json({ success: true, invoice: updated.rows[0] });
  } catch (error) {
    console.error('Error recording payment:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
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
       WHERE client_id = $1
       ORDER BY issue_date DESC
       LIMIT 20`,
      [clientId]
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

export default router;