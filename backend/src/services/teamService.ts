// ============================================
// TEAM SERVICE (Employee Management)
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import { pool } from '../config/database';
import bcrypt from 'bcryptjs';

export async function inviteEmployee(
  companyId: string,
  email: string,
  firstName: string,
  lastName: string,
  role: string,
  invitedBy: string
) {
  console.log('📝 Inviting employee:', { companyId, email, firstName, lastName, role, invitedBy });

  // 1. Check if invitedBy exists and has the same company
  const inviter = await pool.query('SELECT id, company_id FROM users WHERE id = $1', [invitedBy]);
  if (inviter.rows.length === 0) {
    throw new Error('Inviter not found');
  }
  if (inviter.rows[0].company_id !== companyId) {
    throw new Error('Inviter does not belong to this company');
  }

  // 2. Check if user already exists
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    throw new Error('A user with this email already exists');
  }

  // 3. Generate temporary password and hash
  const tempPassword = Math.random().toString(36).slice(-10);
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  const fullName = `${firstName} ${lastName}`;

  // 4. Insert new user
  const result = await pool.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, full_name, role, company_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, email, first_name, last_name, role, company_id`,
    [email, passwordHash, firstName, lastName, fullName, role, companyId]
  );

  const user = result.rows[0];
  console.log('✅ Employee invited:', user);
  return { user, tempPassword };
}

export async function getCompanyMembers(companyId: string) {
  const result = await pool.query(
    'SELECT id, email, first_name, last_name, role, created_at FROM users WHERE company_id = $1 ORDER BY role, created_at DESC',
    [companyId]
  );
  return result.rows;
}

export async function updateMemberRole(userId: string, newRole: string, companyId: string) {
  const result = await pool.query(
    'UPDATE users SET role = $1 WHERE id = $2 AND company_id = $3 RETURNING id, email, first_name, last_name, role',
    [newRole, userId, companyId]
  );
  if (result.rows.length === 0) throw new Error('User not found in your company');
  return result.rows[0];
}

export async function removeMember(userId: string, companyId: string) {
  const result = await pool.query(
    'DELETE FROM users WHERE id = $1 AND company_id = $2 RETURNING id',
    [userId, companyId]
  );
  if (result.rows.length === 0) throw new Error('User not found in your company');
  return result.rows[0];
}

export async function setPassword(userId: string, newPassword: string) {
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await pool.query(
    'UPDATE users SET password_hash = $1 WHERE id = $2',
    [passwordHash, userId]
  );
}

console.log('👥 Team Service loaded – Future Jobs Pro AI by Samuel B.');