import express, { Request, Response } from 'express';
import { pool } from '../config/database';
import { verifyToken } from '../utils/auth';
import { generateT4PDF, generateRL1PDF } from '../services/taxFormService';
import fs from 'fs';
import path from 'path';

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

router.get('/', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { year } = req.query;
    let query = `
      SELECT tf.*,
             u.first_name || ' ' || u.last_name as employee_name,
             u.email,
             u.sin
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

router.post('/generate', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { year, formType } = req.body;
    if (!year || !formType) {
      return res.status(400).json({ success: false, message: 'year and formType required' });
    }
    if (formType !== 'T4' && formType !== 'RL1') {
      return res.status(400).json({ success: false, message: 'formType must be T4 or RL1' });
    }

    const userId = (req as any).user?.id || null;

    // Get all employees (excluding bosses and managers)
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
      // Check if already exists
      const existing = await pool.query(
        'SELECT id FROM tax_forms WHERE employee_id = $1 AND year = $2 AND form_type = $3',
        [emp.id, year, formType]
      );
      if (existing.rows.length > 0) continue;

      // Build payroll data – we need to fetch actual payroll totals from payroll_items
      // This is a placeholder – you should calculate from your payroll data.
      const payrollData = {
        employeeId: emp.id,
        year,
        totalIncome: 0,
        taxDeductions: 0,
        cpp: 0,
        ei: 0,
      };

      let pdfUrl: string;
      if (formType === 'T4') {
        pdfUrl = await generateT4PDF(payrollData, emp);
      } else {
        pdfUrl = await generateRL1PDF(payrollData, emp);
      }

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