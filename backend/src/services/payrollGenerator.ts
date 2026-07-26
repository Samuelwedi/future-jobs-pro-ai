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

// ─── Canadian Payroll Deduction Rates (2024) ────────────────────
const CPP_RATE = 0.0595;
const EI_RATE = 0.0163;
const FEDERAL_TAX_RATE = 0.15;

export async function generatePayroll(
  companyId: string,
  periodStart: string,
  periodEnd: string,
  createdBy: string | null = null,
  employeeRates: EmployeeRateOverride[] = []
): Promise<PayrollGenerationResult> {
  const client = await pool.connect();
  try {
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

    const rateOverrideMap = new Map<string, number>();
    for (const override of employeeRates) {
      rateOverrideMap.set(override.employeeId, override.hourlyRate);
    }

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
        const rate = rateRes.rows[0]?.hourly_rate || 0;
        latestRates.set(empId, Number(rate));
      }
    }

    const userMap = new Map<string, {
      hours: number;
      pay: number;
      rate: number;
      timeEntryIds: string[];
    }>();

    for (const row of timeEntries.rows) {
      const userId = row.user_id;
      if (!userMap.has(userId)) {
        const rate = latestRates.get(userId) || 0;
        userMap.set(userId, { hours: 0, pay: 0, rate, timeEntryIds: [] });
      }
      const data = userMap.get(userId)!;
      const totalHours = Number(row.regular_hours || 0) + Number(row.overtime_hours || 0);
      data.hours += totalHours;
      data.pay += totalHours * data.rate;
      data.timeEntryIds.push(row.id);
    }

    let totalHours = 0;
    let totalPay = 0;
    for (const [_, data] of userMap) {
      totalHours += data.hours;
      totalPay += data.pay;
    }

    const payrollResult = await client.query(
      `INSERT INTO payrolls (company_id, period_start, period_end, total_hours, total_pay, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [companyId, periodStart, periodEnd, totalHours, totalPay, createdBy]
    );
    const payrollId = payrollResult.rows[0].id;

    for (const [employeeId, data] of userMap) {
      const grossPay = data.pay;
      const cpp = grossPay * CPP_RATE;
      const ei = grossPay * EI_RATE;
      const tax = grossPay * FEDERAL_TAX_RATE;
      const totalDeductions = cpp + ei + tax;
      const adjustments = -totalDeductions;

      await client.query(
        `INSERT INTO payroll_items
         (payroll_id, employee_id, hours, hourly_rate, adjustments,
          cpp_deduction, ei_deduction, tax_deduction, timesheet_ids,
          vacation_hours, banked_hours)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          payrollId,
          employeeId,
          data.hours,
          data.rate,
          adjustments,
          cpp,
          ei,
          tax,
          data.timeEntryIds,
          0, // vacation_hours placeholder
          0, // banked_hours placeholder
        ]
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