import { Request, Response } from 'express';
import { pool } from '../config/database';
import { verifyToken } from '../utils/auth';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
const time = (value: unknown): value is string => typeof value === 'string'
  && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/.test(value);
function calendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

// Advisory snapshot, not a scheduling constraint. Only explicit, persisted
// assignments with a known positive same-day interval are compared. In
// particular, shifts.user_id is also used for the creator and is not evidence
// of assignment. Recurring rules and overnight intent are not inferred here.
export async function scheduleConflictPreview(req: Request, res: Response) {
  let actorId: string;
  try {
    actorId = verifyToken(req).id;
    if (!uuid(actorId)) throw new Error('Invalid actor');
  } catch {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }
  try {
    const actor = (await pool.query(
      'SELECT company_id, role FROM users WHERE id = $1 AND COALESCE(is_active, TRUE) = TRUE', [actorId],
    )).rows[0];
    if (!actor?.company_id) return res.status(401).json({ success: false, message: 'Not authenticated' });
    if (!['boss', 'manager', 'admin'].includes(actor.role)) {
      return res.status(403).json({ success: false, message: 'Manager access is required to check assignments' });
    }

    const { date, startTime, endTime, projectId, employeeIds, excludeShiftId } = req.body || {};
    if (!calendarDate(date) || !time(startTime) || !time(endTime) || !uuid(projectId)
      || !Array.isArray(employeeIds) || employeeIds.length < 1 || employeeIds.length > 100
      || !employeeIds.every(uuid) || (excludeShiftId !== undefined && !uuid(excludeShiftId))) {
      return res.status(400).json({ success: false, message: 'A valid date, times, project, and 1–100 employee IDs are required' });
    }
    const selectedIds = [...new Set<string>(employeeIds.map((id: string) => id.toLowerCase()))];
    const companyId = actor.company_id;
    const project = await pool.query('SELECT id FROM projects WHERE id = $1 AND company_id = $2', [projectId, companyId]);
    const people = await pool.query('SELECT id FROM users WHERE id = ANY($1::uuid[]) AND company_id = $2', [selectedIds, companyId]);
    if (!project.rowCount || people.rowCount !== selectedIds.length) {
      return res.status(403).json({ success: false, message: 'Project or employees are not available in your company' });
    }
    if (excludeShiftId) {
      const existing = await pool.query(
        `SELECT s.id FROM shifts s JOIN projects p ON p.id = s.project_id
         WHERE s.id = $1 AND p.company_id = $2`, [excludeShiftId, companyId],
      );
      if (!existing.rowCount) return res.status(404).json({ success: false, message: 'Shift not found or unauthorized' });
    }

    // SQL time comparison preserves seconds and never introduces a timezone.
    const result = await pool.query(
      `WITH candidates AS (
         SELECT s.id, sa.user_id, s.start_time, s.end_time
         FROM shifts s
         JOIN projects p ON p.id = s.project_id AND p.company_id = $1
         JOIN shift_assignments sa ON sa.shift_id = s.id
         JOIN users employee ON employee.id = sa.user_id AND employee.company_id = $1
         WHERE s.date = $2::date AND sa.user_id = ANY($3::uuid[])
           AND ($4::uuid IS NULL OR s.id <> $4::uuid)
       )
       SELECT $5::time < $6::time AS applicable,
         COUNT(DISTINCT user_id) FILTER (WHERE start_time < end_time
           AND $5::time < $6::time AND start_time < $6::time AND end_time > $5::time)::int AS employee_count,
         COUNT(DISTINCT id) FILTER (WHERE start_time < end_time
           AND $5::time < $6::time AND start_time < $6::time AND end_time > $5::time)::int AS shift_count,
         COUNT(DISTINCT id) FILTER (WHERE start_time IS NULL OR end_time IS NULL OR start_time >= end_time)::int AS unchecked_count
       FROM candidates`,
      [companyId, date, selectedIds, excludeShiftId || null, startTime, endTime],
    );
    const summary = result.rows[0];
    return res.json({
      success: true,
      coverage: 'saved_same_day_assignments',
      applicable: summary.applicable,
      conflictingEmployeeCount: summary.employee_count,
      conflictingShiftCount: summary.shift_count,
      uncheckedShiftCount: summary.unchecked_count,
    });
  } catch {
    // Do not echo database details or misrepresent an unavailable check as clear.
    return res.status(503).json({ success: false, message: 'Overlap check is unavailable. Review the schedule manually.' });
  }
}
