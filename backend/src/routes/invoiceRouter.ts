import express, { Request, Response } from 'express';
import { pool } from '../config/database';
import { verifyToken } from '../utils/auth';

const router = express.Router();

// Helper
const getCompanyId = async (req: Request): Promise<string | null> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = verifyToken(req);
    const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
    return userRes.rows[0]?.company_id || null;
  } catch { return null; }
};

// GET /api/invoices – list all invoices for company
router.get('/', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const result = await pool.query(
      `SELECT i.*,
              p.name as project_name,
              u.first_name || ' ' || u.last_name as created_by_name
       FROM invoices i
       LEFT JOIN projects p ON i.project_id = p.id
       LEFT JOIN users u ON i.created_by = u.id
       WHERE i.company_id = $1
       ORDER BY i.issue_date DESC`,
      [companyId]
    );
    res.json({ success: true, invoices: result.rows });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/invoices/:id – get invoice with items
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { id } = req.params;
    const invoiceRes = await pool.query(
      `SELECT i.*, p.name as project_name
       FROM invoices i
       LEFT JOIN projects p ON i.project_id = p.id
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

    res.json({
      success: true,
      invoice: invoiceRes.rows[0],
      items: itemsRes.rows,
    });
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/invoices/unbilled-hours – get unbilled time entries grouped by project
router.get('/unbilled-hours', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    // Find all time entries that are not linked to any invoice item
    // We'll get time entries that are completed and not in any invoice_items.time_entry_ids
    const result = await pool.query(
      `SELECT
         te.project_id,
         p.name as project_name,
         SUM(te.regular_hours + te.overtime_hours) as total_hours,
         SUM(te.total_wage) as total_wage,
         array_agg(te.id) as time_entry_ids
       FROM time_entries te
       JOIN users u ON te.user_id = u.id
       JOIN projects p ON te.project_id = p.id
       WHERE u.company_id = $1
         AND te.status = 'completed'
         AND te.project_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM invoice_items ii
           WHERE ii.time_entry_ids @> ARRAY[te.id]
         )
       GROUP BY te.project_id, p.name`,
      [companyId]
    );

    res.json({ success: true, unbilled: result.rows });
  } catch (error) {
    console.error('Error fetching unbilled hours:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /api/invoices – create invoice (manual or from time entries)
router.post('/', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const {
      projectId,
      issueDate,
      dueDate,
      taxRate,
      notes,
      items, // array of { description, quantity, unit_price, timeEntryIds? }
    } = req.body;

    if (!issueDate || !dueDate || !items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'issueDate, dueDate, and items required' });
    }

    let subtotal = 0;
    for (const item of items) {
      subtotal += (item.quantity || 1) * item.unit_price;
    }

    const result = await client.query(
      `INSERT INTO invoices
       (company_id, project_id, issue_date, due_date, tax_rate, subtotal, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [companyId, projectId || null, issueDate, dueDate, taxRate || 0, subtotal, notes || null, (req as any).user?.id || null]
    );
    const invoiceId = result.rows[0].id;

    // Insert items
    for (const item of items) {
      await client.query(
        `INSERT INTO invoice_items
         (invoice_id, description, quantity, unit_price, time_entry_ids)
         VALUES ($1, $2, $3, $4, $5)`,
        [invoiceId, item.description, item.quantity || 1, item.unit_price, item.timeEntryIds || []]
      );
    }

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

// PUT /api/invoices/:id – update invoice (only if draft)
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { id } = req.params;
    const { issueDate, dueDate, status, notes } = req.body;

    const result = await pool.query(
      `UPDATE invoices
       SET issue_date = COALESCE($1, issue_date),
           due_date = COALESCE($2, due_date),
           status = COALESCE($3, status),
           notes = COALESCE($4, notes),
           updated_at = NOW()
       WHERE id = $5 AND company_id = $6 AND status = 'draft'
       RETURNING *`,
      [issueDate, dueDate, status, notes, id, companyId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Invoice not found or not draft' });
    }
    res.json({ success: true, invoice: result.rows[0] });
  } catch (error) {
    console.error('Error updating invoice:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /api/invoices/:id/send – mark as sent
router.post('/:id/send', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { id } = req.params;
    const result = await pool.query(
      `UPDATE invoices
       SET status = 'sent', sent_at = NOW()
       WHERE id = $1 AND company_id = $2
       RETURNING *`,
      [id, companyId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }
    res.json({ success: true, invoice: result.rows[0] });
  } catch (error) {
    console.error('Error sending invoice:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /api/invoices/:id/mark-paid – mark as paid
router.post('/:id/mark-paid', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { id } = req.params;
    const result = await pool.query(
      `UPDATE invoices
       SET status = 'paid', paid_at = NOW()
       WHERE id = $1 AND company_id = $2
       RETURNING *`,
      [id, companyId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }
    res.json({ success: true, invoice: result.rows[0] });
  } catch (error) {
    console.error('Error marking paid:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// DELETE /api/invoices/:id – delete invoice (draft only)
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

export default router;