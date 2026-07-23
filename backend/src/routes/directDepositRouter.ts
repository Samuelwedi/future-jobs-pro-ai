import express, { Request, Response } from 'express';
import { pool } from '../config/database';
import { verifyToken } from '../utils/auth';
import { generateNachaFile } from '../services/nachaGenerator';

const router = express.Router();

// ─── Helper: get company ID ──────────────────────────────────────
const getCompanyId = async (req: Request): Promise<string | null> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = verifyToken(req);
    const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
    return userRes.rows[0]?.company_id || null;
  } catch { return null; }
};

// ─── PUT /api/direct-deposit/employee/:id/bank ──────────────────
// Update bank details for an employee
router.put('/employee/:id/bank', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { id } = req.params;
    const { bankRoutingNumber, bankAccountNumber, bankAccountType, bankAccountHolder } = req.body;

    // Verify employee belongs to this company
    const empCheck = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND company_id = $2',
      [id, companyId]
    );
    if (empCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    await pool.query(
      `UPDATE users
       SET bank_routing_number = $1,
           bank_account_number = $2,
           bank_account_type = $3,
           bank_account_holder = $4
       WHERE id = $5`,
      [bankRoutingNumber, bankAccountNumber, bankAccountType, bankAccountHolder, id]
    );

    res.json({ success: true, message: 'Bank details updated' });
  } catch (error) {
    console.error('Error updating bank details:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── GET /api/direct-deposit/employees ─────────────────────────
// Get all employees with bank details (for the company)
router.get('/employees', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const result = await pool.query(
      `SELECT id, first_name, last_name, email,
              bank_routing_number, bank_account_number, bank_account_type, bank_account_holder
       FROM users
       WHERE company_id = $1 AND role NOT IN ('boss', 'manager')
       ORDER BY last_name, first_name`,
      [companyId]
    );
    res.json({ success: true, employees: result.rows });
  } catch (error) {
    console.error('Error fetching employees for direct deposit:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── POST /api/direct-deposit/generate ──────────────────────────
// Generate NACHA file for a payroll
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { payrollId } = req.body;
    if (!payrollId) {
      return res.status(400).json({ success: false, message: 'payrollId required' });
    }

    // Fetch payroll details
    const payrollRes = await pool.query(
      `SELECT p.*, c.name as company_name
       FROM payrolls p
       JOIN companies c ON p.company_id = c.id
       WHERE p.id = $1 AND p.company_id = $2`,
      [payrollId, companyId]
    );
    if (payrollRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Payroll not found' });
    }
    const payroll = payrollRes.rows[0];

    // Fetch payroll items with employee bank details
    const items = await pool.query(
      `SELECT pi.*,
              u.first_name, u.last_name, u.email,
              u.bank_routing_number, u.bank_account_number, u.bank_account_type, u.bank_account_holder
       FROM payroll_items pi
       JOIN users u ON pi.employee_id = u.id
       WHERE pi.payroll_id = $1`,
      [payrollId]
    );

    if (items.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'No employees in this payroll' });
    }

    // Generate NACHA file content
    const nachaContent = generateNachaFile({
      companyName: payroll.company_name,
      companyId: payroll.company_id,
      effectiveDate: new Date().toISOString().split('T')[0],
      items: items.rows.map((row: any) => ({
        employeeName: `${row.first_name} ${row.last_name}`,
        routingNumber: row.bank_routing_number,
        accountNumber: row.bank_account_number,
        accountType: row.bank_account_type || 'checking',
        amount: Number(row.final_pay) || 0,
      })),
    });

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename=nacha_payroll_${payrollId}.txt`);
    res.send(nachaContent);
  } catch (error) {
    console.error('Error generating NACHA file:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;