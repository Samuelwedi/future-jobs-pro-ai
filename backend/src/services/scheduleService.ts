// ============================================
// SCHEDULE SERVICE (with notifications)
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import { pool } from '../config/database';
import { sendPushNotification } from './notificationService';

// ----- Types -----
export interface Shift {
  id: string;
  company_id: string;
  project_id: string;
  name: string;
  date: string;
  start_time: string;
  end_time: string;
  notes?: string;
  created_by?: string;
  created_at: string;
}

export interface ShiftAssignment {
  id: string;
  shift_id: string;
  user_id: string;
  status: string;
  user_name?: string;
}

// ============================================
// SHIFTS
// ============================================

export async function createShift(
  companyId: string,
  projectId: string,
  name: string,
  date: string,
  startTime: string,
  endTime: string,
  createdBy: string,
  notes?: string
): Promise<Shift> {
  const result = await pool.query(
    `INSERT INTO shifts (company_id, project_id, name, date, start_time, end_time, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [companyId, projectId, name, date, startTime, endTime, notes || null, createdBy]
  );
  return result.rows[0];
}

export async function updateShift(
  shiftId: string,
  updates: { name?: string; date?: string; start_time?: string; end_time?: string; notes?: string }
): Promise<Shift> {
  const fields: string[] = [];
  const values: any[] = [];
  let idx = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = $${idx}`);
      values.push(value);
      idx++;
    }
  }
  if (fields.length === 0) throw new Error('No fields to update');
  values.push(shiftId);
  const result = await pool.query(
    `UPDATE shifts SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
    values
  );
  return result.rows[0];
}

export async function deleteShift(shiftId: string): Promise<void> {
  await pool.query('DELETE FROM shifts WHERE id = $1', [shiftId]);
}

export async function getCompanyShifts(
  companyId: string,
  startDate: string,
  endDate: string
): Promise<Shift[]> {
  const result = await pool.query(
    `SELECT * FROM shifts WHERE company_id = $1 AND date BETWEEN $2 AND $3 ORDER BY date, start_time`,
    [companyId, startDate, endDate]
  );
  return result.rows;
}

export async function getShiftById(shiftId: string): Promise<Shift> {
  const result = await pool.query('SELECT * FROM shifts WHERE id = $1', [shiftId]);
  return result.rows[0];
}

// ============================================
// ASSIGNMENTS (with push notifications)
// ============================================

export async function assignEmployee(shiftId: string, userId: string): Promise<ShiftAssignment> {
  const result = await pool.query(
    `INSERT INTO shift_assignments (shift_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING *`,
    [shiftId, userId]
  );

  if (result.rows.length > 0) {
    // Send notification to the assigned employee
    const shift = await getShiftById(shiftId);
    sendPushNotification(
      userId,
      '📅 New Shift Assigned',
      `You've been assigned to "${shift.name}" on ${shift.date} from ${shift.start_time} to ${shift.end_time}`,
      { type: 'schedule', shiftId }
    ).catch(err => console.error('Schedule notification error:', err));
  }

  return result.rows[0];
}

export async function unassignEmployee(shiftId: string, userId: string): Promise<void> {
  await pool.query('DELETE FROM shift_assignments WHERE shift_id = $1 AND user_id = $2', [shiftId, userId]);

  const shift = await getShiftById(shiftId);
  sendPushNotification(
    userId,
    '📅 Shift Removed',
    `You have been removed from "${shift.name}" on ${shift.date}`,
    { type: 'schedule', shiftId }
  ).catch(err => console.error('Schedule unassign notification error:', err));
}

export async function getShiftAssignments(shiftId: string): Promise<ShiftAssignment[]> {
  const result = await pool.query(
    `SELECT sa.*, u.first_name || ' ' || u.last_name as user_name
     FROM shift_assignments sa JOIN users u ON sa.user_id = u.id
     WHERE sa.shift_id = $1`,
    [shiftId]
  );
  return result.rows;
}

export async function getUserShifts(
  userId: string,
  startDate: string,
  endDate: string
): Promise<any[]> {
  const result = await pool.query(
    `SELECT s.*, pr.name as project_name
     FROM shifts s
     JOIN shift_assignments sa ON s.id = sa.shift_id
     JOIN projects pr ON s.project_id = pr.id
     WHERE sa.user_id = $1 AND s.date BETWEEN $2 AND $3
     ORDER BY s.date, s.start_time`,
    [userId, startDate, endDate]
  );
  return result.rows;
}

// ============================================
// Notify all assigned employees of a shift update
// ============================================

export async function notifyShiftUpdate(shiftId: string): Promise<void> {
  const shift = await getShiftById(shiftId);
  const assignments = await getShiftAssignments(shiftId);

  for (const a of assignments) {
    sendPushNotification(
      a.user_id,
      '📅 Shift Updated',
      `"${shift.name}" on ${shift.date} has been updated. ${shift.start_time} – ${shift.end_time}`,
      { type: 'schedule', shiftId }
    ).catch(err => console.error('Shift update notification error:', err));
  }
}

console.log('📅 Schedule Service (with notifications) loaded – Future Jobs Pro AI by Samuel B.');