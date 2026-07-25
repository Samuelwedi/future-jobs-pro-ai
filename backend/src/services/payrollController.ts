import { pool } from '../config/database';
import { executePayrollStrategy } from './payrollStrategies';

export async function processEmployeePaycheck(
  employeeId: number,
  grossEarnings: number,
  taxYear: number
): Promise<any> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch employee + region
    const empRes = await client.query(
      `SELECT e.*, tr.country_code, tr.subdivision_code
       FROM employees e
       JOIN tax_regions tr ON e.region_id = tr.id
       WHERE e.id = $1 AND e.is_active = TRUE
       FOR UPDATE`,
      [employeeId]
    );
    if (empRes.rows.length === 0) {
      throw new Error('Active employee not found');
    }
    const employee = empRes.rows[0];

    // 2. Fetch constants
    const constRes = await client.query(
      `SELECT constant_key, constant_value
       FROM payroll_constants
       WHERE region_id = $1 AND tax_year = $2`,
      [employee.region_id, taxYear]
    );
    const constants = constRes.rows.reduce((acc, row) => {
      acc[row.constant_key] = parseFloat(row.constant_value);
      return acc;
    }, {} as any);

    // 3. Fetch brackets
    const bracketRes = await client.query(
      `SELECT threshold_floor::text, marginal_rate::text
       FROM dynamic_tax_brackets
       WHERE region_id = $1 AND tax_year = $2
       ORDER BY threshold_floor`,
      [employee.region_id, taxYear]
    );

    // 4. Get or init YTD balances
    const balRes = await client.query(
      `INSERT INTO employee_ytd_balances (employee_id, tax_year)
       VALUES ($1, $2)
       ON CONFLICT (employee_id) DO UPDATE SET tax_year = $2
       RETURNING accumulated_gross, accumulated_pensionable, accumulated_insurable`,
      [employeeId, taxYear]
    );
    const balances = balRes.rows[0];

    // 5. Calculate
    const result = executePayrollStrategy(
      employee.country_code,
      grossEarnings,
      constants,
      bracketRes.rows,
      {
        accumulated_gross: parseFloat(balances.accumulated_gross || 0),
        accumulated_pensionable: parseFloat(balances.accumulated_pensionable || 0),
        accumulated_insurable: parseFloat(balances.accumulated_insurable || 0),
      },
      employee.pay_periods_per_year,
      parseFloat(employee.personal_tax_exemption || 0)
    );

    // 6. Insert paycheck
    await client.query(
      `INSERT INTO paychecks (employee_id, tax_year, gross_earnings, net_payout, deduction_payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [employeeId, taxYear, grossEarnings, result.netPayout, JSON.stringify(result.breakdown)]
    );

    // 7. Update YTD
    await client.query(
      `UPDATE employee_ytd_balances
       SET accumulated_gross = accumulated_gross + $1,
           accumulated_pensionable = accumulated_pensionable + $1,
           accumulated_insurable = accumulated_insurable + $1
       WHERE employee_id = $2`,
      [grossEarnings, employeeId]
    );

    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}