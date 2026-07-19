import { pool } from '../config/database';

interface GenerateOptions {
  recurringShiftId: string;
  startDate: Date;
  endDate: Date;
  companyId: string;
  createdBy: string;
}

/**
 * Generate actual shift records from a recurring rule for a date range.
 * Returns the number of shifts inserted.
 */
export async function generateShiftsForRecurringRule({
  recurringShiftId,
  startDate,
  endDate,
  companyId,
  createdBy,
}: GenerateOptions): Promise<number> {
  // Fetch the recurring rule
  const ruleResult = await pool.query(
    `SELECT * FROM recurring_shifts WHERE id = $1 AND is_active = true`,
    [recurringShiftId]
  );
  if (ruleResult.rows.length === 0) {
    throw new Error('Recurring shift rule not found or inactive');
  }
  const rule = ruleResult.rows[0];

  // Generate all dates between startDate and endDate that match the day_of_week
  const dates: Date[] = [];
  let current = new Date(startDate);
  const end = new Date(endDate);
  // Normalize time to midnight for comparison
  current.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  while (current <= end) {
    if (current.getDay() === rule.day_of_week) {
      dates.push(new Date(current));
    }
    current.setDate(current.getDate() + 1);
  }

  if (dates.length === 0) return 0;

  // Insert shifts for each date
  let insertedCount = 0;
  for (const date of dates) {
    // Combine date with start_time and end_time
    const start = new Date(date);
    const [sh, sm] = rule.start_time.split(':').map(Number);
    start.setHours(sh, sm, 0, 0);

    const endTime = new Date(date);
    const [eh, em] = rule.end_time.split(':').map(Number);
    endTime.setHours(eh, em, 0, 0);

    // Check if a shift already exists for this date + employee (prevent duplicates)
    const existing = await pool.query(
      `SELECT id FROM shifts
       WHERE date = $1::date
         AND start_time = $2::time
         AND end_time = $3::time
         AND user_id = $4
         AND recurring_shift_id = $5`,
      [date.toISOString().split('T')[0], rule.start_time, rule.end_time, rule.employee_id, recurringShiftId]
    );
    if (existing.rows.length > 0) {
      // Skip duplicate
      continue;
    }

    // Insert shift
    const shiftResult = await pool.query(
      `INSERT INTO shifts
       (name, date, start_time, end_time, project_id, notes, created_by,
        user_id, recurring_shift_id, attachment_url, attachment_type)
       VALUES ($1, $2::date, $3::time, $4::time, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        rule.title || 'Recurring Shift',
        date.toISOString().split('T')[0],
        rule.start_time,
        rule.end_time,
        rule.project_id || null,
        null, // notes
        createdBy,
        rule.employee_id, // assign the shift to the employee
        recurringShiftId,
        null, // attachment_url
        null, // attachment_type
      ]
    );

    const shiftId = shiftResult.rows[0].id;

    // Also add the employee to shift_assignments (optional, but useful for consistency)
    await pool.query(
      `INSERT INTO shift_assignments (shift_id, user_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [shiftId, rule.employee_id]
    );

    insertedCount++;
  }

  return insertedCount;
}