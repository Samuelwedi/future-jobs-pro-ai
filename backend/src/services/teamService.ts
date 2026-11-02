// ============================================
// TEAM SERVICE (Employee Management)
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import {
  transaction,
  requireValue,
  documentId,
  note,
} from "./commercialDocuments";
import { manages } from "../middleware/companyActor";
import { privilegedCompanyRole } from "./companyAdministration";
import { pool } from "../config/database";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { sendInviteEmail } from "./emailService";

export async function inviteEmployee(
  companyId: string,
  email: string,
  firstName: string,
  lastName: string,
  role: string,
  invitedBy: string,
) {
  companyId = documentId(companyId);
  invitedBy = documentId(invitedBy);
  email = note(email, 254).toLowerCase();
  firstName = note(firstName, 100);
  lastName = note(lastName, 100);
  role = String(role).toLowerCase();
  requireValue(
    /^\S+@\S+\.\S+$/.test(email) && firstName && lastName,
    "Enter a valid email, first name, and last name.",
  );
  requireValue(
    ["employee", "manager"].includes(role),
    "Role must be employee or manager",
  );
  const tempPassword = randomBytes(18).toString("base64url");
  const result = await transaction(async (c) => {
    const inviter = (
      await c.query(
        "SELECT id,company_id,LOWER(role) role FROM users WHERE id=$1 AND company_id=$2 AND COALESCE(is_active,true) FOR SHARE",
        [invitedBy, companyId],
      )
    ).rows[0];
    requireValue(
      inviter && manages(inviter),
      "Inviter no longer has manager access in this company.",
      403,
    );
    requireValue(
      role !== "manager" || privilegedCompanyRole(inviter.role),
      "Only an owner or administrator can invite a manager.",
      403,
    );
    requireValue(
      !(await c.query("SELECT id FROM users WHERE LOWER(email)=$1", [email]))
        .rowCount,
      "A user with this email already exists",
      409,
    );
    const company = (
      await c.query("SELECT name FROM companies WHERE id=$1", [companyId])
    ).rows[0];
    requireValue(company, "Company not found", 404);
    const user = (
      await c.query(
        "INSERT INTO users(email,password_hash,first_name,last_name,full_name,role,company_id,must_change_password) VALUES($1,$2,$3,$4,$5,$6,$7,true) RETURNING id,email,first_name,last_name,role,company_id",
        [
          email,
          await bcrypt.hash(tempPassword, 12),
          firstName,
          lastName,
          firstName + " " + lastName,
          role,
          companyId,
        ],
      )
    ).rows[0];
    await c.query(
      "INSERT INTO company_admin_audit_logs(company_id,actor_id,employee_id,action,details) VALUES($1,$2,$3,$4,$5)",
      [
        companyId,
        invitedBy,
        user.id,
        "employee.invited",
        JSON.stringify({ role }),
      ],
    );
    return { user, companyName: company.name };
  });
  let emailSent = true;
  try {
    await sendInviteEmail(email, firstName, tempPassword, result.companyName);
  } catch {
    emailSent = false;
    console.warn("Employee created; invitation delivery failed.");
  }
  return { user: result.user, tempPassword, emailSent };
}

export async function getCompanyMembers(companyId: string) {
  const result = await pool.query(
    "SELECT id,email,first_name,last_name,role,created_at,COALESCE(is_active,true) is_active,must_change_password needs_password_change FROM users WHERE company_id = $1 ORDER BY role, created_at DESC",
    [companyId],
  );
  return result.rows;
}

export async function updateMemberRole(
  userId: string,
  newRole: string,
  companyId: string,
) {
  const result = await pool.query(
    "UPDATE users SET role = $1 WHERE id = $2 AND company_id = $3 RETURNING id, email, first_name, last_name, role",
    [newRole, userId, companyId],
  );
  if (result.rows.length === 0)
    throw new Error("User not found in your company");
  return result.rows[0];
}

export async function removeMember(userId: string, companyId: string) {
  const result = await pool.query(
    "DELETE FROM users WHERE id = $1 AND company_id = $2 RETURNING id",
    [userId, companyId],
  );
  if (result.rows.length === 0)
    throw new Error("User not found in your company");
  return result.rows[0];
}

export async function setPassword(userId: string, newPassword: string) {
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
    passwordHash,
    userId,
  ]);
}

console.log("👥 Team Service loaded – Future Jobs Pro AI by Samuel B.");
