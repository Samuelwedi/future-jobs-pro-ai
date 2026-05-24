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

// Create a PTO request
export async function createPTORequest(
  userId: string,
  companyId: string,
  startDate: string,
  endDate: string,
  type: string,
  reason?: string
): Promise<PTORequest> {
  const result = await pool.query(
    `INSERT INTO pto_requests (user_id, company_id, start_date, end_date, type, reason)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [userId, companyId, startDate, endDate, type, reason || null]
  );
  return result.rows[0];
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
     FROM pto_requests pr JOIN users u ON pr.user_id = u.id
     WHERE pr.company_id = $1 ORDER BY pr.created_at DESC`,
    [companyId]
  );
  return result.rows;
}

// Get PTO requests for a specific user
export async function getUserPTORequests(userId: string): Promise<PTORequest[]> {
  const result = await pool.query(
    `SELECT * FROM pto_requests WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows;
}

// Get PTO balance for a user (current year)
export async function getUserPTOBalance(userId: string, companyId: string): Promise<PTOBalance> {
  const year = new Date().getFullYear();
  const result = await pool.query(
    `SELECT vacation_days, sick_days, personal_days FROM pto_balances
     WHERE user_id = $1 AND year = $2`,
    [userId, year]
  );

  if (result.rows.length > 0) {
    const b = result.rows[0];
    return {
      vacation_days: parseFloat(b.vacation_days),
      sick_days: parseFloat(b.sick_days),
      personal_days: parseFloat(b.personal_days),
    };
  }

  // Default balance if not set
  return { vacation_days: 10, sick_days: 5, personal_days: 3 };
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