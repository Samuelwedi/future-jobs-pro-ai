import { pool } from '../config/database';
// Operator-configured identities only. Email addresses never grant access at runtime.
export function hasComplimentaryAccess(userId: string, companyId: string): boolean {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(userId) || !uuid.test(companyId)) return false;
  const configured = (process.env.COMPLIMENTARY_TESTER_IDENTITY || '').trim().toLowerCase();
  return configured === `${userId}:${companyId}`.toLowerCase();
}
export const complimentarySubscription = () => ({
  plan: 'tester', status: 'active', provider: 'complimentary', currentPeriodEnd: null,
  cancelAtPeriodEnd: false, hasStripeSubscription: false, complimentary: true,
  label: 'Permanent complimentary tester access',
});

// Membership is checked against live database records, never client claims or email.
export async function hasComplimentaryCompanyAccess(userId: string, companyId: string): Promise<boolean> {
  const configured = (process.env.COMPLIMENTARY_TESTER_IDENTITY || '').trim().toLowerCase();
  const [ownerId, configuredCompany, extra] = configured.split(':');
  if (extra || !ownerId || configuredCompany !== companyId.toLowerCase()
      || !hasComplimentaryAccess(ownerId, companyId)) return false;
  const result = await pool.query(`SELECT 1 FROM users member
    JOIN companies c ON c.id=member.company_id
    JOIN users sponsor ON sponsor.company_id=c.id AND sponsor.id=$3
    WHERE member.id=$1 AND c.id=$2 AND COALESCE(member.is_active,TRUE)=TRUE
      AND COALESCE(sponsor.is_active,TRUE)=TRUE AND LOWER(sponsor.role) IN ('boss','owner')
      AND COALESCE(NULLIF(to_jsonb(c)->>'is_active','')::boolean,TRUE)=TRUE`,
    [userId,companyId,ownerId]);
  return Boolean(result.rowCount);
}
