import express, { Request, Response } from 'express';
import { pool } from '../config/database';
import { verifyToken } from '../utils/auth';
import { generatePayroll } from '../services/payrollGenerator';

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

// ─── LIST ──────────────────────────────────────────────────────────
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

// ─── GENERATE (with employee rate overrides) ──────────────────────
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { periodStart, periodEnd, employeeRates } = req.body;
    if (!periodStart || !periodEnd) {
      return res.status(400).json({ success: false, message: 'periodStart and periodEnd required' });
    }

    const userId = (req as any).user?.id || null;
    const result = await generatePayroll(companyId, periodStart, periodEnd, userId, employeeRates || []);

    res.status(201).json({
      success: true,
      payrollId: result.payrollId,
      message: `Payroll generated for ${result.employeeCount} employees`,
    });
  } catch (error: any) {
    console.error('Error generating payroll:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
});

// ─── UPDATE STATUS ────────────────────────────────────────────────
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

// ─── DELETE ──────────────────────────────────────────────────────
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

// ─── SPECIFIC ROUTES (must come before /:id) ────────────────────

// GET /settings
router.get('/settings', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const result = await pool.query(
      `SELECT payroll_schedule, payroll_day, payroll_time, default_hourly_rate, overtime_multiplier, tax_rate
       FROM companies WHERE id = $1`,
      [companyId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }
    res.json({ success: true, settings: result.rows[0] });
  } catch (error) {
    console.error('Error fetching payroll settings:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// PUT /settings
router.put('/settings', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { payroll_schedule, payroll_day, payroll_time, default_hourly_rate, overtime_multiplier, tax_rate } = req.body;
    const result = await pool.query(
      `UPDATE companies
       SET payroll_schedule = COALESCE($1, payroll_schedule),
           payroll_day = COALESCE($2, payroll_day),
           payroll_time = COALESCE($3, payroll_time),
           default_hourly_rate = COALESCE($4, default_hourly_rate),
           overtime_multiplier = COALESCE($5, overtime_multiplier),
           tax_rate = COALESCE($6, tax_rate)
       WHERE id = $7
       RETURNING *`,
      [
        payroll_schedule,
        payroll_day,
        payroll_time,
        default_hourly_rate,
        overtime_multiplier,
        tax_rate,
        companyId,
      ]
    );
    res.json({ success: true, settings: result.rows[0] });
  } catch (error) {
    console.error('Error updating payroll settings:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /employees/compensation
router.get('/employees/compensation', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const result = await pool.query(
      `SELECT
         u.id, u.first_name, u.last_name,
         (SELECT hourly_rate FROM compensation_history WHERE user_id = u.id AND effective_date <= CURRENT_DATE ORDER BY effective_date DESC LIMIT 1) as current_rate,
         (SELECT json_agg(json_build_object('effective_date', effective_date, 'hourly_rate', hourly_rate) ORDER BY effective_date DESC)
          FROM compensation_history WHERE user_id = u.id) as history
       FROM users u
       WHERE u.company_id = $1 AND u.role NOT IN ('boss', 'manager')
       ORDER BY u.first_name`,
      [companyId]
    );
    res.json({ success: true, employees: result.rows });
  } catch (error) {
    console.error('Error fetching employee compensation:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /employees/compensation (one‑click raise)
router.post('/employees/compensation', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { employeeIds, raiseType, raiseValue, effectiveDate } = req.body;
    if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
      return res.status(400).json({ success: false, message: 'employeeIds array required' });
    }
    if (!raiseType || !raiseValue || raiseValue <= 0) {
      return res.status(400).json({ success: false, message: 'Valid raiseType and raiseValue required' });
    }
    const effective = effectiveDate || new Date().toISOString().split('T')[0];
    const userId = (req as any).user?.id || null;

    let updatedCount = 0;
    for (const empId of employeeIds) {
      const currentRes = await client.query(
        `SELECT hourly_rate FROM compensation_history WHERE user_id = $1 AND effective_date <= $2 ORDER BY effective_date DESC LIMIT 1`,
        [empId, effective]
      );
      let currentRate = currentRes.rows[0]?.hourly_rate || 20.0;

      let newRate = currentRate;
      if (raiseType === 'percentage') {
        newRate = currentRate * (1 + raiseValue / 100);
      } else if (raiseType === 'fixed') {
        newRate = currentRate + raiseValue;
      } else {
        continue;
      }

      await client.query(
        `INSERT INTO compensation_history (user_id, hourly_rate, effective_date, created_by)
         VALUES ($1, $2, $3, $4)`,
        [empId, newRate, effective, userId]
      );
      updatedCount++;
    }

    await client.query('COMMIT');
    res.json({ success: true, message: `Compensation updated for ${updatedCount} employees` });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating compensation:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    client.release();
  }
});

// POST /what-if
router.post('/what-if', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { scenarioType, scenarioValue, employeeIds } = req.body;
    if (!scenarioType || scenarioValue === undefined || scenarioValue <= 0) {
      return res.status(400).json({ success: false, message: 'Valid scenarioType and scenarioValue required' });
    }

    let employeeList: any[];
    if (employeeIds && employeeIds.length > 0) {
      const result = await pool.query(
        `SELECT id FROM users WHERE company_id = $1 AND id = ANY($2)`,
        [companyId, employeeIds]
      );
      employeeList = result.rows;
    } else {
      const result = await pool.query(
        `SELECT id FROM users WHERE company_id = $1 AND role NOT IN ('boss', 'manager')`,
        [companyId]
      );
      employeeList = result.rows;
    }

    if (employeeList.length === 0) {
      return res.status(400).json({ success: false, message: 'No employees found' });
    }

    const currentRates: Record<string, number> = {};
    for (const emp of employeeList) {
      const rateRes = await pool.query(
        `SELECT hourly_rate FROM compensation_history WHERE user_id = $1 AND effective_date <= CURRENT_DATE ORDER BY effective_date DESC LIMIT 1`,
        [emp.id]
      );
      currentRates[emp.id] = rateRes.rows[0]?.hourly_rate || 20.0;
    }

    const currentTotal = Object.values(currentRates).reduce((sum, rate) => sum + rate * 40, 0);
    let newTotal = currentTotal;
    let explanation = '';

    if (scenarioType === 'raise_percent') {
      const factor = 1 + scenarioValue / 100;
      newTotal = currentTotal * factor;
      explanation = `${scenarioValue}% raise applied to ${employeeList.length} employees`;
    } else if (scenarioType === 'raise_fixed') {
      const additional = Object.keys(currentRates).reduce((sum, id) => sum + scenarioValue * 40, 0);
      newTotal = currentTotal + additional;
      explanation = `$${scenarioValue.toFixed(2)}/hr raise applied to ${employeeList.length} employees`;
    } else if (scenarioType === 'hire_count') {
      const avgRate = Object.values(currentRates).reduce((a, b) => a + b, 0) / Object.values(currentRates).length || 20;
      const hireCost = avgRate * 40 * scenarioValue;
      newTotal = currentTotal + hireCost;
      explanation = `Hiring ${scenarioValue} new employee(s) at average rate of $${avgRate.toFixed(2)}/hr`;
    } else {
      return res.status(400).json({ success: false, message: 'Invalid scenarioType' });
    }

    res.json({
      success: true,
      scenario: { type: scenarioType, value: scenarioValue },
      currentTotal: parseFloat(currentTotal.toFixed(2)),
      projectedTotal: parseFloat(newTotal.toFixed(2)),
      delta: parseFloat((newTotal - currentTotal).toFixed(2)),
      explanation,
    });
  } catch (error) {
    console.error('Error running what-if:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── GET PAYROLL BY ID ──────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ success: false, message: 'Invalid payroll ID format' });
    }

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

export default router;