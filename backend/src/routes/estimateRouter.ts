import express, { Request, Response } from 'express';
import { pool } from '../config/database';
import { verifyToken } from '../utils/auth';
import { deliverEstimate, EstimateDeliveryError } from '../services/estimateDeliveryService';
import { saveEstimate, EstimateSaveError } from '../services/estimateSaveService';

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
const saveHandler = (editing: boolean) => async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const estimate = await saveEstimate(companyId, verifyToken(req).id, req.body, editing ? String(req.params.id) : undefined);
    return res.status(editing ? 200 : 201).json({ success: true, estimate });
  } catch (error) {
    if (error instanceof EstimateSaveError) return res.status(error.status).json({ success: false, message: error.message });
    console.error('Error saving estimate:', error);
    return res.status(500).json({ success: false, message: 'Estimate could not be saved' });
  }
};
router.post('/', saveHandler(false));
router.put('/:id', saveHandler(true));

// ─── POST /api/estimates/:id/send ──────────────────────────────
router.post('/:id/send', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const estimate = await deliverEstimate(String(req.params.id), companyId);
    res.json({ success: true, estimate });
  } catch (error) {
    if (error instanceof EstimateDeliveryError) return res.status(error.status).json({ success: false, message: error.message });
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
       WHERE id = $1 AND company_id = $2 AND status = 'sent'
       RETURNING *`,
      [id, companyId]
    );
    if (result.rows.length === 0) {
      return res.status(409).json({ success: false, message: 'Only a sent estimate in your company can be accepted' });
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

    await client.query('BEGIN');
    // Lock conversion so retries cannot create duplicate invoices.
    const estimateRes = await client.query(
      `SELECT * FROM estimates WHERE id = $1 AND company_id = $2 FOR UPDATE`,
      [id, companyId]
    );
    if (estimateRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Estimate not found' });
    }
    const estimate = estimateRes.rows[0];
    if (estimate.status === 'converted' && estimate.converted_to_invoice_id) {
      const existing = await client.query('SELECT * FROM invoices WHERE id=$1 AND company_id=$2', [estimate.converted_to_invoice_id, companyId]);
      await client.query('COMMIT');
      return res.json({ success: true, invoice: existing.rows[0], message: 'Estimate already converted' });
    }
    if (!['sent', 'accepted'].includes(estimate.status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Only sent or accepted estimates can be converted' });
    }

    const itemsRes = await client.query(
      'SELECT * FROM estimate_items WHERE estimate_id = $1',
      [id]
    );

    if (!itemsRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Estimate has no line items' });
    }
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