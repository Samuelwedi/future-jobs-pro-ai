import { pool } from '../config/database';

interface PayrollGenerationResult {
  payrollId: string;
  employeeCount: number;
  totalHours: number;
  totalPay: number;
}

/**
 * Generate a payroll for a given company and date range.
 * This is used by both the API route and the auto‑scheduler.
 */
export async function generatePayroll(
  companyId: string,
  periodStart: string,
  periodEnd: string,
  createdBy: string | null = null
): Promise<PayrollGenerationResult> {
  const client = await pool.connect();
  try {
    // Fetch time entries for the company in the period
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
      throw new Error('No time entries found in this period');
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

    // Calculate totals
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
      [companyId, periodStart, periodEnd, totalHours, totalPay, createdBy]
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
    return {
      payrollId,
      employeeCount: userMap.size,
      totalHours,
      totalPay,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}