// ============================================
// TIME ENTRY SERVICE (enriched for Timesheet)
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import { pool } from '../config/database';
import { recordUserEvent } from './adaptiveAIService';

export async function clockIn(userId: string, projectId: string, latitude: number, longitude: number) {
  const result = await pool.query(
    `INSERT INTO time_entries (user_id, project_id, clock_in, clock_in_latitude, clock_in_longitude, status)
     VALUES ($1, $2, NOW(), $3, $4, 'active') RETURNING *`,
    [userId, projectId, latitude, longitude]
  );
  const entry = result.rows[0];
  await recordUserEvent({ userId, eventType: 'clock_in', eventData: { projectId, timeEntryId: entry.id }, latitude, longitude });
  return entry;
}

export async function clockOut(userId: string, timeEntryId: string, latitude: number, longitude: number) {
  const result = await pool.query(
    `UPDATE time_entries SET clock_out = NOW(), clock_out_latitude = $1, clock_out_longitude = $2, status = 'completed'
     WHERE id = $3 AND user_id = $4 RETURNING *`,
    [latitude, longitude, timeEntryId, userId]
  );
  const entry = result.rows[0];
  if (entry) {
    await recordUserEvent({ userId, eventType: 'clock_out', eventData: { projectId: entry.project_id, timeEntryId: entry.id }, latitude, longitude });
  }
  return entry;
}

export async function getTimeEntries(userId: string, startDate: string, endDate: string) {
  const result = await pool.query(
    `SELECT te.*, pr.name as project_name, pr.address as project_address
     FROM time_entries te
     JOIN projects pr ON te.project_id = pr.id
     WHERE te.user_id = $1
       AND te.clock_in >= $2::timestamp
       AND te.clock_in < $3::date + interval '1 day'
     ORDER BY te.clock_in DESC`,
    [userId, startDate, endDate]
  );

  const entries = result.rows.map(entry => {
    const hours = entry.clock_out ? (new Date(entry.clock_out).getTime() - new Date(entry.clock_in).getTime()) / 3600000 : 0;
    const regularHours = Math.min(8, hours);
    const overtimeHours = Math.max(0, hours - 8);
    const alerts = buildAlerts(entry);
    return { ...entry, hours: hours.toFixed(2), regularHours: regularHours.toFixed(2), overtimeHours: overtimeHours.toFixed(2), alerts };
  });

  return entries;
}

function buildAlerts(entry: any): string[] {
  const alerts: string[] = [];
  if (!entry.clock_out && entry.status !== 'active') alerts.push('Forgot to clock out');
  return alerts;
}

export async function manualTimeEntry(
  userId: string, projectId: string, clockIn: string, clockOut: string,
  breakMinutes: number = 0, notes: string = '', createdBy: string
) {
  const result = await pool.query(
    `INSERT INTO time_entries (user_id, project_id, clock_in, clock_out, break_minutes, notes, is_manual, created_by, status)
     VALUES ($1,$2,$3,$4,$5,$6,true,$7,'completed') RETURNING *`,
    [userId, projectId, clockIn, clockOut, breakMinutes, notes, createdBy]
  );
  return result.rows[0];
}

export async function updateTimeEntry(entryId: string, updates: { clock_in?: string; clock_out?: string; break_minutes?: number; notes?: string }) {
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
  values.push(entryId);
  const result = await pool.query(`UPDATE time_entries SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);
  return result.rows[0];
}

console.log('⏰ Time Entry Service loaded – Future Jobs Pro AI by Samuel B.');