// ============================================
// PTO SERVICE
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import { pool } from '../config/database';
import { sendPushNotification } from './notificationService';

export interface PTORequest {
  id: string;
  user_id: string;
  company_id: string;
  start_date: string;
  end_date: string;
  type: string;
  status: string;
  reason?: string;
  approved_by?: string;
  approved_at?: string;
  created_at: string;
}

export interface PTOBalance {
  vacation_days: number;
  sick_days: number;
  personal_days: number;
}

export class PTOInputError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// Calendar dates must round-trip: JavaScript otherwise normalizes February 30.
export function validatePTORequest(start: unknown, end: unknown, type: unknown, reason: unknown) {
  const validDate = (value: unknown): value is string => typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!validDate(start) || !validDate(end)) throw new PTOInputError(400, 'Enter valid dates in YYYY-MM-DD format');
  if (end < start) throw new PTOInputError(400, 'End date cannot be before start date');
  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000 + 1;
  if (days > 366) throw new PTOInputError(400, 'A PTO request cannot exceed 366 calendar days');
  const normalizedType = typeof type === 'string' ? type.toLowerCase() : 'vacation';
  if (!['vacation', 'sick', 'personal', 'unpaid', 'other'].includes(normalizedType)) throw new PTOInputError(400, 'Unsupported PTO type');
  if (reason != null && (typeof reason !== 'string' || reason.length > 5000)) throw new PTOInputError(400, 'Reason must be text up to 5000 characters');
  return { start, end, type: normalizedType, reason: typeof reason === 'string' ? reason.trim() || null : null, days };
}

export async function createPTORequest(userId: string, companyId: string, startDate: string, endDate: string, type: string, reason?: string, expectedRole?: string): Promise<PTORequest & {calendar_days: number}> {
  const input = validatePTORequest(startDate, endDate, type, reason);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize submissions for this employee before the overlap check.
    const actor = await client.query('SELECT id FROM users WHERE id=$1 AND company_id=$2 AND COALESCE(is_active,TRUE)=TRUE AND ($3::text IS NULL OR LOWER(COALESCE(role,\'employee\'))=$3) FOR UPDATE', [userId, companyId, expectedRole ?? null]);
    if (!actor.rowCount) throw new PTOInputError(403, 'Active company membership is required');
    const overlap = await client.query(`SELECT id FROM pto_requests WHERE user_id=$1 AND status IN ('pending','approved')
      AND start_date::date <= $3::date AND end_date::date >= $2::date LIMIT 1`, [userId, input.start, input.end]);
    if (overlap.rowCount) throw new PTOInputError(409, 'These dates overlap an existing pending or approved PTO request');
    const result = await client.query(`INSERT INTO pto_requests (user_id,company_id,start_date,end_date,type,reason,status)
      VALUES ($1,$2,$3,$4,$5,$6,'pending') RETURNING *`, [userId, companyId, input.start, input.end, input.type, input.reason]);
    await client.query('COMMIT');
    return {...result.rows[0], calendar_days: input.days};
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

// Approve/reject a PTO request
export async function updatePTOStatus(
  requestId: string,
  status: string,
  approvedBy: string
): Promise<PTORequest> {
  const result = await pool.query(
    `UPDATE pto_requests SET status = $1, approved_by = $2, approved_at = NOW(), updated_at = NOW()
     WHERE id = $3 RETURNING *`,
    [status, approvedBy, requestId]
  );

  if (result.rows.length > 0) {
    const req = result.rows[0];
    const title = status === 'approved' ? '✅ PTO Approved' : '❌ PTO Rejected';
    const body = status === 'approved'
      ? `Your ${req.type} leave from ${req.start_date} to ${req.end_date} has been approved.`
      : `Your ${req.type} leave from ${req.start_date} to ${req.end_date} has been rejected.`;

    sendPushNotification(req.user_id, title, body, {
      type: 'pto',
      status,
      requestId: req.id,
    }).catch(err => console.error('PTO notification error:', err));
  }

  return result.rows[0];
}

// Get all PTO requests for a company (for managers)
export async function getCompanyPTORequests(companyId: string): Promise<PTORequest[]> {
  const result = await pool.query(
    `SELECT pr.*, u.first_name || ' ' || u.last_name as user_name
     FROM pto_requests pr JOIN users u ON pr.user_id = u.id AND u.company_id=pr.company_id
     WHERE pr.company_id = $1 ORDER BY pr.created_at DESC`,
    [companyId]
  );
  return result.rows;
}

// Get PTO requests for a specific user
export async function getUserPTORequests(userId: string): Promise<PTORequest[]> {
  const result = await pool.query(
    `SELECT pr.*,
            GREATEST(1, (pr.end_date::date - pr.start_date::date) + 1) AS calendar_days,
            TRIM(COALESCE(approver.first_name, '') || ' ' || COALESCE(approver.last_name, '')) AS approved_by_name
     FROM pto_requests pr JOIN users member ON member.id=pr.user_id AND member.company_id=pr.company_id
     LEFT JOIN users approver ON approver.id = pr.approved_by AND approver.company_id=pr.company_id
     WHERE pr.user_id = $1 AND COALESCE(member.is_active,TRUE)=TRUE ORDER BY pr.created_at DESC`,
    [userId]
  );
  return result.rows;
}

// Get PTO balance for a user (current year)
export async function getUserPTOBalance(userId: string, companyId: string): Promise<PTOBalance | null> {
  const year = new Date().getFullYear();
  const result = await pool.query(
    `SELECT vacation_days, sick_days, personal_days FROM pto_balances
     WHERE user_id = $1 AND year = $2 AND company_id = $3`,
    [userId, year, companyId]
  );

  if (result.rows.length > 0) {
    const b = result.rows[0];
    return {
      vacation_days: parseFloat(b.vacation_days),
      sick_days: parseFloat(b.sick_days),
      personal_days: parseFloat(b.personal_days),
    };
  }

  // Missing entitlement configuration is not an allowance.
  return null;
}

// Initialize or update PTO balance (called by admin or on user creation)
export async function setPTOBalance(
  userId: string,
  companyId: string,
  vacationDays: number,
  sickDays: number,
  personalDays: number
): Promise<void> {
  const year = new Date().getFullYear();
  await pool.query(
    `INSERT INTO pto_balances (user_id, company_id, year, vacation_days, sick_days, personal_days)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id, year) DO UPDATE SET
       vacation_days = $4, sick_days = $5, personal_days = $6`,
    [userId, companyId, year, vacationDays, sickDays, personalDays]
  );
}

console.log('🏖️  PTO Service loaded – Future Jobs Pro AI by Samuel B.');
