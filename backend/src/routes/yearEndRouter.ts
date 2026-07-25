import express, { Request, Response } from 'express';
import { pool } from '../config/database';
import { verifyToken } from '../utils/auth';
import {
  compileT4Slip,
  compileT4ASlip,
  compileRL1Slip,
} from '../services/yearEndService';

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

// ─── GET /api/year-end/employees ─────────────────────────────────
// List all employees with their employment type and province
router.get('/employees', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const result = await pool.query(
      `SELECT id, first_name, last_name, employment_type, province
       FROM employees
       WHERE company_id = $1
       ORDER BY last_name, first_name`,
      [companyId]
    );
    res.json({ success: true, employees: result.rows });
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── GET /api/year-end/employee/:employeeId/forms ────────────────
router.get('/employee/:employeeId/forms', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { employeeId } = req.params;
    const result = await pool.query(
      `SELECT id, first_name, last_name, employment_type, province
       FROM employees WHERE id = $1 AND company_id = $2`,
      [employeeId, companyId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }
    const emp = result.rows[0];

    const forms: string[] = [];
    if (emp.employment_type === 'EMPLOYEE') {
      forms.push('T4');
      if (emp.province === 'QC') forms.push('RL1');
    } else if (emp.employment_type === 'CONTRACTOR') {
      forms.push('T4A');
    }

    res.json({ success: true, employee: emp, availableForms: forms });
  } catch (error) {
    console.error('Error fetching employee forms:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── GET /api/year-end/preview ────────────────────────────────────
router.get('/preview', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { employeeId, taxYear, formType } = req.query;
    if (!employeeId || !taxYear || !formType) {
      return res.status(400).json({ success: false, message: 'Missing required parameters' });
    }

    const id = Number(employeeId);
    const year = Number(taxYear);
    let result;

    switch (formType) {
      case 'T4':
        result = await compileT4Slip(id, year);
        break;
      case 'T4A':
        result = await compileT4ASlip(id, year);
        break;
      case 'RL1':
        result = await compileRL1Slip(id, year);
        break;
      default:
        return res.status(400).json({ success: false, message: 'Invalid form type' });
    }

    res.json({ success: true, preview: result });
  } catch (error: any) {
    console.error('Preview error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── POST /api/year-end/finalize ──────────────────────────────────
router.post('/finalize', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { employeeId, taxYear, formType } = req.body;
    if (!employeeId || !taxYear || !formType) {
      return res.status(400).json({ success: false, message: 'Missing required parameters' });
    }

    await client.query('BEGIN');

    let result;
    switch (formType) {
      case 'T4': {
        const data = await compileT4Slip(employeeId, taxYear);
        const m = data.t4Manifest;
        const em = data.employerMetrics;
        await client.query(
          `INSERT INTO generated_t4_slips
           (employee_id, tax_year, box_14_employment_income, box_16_cpp_withheld,
            box_18_ei_withheld, box_22_income_tax_withheld,
            box_24_insurable_earnings, box_26_pensionable_earnings,
            employer_cpp_matching, employer_ei_matching)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (employee_id, tax_year) DO UPDATE SET
           box_14_employment_income = EXCLUDED.box_14_employment_income,
           box_16_cpp_withheld = EXCLUDED.box_16_cpp_withheld,
           box_18_ei_withheld = EXCLUDED.box_18_ei_withheld,
           box_22_income_tax_withheld = EXCLUDED.box_22_income_tax_withheld,
           box_24_insurable_earnings = EXCLUDED.box_24_insurable_earnings,
           box_26_pensionable_earnings = EXCLUDED.box_26_pensionable_earnings,
           employer_cpp_matching = EXCLUDED.employer_cpp_matching,
           employer_ei_matching = EXCLUDED.employer_ei_matching,
           generated_at = CURRENT_TIMESTAMP`,
          [
            employeeId,
            taxYear,
            m.box14_employment_income,
            m.box16_cpp_withheld,
            m.box18_ei_withheld,
            m.box22_income_tax_withheld,
            m.box24_insurable_earnings,
            m.box26_pensionable_earnings,
            em.employer_cpp_matching,
            em.employer_ei_matching,
          ]
        );
        result = data;
        break;
      }
      case 'T4A': {
        const data = await compileT4ASlip(employeeId, taxYear);
        const m = data.t4aManifest;
        await client.query(
          `INSERT INTO generated_t4a_slips
           (employee_id, tax_year, box_020_self_employed_fees, box_022_income_tax_withheld)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (employee_id, tax_year) DO UPDATE SET
           box_020_self_employed_fees = EXCLUDED.box_020_self_employed_fees,
           box_022_income_tax_withheld = EXCLUDED.box_022_income_tax_withheld`,
          [employeeId, taxYear, m.box020_self_employed_fees, m.box022_income_tax_withheld]
        );
        result = data;
        break;
      }
      case 'RL1': {
        const data = await compileRL1Slip(employeeId, taxYear);
        const m = data.rl1Manifest;
        await client.query(
          `INSERT INTO generated_rl1_slips
           (employee_id, tax_year, box_a_employment_income, box_b_qpp_contribution,
            box_c_qpip_premium, box_e_quebec_tax_withheld,
            box_g_pensionable_earnings, box_i_insurable_earnings)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (employee_id, tax_year) DO UPDATE SET
           box_a_employment_income = EXCLUDED.box_a_employment_income,
           box_b_qpp_contribution = EXCLUDED.box_b_qpp_contribution,
           box_c_qpip_premium = EXCLUDED.box_c_qpip_premium,
           box_e_quebec_tax_withheld = EXCLUDED.box_e_quebec_tax_withheld,
           box_g_pensionable_earnings = EXCLUDED.box_g_pensionable_earnings,
           box_i_insurable_earnings = EXCLUDED.box_i_insurable_earnings`,
          [
            employeeId,
            taxYear,
            m.box_a_employment_income,
            m.box_b_qpp_contribution,
            m.box_c_qpip_premium,
            m.box_e_quebec_tax_withheld,
            m.box_g_pensionable_earnings,
            m.box_i_insurable_earnings,
          ]
        );
        result = data;
        break;
      }
      default:
        throw new Error('Invalid form type');
    }

    await client.query('COMMIT');
    res.json({ success: true, message: `${formType} slip finalized`, result });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Finalize error:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

export default router;