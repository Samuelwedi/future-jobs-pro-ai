import { verifyToken } from '../utils/auth';
import express, { Request, Response } from 'express';
import { pool } from '../config/database';

const router = express.Router();

// GET /api/approvals/pending – get pending approvals for the user
router.get('/pending', async (req: Request, res: Response) => {
  try {
    const decoded = verifyToken(req);
    const result = await pool.query(
      'SELECT * FROM approvals WHERE user_id = $1 AND status = $2 ORDER BY created_at ASC',
      [decoded.id, 'pending']
    );
    res.json({ success: true, approvals: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/approvals/:id/approve
router.post('/:id/approve', async (req: Request, res: Response) => {
  try {
    const decoded = verifyToken(req);
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM approvals WHERE id = $1 AND user_id = $2 AND status = $3',
      [id, decoded.id, 'pending']
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Approval not found or already resolved' });
    }

    const approval = result.rows[0];
    await pool.query(
      'UPDATE approvals SET status = $1, resolved_at = NOW() WHERE id = $2',
      ['approved', id]
    );

    // Execute the approved action (e.g., run payroll, create invoice)
    const actionResult = await executeApprovedAction(approval);

    res.json({ success: true, message: 'Approved', result: actionResult });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/approvals/:id/reject
router.post('/:id/reject', async (req: Request, res: Response) => {
  try {
    const decoded = verifyToken(req);
    const { id } = req.params;
    await pool.query(
      'UPDATE approvals SET status = $1, resolved_at = NOW() WHERE id = $2 AND user_id = $3',
      ['rejected', id, decoded.id]
    );
    res.json({ success: true, message: 'Rejected' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Helper: execute the approved action
async function executeApprovedAction(approval: any): Promise<any> {
  const { action_type, action_payload } = approval;
  // You'll implement this based on your action types
  // e.g., run_payroll, create_invoice, etc.
  return { executed: true, action: action_type };
}

export default router;