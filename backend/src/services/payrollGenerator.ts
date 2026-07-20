import { pool } from '../config/database';

interface PayrollGenerationResult {
  payrollId: string;
  employeeCount: number;
  totalHours: number;
  totalPay: number;
}

interface EmployeeRateOverride {
  employeeId: string;
  hourlyRate: number;
}

export async function generatePayroll(
  companyId: string,
  periodStart: string,
  periodEnd: string,
  createdBy: string | null = null,
  employeeRates: EmployeeRateOverride[] = []
): Promise<PayrollGenerationResult> {
  const client = await pool.connect();
  try {
    // Fetch time entries
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

    // Build a map of employee rates from the override array
    const rateOverrideMap = new Map<string, number>();
    for (const override of employeeRates) {
      rateOverrideMap.set(override.employeeId, override.hourlyRate);
    }

    // Get the latest hourly rate for each employee (if no override provided)
    const employeeIds = [...new Set(timeEntries.rows.map(row => row.user_id))];
    const latestRates = new Map<string, number>();
    for (const empId of employeeIds) {
      if (rateOverrideMap.has(empId)) {
        latestRates.set(empId, rateOverrideMap.get(empId)!);
      } else {
        const rateRes = await client.query(
          `SELECT hourly_rate FROM compensation_history
           WHERE user_id = $1 AND effective_date <= CURRENT_DATE
           ORDER BY effective_date DESC LIMIT 1`,
          [empId]
        );
        const rate = rateRes.rows[0]?.hourly_rate || 20.0;
        latestRates.set(empId, rate);
      }
    }

    // Group by user and calculate totals with rates
    const userMap = new Map<string, {
      hours: number;
      pay: number;
      rate: number;
      timeEntryIds: string[];
    }>();

    for (const row of timeEntries.rows) {
      const userId = row.user_id;
      if (!userMap.has(userId)) {
        const rate = latestRates.get(userId) || 20.0;
        userMap.set(userId, { hours: 0, pay: 0, rate, timeEntryIds: [] });
      }
      const data = userMap.get(userId)!;
      const totalHours = Number(row.regular_hours || 0) + Number(row.overtime_hours || 0);
      data.hours += totalHours;
      data.pay += totalHours * data.rate;
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

    // Insert payroll items – let the DB compute `pay` from hours and hourly_rate
    for (const [employeeId, data] of userMap) {
      await client.query(
        `INSERT INTO payroll_items (payroll_id, employee_id, hours, hourly_rate, timesheet_ids)
         VALUES ($1, $2, $3, $4, $5)`,
        [payrollId, employeeId, data.hours, data.rate, data.timeEntryIds]
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