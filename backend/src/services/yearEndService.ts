import { pool } from '../config/database';

type PayrollSummary = {
  gross: number;
  cpp: number;
  ei: number;
  tax: number;
};

async function payrollSummary(employeeId: string | number, taxYear: number, companyId?: string): Promise<PayrollSummary> {
  if (!companyId) throw new Error('Authenticated company context is required');
  if (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > new Date().getFullYear() + 1) {
    throw new Error('Invalid tax year');
  }
  const employee = await pool.query(
    'SELECT id FROM users WHERE id = $1 AND company_id = $2',
    [employeeId, companyId],
  );
  if (!employee.rowCount) throw new Error('Employee was not found in your company');

  const result = await pool.query(
    `SELECT
       COALESCE(SUM(COALESCE(pi.hours, 0) * COALESCE(pi.hourly_rate, 0)), 0) AS gross,
       COALESCE(SUM(pi.cpp_deduction), 0) AS cpp,
       COALESCE(SUM(pi.ei_deduction), 0) AS ei,
       COALESCE(SUM(pi.tax_deduction), 0) AS tax
     FROM payroll_items pi
     JOIN payrolls p ON p.id = pi.payroll_id
     WHERE pi.employee_id = $1 AND p.company_id = $2
       AND EXTRACT(YEAR FROM p.period_end) = $3`,
    [employeeId, companyId, taxYear],
  );
  const row = result.rows[0] || {};
  return {
    gross: Number(row.gross || 0),
    cpp: Number(row.cpp || 0),
    ei: Number(row.ei || 0),
    tax: Number(row.tax || 0),
  };
}

export async function compileT4Slip(employeeId: string | number, taxYear: number, companyId?: string) {
  const summary = await payrollSummary(employeeId, taxYear, companyId);
  return {
    t4Manifest: {
      box14_employment_income: summary.gross,
      box16_cpp_withheld: summary.cpp,
      box18_ei_withheld: summary.ei,
      box22_income_tax_withheld: summary.tax,
      box24_insurable_earnings: summary.gross,
      box26_pensionable_earnings: summary.gross,
      box44_union_dues: 0,
      box46_charitable_donations: 0,
      box52_pension_adjustment: 0,
    },
    employerMetrics: {
      employer_cpp_matching: summary.cpp,
      employer_ei_matching: Number((summary.ei * 1.4).toFixed(2)),
    },
    source: 'finalized payroll records',
  };
}

export async function compileT4ASlip(employeeId: string | number, taxYear: number, companyId?: string) {
  const summary = await payrollSummary(employeeId, taxYear, companyId);
  return {
    t4aManifest: {
      box020_self_employed_fees: summary.gross,
      box022_income_tax_withheld: summary.tax,
    },
    source: 'finalized payroll records',
  };
}

export async function compileRL1Slip(employeeId: string | number, taxYear: number, companyId?: string) {
  const summary = await payrollSummary(employeeId, taxYear, companyId);
  return {
    rl1Manifest: {
      box_a_employment_income: summary.gross,
      box_b_qpp_contribution: summary.cpp,
      box_c_qpip_premium: summary.ei,
      box_e_quebec_tax_withheld: summary.tax,
      box_g_pensionable_earnings: summary.gross,
      box_i_insurable_earnings: summary.gross,
    },
    source: 'finalized payroll records',
  };
}
