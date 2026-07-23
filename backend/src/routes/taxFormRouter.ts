import express, { Request, Response } from 'express';
import { pool } from '../config/database';
import { verifyToken } from '../utils/auth';
import { generateT4PDF, generateRL1PDF } from '../services/taxFormService';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// ─── Helper: get company ID from token ──────────────────────────
const getCompanyId = async (req: Request): Promise<string | null> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = verifyToken(req);
    const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
    return userRes.rows[0]?.company_id || null;
  } catch { return null; }
};

// ─── GET /api/tax-forms ─────────────────────────────────────────
// List all tax forms for the company (optionally filter by year)
router.get('/', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { year } = req.query;
    let query = `
      SELECT tf.*,
             u.first_name || ' ' || u.last_name as employee_name,
             u.email
      FROM tax_forms tf
      JOIN users u ON tf.employee_id = u.id
      WHERE tf.company_id = $1
    `;
    const params: any[] = [companyId];
    if (year) {
      query += ` AND tf.year = $2`;
      params.push(year);
    }
    query += ` ORDER BY tf.year DESC, u.last_name, u.first_name`;
    const result = await pool.query(query, params);
    res.json({ success: true, forms: result.rows });
  } catch (error) {
    console.error('Error fetching tax forms:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── POST /api/tax-forms/generate ──────────────────────────────
// Generate T4 or RL-1 forms for all employees for a given year
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { year, formType } = req.body; // formType: 'T4' or 'RL1'
    if (!year || !formType) {
      return res.status(400).json({ success: false, message: 'year and formType required' });
    }
    if (formType !== 'T4' && formType !== 'RL1') {
      return res.status(400).json({ success: false, message: 'formType must be T4 or RL1' });
    }

    const userId = (req as any).user?.id || null;

    // Get all employees (non-manager, non-boss)
    const employees = await pool.query(
      `SELECT id, first_name, last_name, email, sin FROM users
       WHERE company_id = $1 AND role NOT IN ('boss', 'manager')`,
      [companyId]
    );
    if (employees.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'No employees found' });
    }

    const generated = [];
    for (const emp of employees.rows) {
      // Check if a tax form already exists for this employee/year/type
      const existing = await pool.query(
        'SELECT id FROM tax_forms WHERE employee_id = $1 AND year = $2 AND form_type = $3',
        [emp.id, year, formType]
      );
      if (existing.rows.length > 0) {
        // Skip if already exists
        continue;
      }

      // Fetch payroll data for this employee for the year (this is a simplified example)
      // You can customize the data fetching based on your actual payroll tables.
      // For now, we'll generate a dummy set of data.
      const payrollData = {
        employeeId: emp.id,
        year,
        totalIncome: 0,    // should be calculated from payroll_items
        taxDeductions: 0,
        cpp: 0,
        ei: 0,
        // ... other fields
      };

      let pdfUrl: string;
      if (formType === 'T4') {
        pdfUrl = await generateT4PDF(payrollData, emp);
      } else {
        pdfUrl = await generateRL1PDF(payrollData, emp);
      }

      // Insert into DB
      const result = await pool.query(
        `INSERT INTO tax_forms (company_id, employee_id, year, form_type, pdf_url, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [companyId, emp.id, year, formType, pdfUrl, userId]
      );
      generated.push({
        id: result.rows[0].id,
        employeeId: emp.id,
        employeeName: `${emp.first_name} ${emp.last_name}`,
        pdfUrl,
      });
    }

    res.json({ success: true, generated, count: generated.length });
  } catch (error) {
    console.error('Error generating tax forms:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── GET /api/tax-forms/:id/download ────────────────────────────
// Download PDF for a specific tax form
router.get('/:id/download', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { id } = req.params;
    const result = await pool.query(
      'SELECT pdf_url FROM tax_forms WHERE id = $1 AND company_id = $2',
      [id, companyId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Tax form not found' });
    }
    const pdfUrl = result.rows[0].pdf_url;
    const filePath = path.join(__dirname, '../../pdfs', path.basename(pdfUrl));
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'PDF file not found' });
    }
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error downloading tax form:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── DELETE /api/tax-forms/:id ──────────────────────────────────
// Delete a tax form (draft only)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM tax_forms WHERE id = $1 AND company_id = $2 AND status = $3 RETURNING id',
      [id, companyId, 'draft']
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Tax form not found or not draft' });
    }
    res.json({ success: true, message: 'Tax form deleted' });
  } catch (error) {
    console.error('Error deleting tax form:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;