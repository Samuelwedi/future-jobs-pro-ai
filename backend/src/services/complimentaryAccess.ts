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
