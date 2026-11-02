import crypto from "crypto";
import { requireValue } from "./commercialDocuments";
export const privilegedCompanyRole = (role: unknown) =>
  ["boss", "owner", "admin"].includes(String(role).toLowerCase());
export function canManageCompanyMember(
  actor: { id: string; role: string },
  target: { id: string; role: string },
) {
  const role = String(target.role || "employee").toLowerCase();
  return (
    ["boss", "owner", "manager", "admin"].includes(
      String(actor.role).toLowerCase(),
    ) &&
    actor.id !== target.id &&
    ["employee", "manager"].includes(role) &&
    (role === "employee" || privilegedCompanyRole(actor.role))
  );
}
export const adminUserQuery = `SELECT u.id,u.company_id,LOWER(COALESCE(u.role,'employee')) role,COALESCE(u.is_active,true) is_active,u.first_name,u.last_name,u.full_name,u.email,u.date_of_birth,u.sin,u.password_hash,u.updated_at,
 (SELECT hourly_rate FROM compensation_history ch WHERE ch.user_id=u.id AND ch.effective_date<=(CURRENT_TIMESTAMP AT TIME ZONE $3)::date ORDER BY effective_date DESC,created_at DESC,id DESC LIMIT 1) hourly_rate,
 (SELECT effective_date FROM compensation_history ch WHERE ch.user_id=u.id AND ch.effective_date<=(CURRENT_TIMESTAMP AT TIME ZONE $3)::date ORDER BY effective_date DESC,created_at DESC,id DESC LIMIT 1) rate_effective_date,
 (SELECT id FROM compensation_history ch WHERE ch.user_id=u.id ORDER BY created_at DESC,id DESC LIMIT 1) latest_compensation_id,(SELECT COUNT(*)::text FROM compensation_history ch WHERE ch.user_id=u.id) compensation_count FROM users u`;
export function adminVersion(row: any) {
  const secret = process.env.JWT_SECRET;
  requireValue(secret, "Administration is unavailable.", 503);
  return crypto
    .createHmac("sha256", secret!)
    .update(
      JSON.stringify([
        row.id,
        row.company_id,
        row.role,
        row.is_active,
        row.first_name,
        row.last_name,
        row.full_name,
        row.email,
        row.date_of_birth,
        row.sin,
        row.password_hash,
        row.updated_at,
        row.hourly_rate,
        row.rate_effective_date,
        row.latest_compensation_id,
        row.compensation_count,
      ]),
    )
    .digest("hex");
}
export function checkAdminVersion(row: any, version: unknown) {
  const supplied = String(version || "");
  requireValue(
    /^[a-f0-9]{64}$/.test(supplied) &&
      crypto.timingSafeEqual(
        Buffer.from(adminVersion(row)),
        Buffer.from(supplied),
      ),
    "The employee record changed. Refresh before saving.",
    409,
  );
}
export function adminEmployee(actor: any, row: any) {
  const sin = String(row.sin || "").replace(/\s/g, "");
  return {
    id: row.id,
    firstName: row.first_name || "",
    lastName: row.last_name || "",
    fullName:
      row.full_name ||
      [row.first_name, row.last_name].filter(Boolean).join(" "),
    email: row.email,
    role: row.role,
    isActive: row.is_active,
    dateOfBirth: row.date_of_birth
      ? new Date(row.date_of_birth).toISOString().slice(0, 10)
      : null,
    hourlyRate: row.hourly_rate == null ? null : String(row.hourly_rate),
    rateEffectiveDate: row.rate_effective_date
      ? new Date(row.rate_effective_date).toISOString().slice(0, 10)
      : null,
    recordVersion: adminVersion(row),
    canManage: canManageCompanyMember(actor, row),
    tax: {
      configured: !!sin,
      maskedSin: sin ? "••••••" + sin.slice(-3) : null,
    },
    directDeposit: {
      configured: false,
      accountHolder: "",
      accountType: "",
      maskedRouting: null,
      maskedAccount: null,
    },
  };
}
