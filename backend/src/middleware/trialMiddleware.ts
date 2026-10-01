import { NextFunction, Request, Response } from 'express';
import { hasComplimentaryAccess } from '../services/complimentaryAccess';
import { pool } from '../config/database';
import { verifyToken } from '../utils/auth';

export type SubscriptionActor = {
  id: string;
  companyId: string;
  role: string;
  name: string;
  subscriptionStatus: string;
  subscriptionTier: string;
  subscriptionProvider: string | null;
  entitlementEndsAt: Date | null;
};

const PUBLIC_API_PREFIXES = [
  '/api/auth',
  '/api/stripe',
  '/api/subscriptions',
  '/api/kiosk-public',
  '/api/support',
  '/api/support-agent',
  '/api/system-reliability',
  '/api/admin',
];

const PUBLIC_API_ENDPOINTS = new Set([
  '/api/health',
  '/api/operations/accept-invite',
  '/api/integrations/quickbooks/callback',
  '/api/integrations/stripe/callback',
]);

function requestPath(req: Request): string {
  const originalPath = String(req.originalUrl || req.url || req.path || '').split('?')[0];
  if (originalPath.startsWith('/api')) return originalPath.replace(/\/+$/, '') || '/';
  const mountedPath = `${req.baseUrl || ''}${req.path || ''}`.split('?')[0];
  return mountedPath.replace(/\/+$/, '') || '/';
}

export function isPublicSubscriptionPath(req: Request): boolean {
  if (req.method === 'OPTIONS') return true;
  const path = requestPath(req);
  if (PUBLIC_API_ENDPOINTS.has(path)) return true;
  return PUBLIC_API_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export async function loadSubscriptionActor(
  userId: string,
  claimedCompanyId?: string,
): Promise<SubscriptionActor> {
  const result = await pool.query(
    `SELECT u.id,
            u.company_id,
            LOWER(COALESCE(u.role, '')) AS role,
            TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS name,
            LOWER(COALESCE(c.subscription_status, 'inactive')) AS subscription_status,
            LOWER(COALESCE(c.subscription_tier, 'trial')) AS subscription_tier,
            NULLIF(c.subscription_provider, '') AS subscription_provider,
            COALESCE(c.subscription_current_period_end, c.subscription_expires_at) AS entitlement_ends_at
       FROM users u
       JOIN companies c ON c.id = u.company_id
      WHERE u.id = $1
        AND COALESCE(u.is_active, TRUE) = TRUE
        AND COALESCE(NULLIF(to_jsonb(c)->>'is_active', '')::boolean, TRUE) = TRUE
      LIMIT 1`,
    [userId],
  );

  if (!result.rowCount) throw new Error('Authenticated account or company was not found');
  const row = result.rows[0];
  const companyId = String(row.company_id || '');
  if (!companyId || (claimedCompanyId && claimedCompanyId !== companyId)) {
    throw new Error('Authentication token does not match the current company');
  }

  return {
    id: String(row.id),
    companyId,
    role: String(row.role || ''),
    name: String(row.name || '').trim() || 'User',
    subscriptionStatus: String(row.subscription_status || 'inactive'),
    subscriptionTier: String(row.subscription_tier || 'trial'),
    subscriptionProvider: row.subscription_provider ? String(row.subscription_provider) : null,
    entitlementEndsAt: row.entitlement_ends_at ? new Date(row.entitlement_ends_at) : null,
  };
}

export function hasCompanyEntitlement(actor: SubscriptionActor, now = new Date()): boolean {
  if (hasComplimentaryAccess(actor.id, actor.companyId)) return true;
  if (!['active', 'trialing'].includes(actor.subscriptionStatus)) return false;
  if (!actor.entitlementEndsAt) return actor.subscriptionStatus === 'active';
  return Number.isFinite(actor.entitlementEndsAt.getTime())
    && actor.entitlementEndsAt.getTime() > now.getTime();
}

export const subscriptionGate = async (req: Request, res: Response, next: NextFunction) => {
  if (isPublicSubscriptionPath(req)) return next();

  try {
    const decoded = verifyToken(req);
    const actor = await loadSubscriptionActor(decoded.id, decoded.companyId);
    if (!hasCompanyEntitlement(actor)) {
      res.set('Cache-Control', 'no-store');
      return res.status(402).json({
        success: false,
        code: 'SUBSCRIPTION_REQUIRED',
        message: 'An active subscription or trial is required to use this feature.',
        subscription: {
          status: actor.subscriptionStatus,
          tier: actor.subscriptionTier,
          provider: actor.subscriptionProvider,
          currentPeriodEnd: actor.entitlementEndsAt?.toISOString() || null,
        },
      });
    }

    (req as any).user = decoded;
    (req as any).companyId = actor.companyId;
    res.locals.subscriptionActor = actor;
    res.set('Cache-Control', 'no-store');
    return next();
  } catch (error: any) {
    return res.status(401).json({
      success: false,
      code: 'AUTHENTICATION_REQUIRED',
      message: error?.message || 'Authentication is required',
    });
  }
};

// Import-compatible alias retained for older modules during staged upgrades.
export const trialCheck = subscriptionGate;
