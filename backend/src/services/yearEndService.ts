import Big from 'big.js';
import { pool } from '../config/database';

interface Employee {
  id: number;
  first_name: string;
  last_name: string;
  employment_type: string;
  province: string;
}

interface Paycheck {
  gross_earnings: number;
  deduction_payload: any;
}

// ─── Compile T4 Slip ─────────────────────────────────────────────
export async function compileT4Slip(employeeId: number, taxYear: number) {
  const employee = await getEmployee(employeeId);
  if (!employee || employee.employment_type === 'CONTRACTOR') {
    throw new Error('T4 is only for employees, not contractors');
  }

  const paychecks = await getPaychecks(employeeId, taxYear);
  if (paychecks.length === 0) {
    throw new Error(`No payroll records found for employee ${employeeId} in ${taxYear}`);
  }

  const totals = aggregatePaychecks(paychecks);

  // Get statutory caps
  const caps = await getStatutoryCaps(employeeId, taxYear);
  const maxCPP = new Big(caps.CPP_MAX_EARNINGS || 74600);
  const maxEI = new Big(caps.EI_MAX_EARNINGS || 68900);

  const gross = new Big(totals.gross);
  const box24 = gross.gt(maxEI) ? maxEI : gross;
  const box26 = gross.gt(maxCPP) ? maxCPP : gross;

  return {
    employeeId,
    taxYear,
    t4Manifest: {
      box14_employment_income: totals.gross.toFixed(2),
      box16_cpp_withheld: totals.cpp.toFixed(2),
      box18_ei_withheld: totals.ei.toFixed(2),
      box22_income_tax_withheld: totals.tax.toFixed(2),
      box24_insurable_earnings: box24.toFixed(2),
      box26_pensionable_earnings: box26.toFixed(2),
    },
    employerMetrics: {
      employer_cpp_matching: totals.employerCpp.toFixed(2),
      employer_ei_matching: totals.employerEi.toFixed(2),
    },
  };
}

// ─── Compile T4A Slip ────────────────────────────────────────────
export async function compileT4ASlip(employeeId: number, taxYear: number) {
  const employee = await getEmployee(employeeId);
  if (!employee || employee.employment_type !== 'CONTRACTOR') {
    throw new Error('T4A is only for contractors');
  }

  const paychecks = await getPaychecks(employeeId, taxYear);
  if (paychecks.length === 0) {
    throw new Error(`No payroll records found for contractor ${employeeId} in ${taxYear}`);
  }

  const totals = aggregatePaychecks(paychecks);

  return {
    employeeId,
    taxYear,
    t4aManifest: {
      box020_self_employed_fees: totals.gross.toFixed(2),
      box022_income_tax_withheld: totals.tax.toFixed(2),
    },
  };
}

// ─── Compile RL-1 Slip ────────────────────────────────────────────
export async function compileRL1Slip(employeeId: number, taxYear: number) {
  const employee = await getEmployee(employeeId);
  if (!employee || employee.province !== 'QC') {
    throw new Error('RL-1 is only for Quebec employees');
  }

  const paychecks = await getPaychecks(employeeId, taxYear);
  if (paychecks.length === 0) {
    throw new Error(`No payroll records found for employee ${employeeId} in ${taxYear}`);
  }

  const totals = aggregatePaychecks(paychecks);

  // Quebec-specific caps
  const caps = await getStatutoryCaps(employeeId, taxYear);
  const maxQPP = new Big(caps.CPP_MAX_EARNINGS || 74600);
  const maxQPIP = new Big(caps.QPIP_MAX_EARNINGS || 98500);

  const gross = new Big(totals.gross);

  return {
    employeeId,
    taxYear,
    rl1Manifest: {
      box_a_employment_income: gross.toFixed(2),
      box_b_qpp_contribution: totals.cpp.toFixed(2),
      box_c_qpip_premium: totals.qpip.toFixed(2),
      box_e_quebec_tax_withheld: totals.quebecTax.toFixed(2),
      box_g_pensionable_earnings: gross.gt(maxQPP) ? maxQPP.toFixed(2) : gross.toFixed(2),
      box_i_insurable_earnings: gross.gt(maxQPIP) ? maxQPIP.toFixed(2) : gross.toFixed(2),
    },
  };
}

// ─── Get Employee ─────────────────────────────────────────────────
async function getEmployee(employeeId: number): Promise<Employee | null> {
  const result = await pool.query(
    `SELECT id, first_name, last_name, employment_type, province
     FROM employees WHERE id = $1`,
    [employeeId]
  );
  return result.rows[0] || null;
}

// ─── Get Paychecks ────────────────────────────────────────────────
async function getPaychecks(employeeId: number, taxYear: number): Promise<Paycheck[]> {
  const result = await pool.query(
    `SELECT gross_earnings, deduction_payload
     FROM paychecks
     WHERE employee_id = $1 AND tax_year = $2`,
    [employeeId, taxYear]
  );
  return result.rows;
}

// ─── Aggregate Paychecks ──────────────────────────────────────────
function aggregatePaychecks(paychecks: Paycheck[]) {
  let gross = new Big(0);
  let cpp = new Big(0);
  let ei = new Big(0);
  let tax = new Big(0);
  let quebecTax = new Big(0);
  let qpip = new Big(0);
  let employerCpp = new Big(0);
  let employerEi = new Big(0);

  for (const p of paychecks) {
    gross = gross.plus(new Big(p.gross_earnings));
    const w = p.deduction_payload?.employeeWithholdings || {};
    const e = p.deduction_payload?.employerContributions || {};

    cpp = cpp.plus(new Big(w.cpp || 0));
    ei = ei.plus(new Big(w.ei || 0));
    tax = tax.plus(new Big(w.incomeTax || 0));
    quebecTax = quebecTax.plus(new Big(w.quebecTax || 0));
    qpip = qpip.plus(new Big(w.qpip || 0));
    employerCpp = employerCpp.plus(new Big(e.cpp || 0));
    employerEi = employerEi.plus(new Big(e.ei || 0));
  }

  return {
    gross,
    cpp,
    ei,
    tax,
    quebecTax,
    qpip,
    employerCpp,
    employerEi,
  };
}

// ─── Get Statutory Caps ───────────────────────────────────────────
async function getStatutoryCaps(employeeId: number, taxYear: number): Promise<Record<string, number>> {
  const result = await pool.query(
    `SELECT constant_key, constant_value
     FROM payroll_constants pc
     JOIN employees e ON e.region_id = pc.region_id
     WHERE e.id = $1 AND pc.tax_year = $2`,
    [employeeId, taxYear]
  );
  return result.rows.reduce((acc: any, row: any) => {
    acc[row.constant_key] = parseFloat(row.constant_value);
    return acc;
  }, {});
}