import express, { Request, Response } from 'express';
import { pool } from '../config/database';
import { verifyToken } from '../utils/auth';

const router = express.Router();

// Helper to get company ID from token
const getCompanyId = async (req: Request): Promise<string | null> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = verifyToken(req);
    const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
    return userRes.rows[0]?.company_id || null;
  } catch { return null; }
};

// GET /api/payroll – list all payrolls for the company
router.get('/', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const result = await pool.query(
      `SELECT p.*,
              (SELECT COUNT(*) FROM payroll_items WHERE payroll_id = p.id) as employee_count
       FROM payrolls p
       WHERE p.company_id = $1
       ORDER BY p.period_start DESC`,
      [companyId]
    );
    res.json({ success: true, payrolls: result.rows });
  } catch (error) {
    console.error('Error fetching payrolls:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/payroll/:id – get payroll with items
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { id } = req.params;
    const payrollRes = await pool.query(
      'SELECT * FROM payrolls WHERE id = $1 AND company_id = $2',
      [id, companyId]
    );
    if (payrollRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Payroll not found' });
    }

    const itemsRes = await pool.query(
      `SELECT pi.*,
              u.first_name || ' ' || u.last_name as employee_name
       FROM payroll_items pi
       LEFT JOIN users u ON pi.employee_id = u.id
       WHERE pi.payroll_id = $1`,
      [id]
    );

    res.json({
      success: true,
      payroll: payrollRes.rows[0],
      items: itemsRes.rows,
    });
  } catch (error) {
    console.error('Error fetching payroll:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /api/payroll/generate – generate payroll from time entries
router.post('/generate', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { periodStart, periodEnd } = req.body;
    if (!periodStart || !periodEnd) {
      return res.status(400).json({ success: false, message: 'periodStart and periodEnd required' });
    }

    // Fetch all time entries for the company in the period
    const timeEntries = await client.query(
      `SELECT te.user_id, te.regular_hours, te.overtime_hours, te.total_wage, te.id
       FROM time_entries te
       JOIN users u ON te.user_id = u.id
       WHERE u.company_id = $1
         AND te.clock_in >= $2::date
         AND te.clock_in <= $3::date
         AND te.status = 'completed'`,
      [companyId, periodStart, periodEnd]
    );

    if (timeEntries.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'No time entries found in this period' });
    }

    // Group by user
    const userMap = new Map<string, { hours: number; pay: number; timeEntryIds: string[] }>();
    for (const row of timeEntries.rows) {
      if (!userMap.has(row.user_id)) {
        userMap.set(row.user_id, { hours: 0, pay: 0, timeEntryIds: [] });
      }
      const data = userMap.get(row.user_id)!;
      data.hours += Number(row.regular_hours || 0) + Number(row.overtime_hours || 0);
      data.pay += Number(row.total_wage || 0);
      data.timeEntryIds.push(row.id);
    }

    // Calculate total hours & pay
    let totalHours = 0;
    let totalPay = 0;
    for (const [_, data] of userMap) {
      totalHours += data.hours;
      totalPay += data.pay;
    }

    // Create payroll record
    const payrollResult = await client.query(
      `INSERT INTO payrolls (company_id, period_start, period_end, total_hours, total_pay, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [companyId, periodStart, periodEnd, totalHours, totalPay, (req as any).user?.id || null]
    );
    const payrollId = payrollResult.rows[0].id;

    // Insert payroll items
    for (const [employeeId, data] of userMap) {
      await client.query(
        `INSERT INTO payroll_items (payroll_id, employee_id, hours, pay, timesheet_ids)
         VALUES ($1, $2, $3, $4, $5)`,
        [payrollId, employeeId, data.hours, data.pay, data.timeEntryIds]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({
      success: true,
      payrollId,
      message: `Payroll generated for ${userMap.size} employees`,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error generating payroll:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    client.release();
  }
});

// PUT /api/payroll/:id – update payroll status or notes
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { id } = req.params;
    const { status, notes } = req.body;

    const result = await pool.query(
      `UPDATE payrolls SET status = COALESCE($1, status), notes = COALESCE($2, notes), updated_at = NOW()
       WHERE id = $3 AND company_id = $4 RETURNING *`,
      [status, notes, id, companyId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Payroll not found' });
    }
    res.json({ success: true, payroll: result.rows[0] });
  } catch (error) {
    console.error('Error updating payroll:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// DELETE /api/payroll/:id – delete payroll (only if draft)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM payrolls WHERE id = $1 AND company_id = $2 AND status = $3 RETURNING id',
      [id, companyId, 'draft']
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Payroll not found or not draft' });
    }
    res.json({ success: true, message: 'Payroll deleted' });
  } catch (error) {
    console.error('Error deleting payroll:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;