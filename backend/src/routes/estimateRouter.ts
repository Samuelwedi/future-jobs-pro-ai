import express, { Request, Response } from 'express';
import { pool } from '../config/database';
import { verifyToken } from '../utils/auth';

const router = express.Router();

const getCompanyId = async (req: Request): Promise<string | null> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = verifyToken(req);
    const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
    return userRes.rows[0]?.company_id || null;
  } catch { return null; }
};

// ─── GET /api/estimates ──────────────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { status, clientId, start, end } = req.query;
    let query = `
      SELECT e.*,
             p.name as project_name,
             u.first_name || ' ' || u.last_name as client_name
      FROM estimates e
      LEFT JOIN projects p ON e.project_id = p.id
      LEFT JOIN users u ON e.client_id = u.id
      WHERE e.company_id = $1
    `;
    const params: any[] = [companyId];
    let paramCount = 1;

    if (status) { query += ` AND e.status = $${++paramCount}`; params.push(status); }
    if (clientId) { query += ` AND e.client_id = $${++paramCount}`; params.push(clientId); }
    if (start) { query += ` AND e.issue_date >= $${++paramCount}`; params.push(start); }
    if (end) { query += ` AND e.issue_date <= $${++paramCount}`; params.push(end); }

    query += ` ORDER BY e.issue_date DESC`;
    const result = await pool.query(query, params);
    res.json({ success: true, estimates: result.rows });
  } catch (error) {
    console.error('Error fetching estimates:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── GET /api/estimates/:id ──────────────────────────────────────
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { id } = req.params;
    const estimateRes = await pool.query(
      `SELECT e.*, p.name as project_name, u.first_name || ' ' || u.last_name as client_name
       FROM estimates e
       LEFT JOIN projects p ON e.project_id = p.id
       LEFT JOIN users u ON e.client_id = u.id
       WHERE e.id = $1 AND e.company_id = $2`,
      [id, companyId]
    );
    if (estimateRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Estimate not found' });
    }

    const itemsRes = await pool.query(
      'SELECT * FROM estimate_items WHERE estimate_id = $1',
      [id]
    );

    res.json({
      success: true,
      estimate: estimateRes.rows[0],
      items: itemsRes.rows,
    });
  } catch (error) {
    console.error('Error fetching estimate:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── POST /api/estimates ─────────────────────────────────────────
router.post('/', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { projectId, clientId, issueDate, expiryDate, taxRate, notes, clientNotes, items } = req.body;

    if (!issueDate || !items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'issueDate and items required' });
    }

    let subtotal = 0;
    for (const item of items) {
      subtotal += (item.quantity || 1) * item.unit_price;
    }

    const userId = (req as any).user?.id || null;

    const result = await client.query(
      `INSERT INTO estimates
       (company_id, project_id, client_id, issue_date, expiry_date, tax_rate, subtotal, notes, client_notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        companyId,
        projectId || null,
        clientId || null,
        issueDate,
        expiryDate || null,
        taxRate || 0,
        subtotal,
        notes || null,
        clientNotes || null,
        userId,
      ]
    );
    const estimateId = result.rows[0].id;

    for (const item of items) {
      await client.query(
        `INSERT INTO estimate_items (estimate_id, description, quantity, unit_price)
         VALUES ($1, $2, $3, $4)`,
        [estimateId, item.description, item.quantity || 1, item.unit_price]
      );
    }

    await client.query('COMMIT');
    const estimate = await client.query('SELECT * FROM estimates WHERE id = $1', [estimateId]);
    res.status(201).json({ success: true, estimate: estimate.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating estimate:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    client.release();
  }
});

// ─── POST /api/estimates/:id/send ──────────────────────────────
router.post('/:id/send', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { id } = req.params;
    const result = await pool.query(
      `UPDATE estimates SET status = 'sent', sent_at = NOW()
       WHERE id = $1 AND company_id = $2
       RETURNING *`,
      [id, companyId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Estimate not found' });
    }
    res.json({ success: true, estimate: result.rows[0] });
  } catch (error) {
    console.error('Error sending estimate:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── POST /api/estimates/:id/accept ─────────────────────────────
router.post('/:id/accept', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { id } = req.params;
    const result = await pool.query(
      `UPDATE estimates SET status = 'accepted', accepted_at = NOW()
       WHERE id = $1 AND company_id = $2
       RETURNING *`,
      [id, companyId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Estimate not found' });
    }
    res.json({ success: true, estimate: result.rows[0] });
  } catch (error) {
    console.error('Error accepting estimate:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── POST /api/estimates/:id/convert ────────────────────────────
router.post('/:id/convert', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { id } = req.params;
    const { invoiceDate, dueDate } = req.body;

    // Get estimate with items
    const estimateRes = await client.query(
      `SELECT * FROM estimates WHERE id = $1 AND company_id = $2`,
      [id, companyId]
    );
    if (estimateRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Estimate not found' });
    }
    const estimate = estimateRes.rows[0];

    const itemsRes = await client.query(
      'SELECT * FROM estimate_items WHERE estimate_id = $1',
      [id]
    );

    // Create invoice from estimate
    const invoiceResult = await client.query(
      `INSERT INTO invoices
       (company_id, project_id, client_id, issue_date, due_date, tax_rate, subtotal, notes, client_notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        estimate.company_id,
        estimate.project_id,
        estimate.client_id,
        invoiceDate || new Date().toISOString().split('T')[0],
        dueDate || new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0],
        estimate.tax_rate,
        estimate.subtotal,
        estimate.notes,
        estimate.client_notes,
        estimate.created_by,
      ]
    );
    const invoiceId = invoiceResult.rows[0].id;

    // Copy items
    for (const item of itemsRes.rows) {
      await client.query(
        `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price)
         VALUES ($1, $2, $3, $4)`,
        [invoiceId, item.description, item.quantity, item.unit_price]
      );
    }

    // Mark estimate as converted
    await client.query(
      `UPDATE estimates SET status = 'converted', converted_to_invoice_id = $1 WHERE id = $2`,
      [invoiceId, id]
    );

    await client.query('COMMIT');

    const invoice = await client.query('SELECT * FROM invoices WHERE id = $1', [invoiceId]);
    res.json({
      success: true,
      invoice: invoice.rows[0],
      message: 'Estimate converted to invoice successfully',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error converting estimate:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    client.release();
  }
});

// ─── DELETE /api/estimates/:id ──────────────────────────────────
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM estimates WHERE id = $1 AND company_id = $2 AND status = $3 RETURNING id',
      [id, companyId, 'draft']
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Estimate not found or not draft' });
    }
    res.json({ success: true, message: 'Estimate deleted' });
  } catch (error) {
    console.error('Error deleting estimate:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;