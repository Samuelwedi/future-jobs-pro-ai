import { pool } from '../config/database';
export const isBillingOwner = (role: string) => ['boss','owner'].includes(role.toLowerCase());
export async function canManageCompanyBilling(userId: string, companyId: string): Promise<boolean> {
  const result=await pool.query(`SELECT u.role FROM users u JOIN companies c ON c.id=u.company_id
    WHERE u.id=$1 AND u.company_id=$2 AND COALESCE(u.is_active,TRUE)=TRUE
      AND COALESCE(NULLIF(to_jsonb(c)->>'is_active','')::boolean,TRUE)=TRUE`,[userId,companyId]);
  const row=result.rows[0];
  if(!row)return false;
  if(isBillingOwner(row.role))return true;
  if(row.role.toLowerCase()!=='manager')return false;
  const grant=await pool.query(`SELECT a.action='billing.permission.granted' AND EXISTS (
       SELECT 1 FROM users owner WHERE owner.id=a.actor_id AND owner.company_id=a.company_id
       AND LOWER(owner.role) IN ('boss','owner') AND COALESCE(owner.is_active,TRUE)=TRUE) AS delegated
     FROM company_admin_audit_logs a WHERE a.company_id=$2 AND a.employee_id=$1
       AND a.action IN ('billing.permission.granted','billing.permission.revoked')
     ORDER BY a.created_at DESC,a.id DESC LIMIT 1`,[userId,companyId]);
  return grant.rows[0]?.delegated===true;
}
export async function setBillingPermission(ownerId:string,companyId:string,managerId:string,enabled:boolean) {
  // Existing audit log is the authoritative grant/revocation record; no schema migration.
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`billing:${companyId}:${managerId}`]);
    const result=await client.query(`INSERT INTO company_admin_audit_logs
      (company_id,actor_id,employee_id,action,details,created_at)
      SELECT owner.company_id,owner.id,member.id,$4,'{}'::jsonb,clock_timestamp()
      FROM users owner JOIN users member ON member.company_id=owner.company_id
      WHERE owner.id=$1 AND owner.company_id=$2 AND member.id=$3
        AND LOWER(owner.role) IN ('boss','owner') AND COALESCE(owner.is_active,TRUE)=TRUE
        AND (NOT $5 OR (LOWER(member.role)='manager' AND COALESCE(member.is_active,TRUE)=TRUE))
      RETURNING id`,[ownerId,companyId,managerId,enabled?'billing.permission.granted':'billing.permission.revoked',enabled]);
    if(!result.rowCount) throw new Error('Only the boss can grant billing permission to an active manager in the same company');
    await client.query('COMMIT');
  } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
}
