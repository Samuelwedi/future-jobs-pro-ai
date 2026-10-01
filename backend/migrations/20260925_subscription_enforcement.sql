-- Company-level entitlement state consumed by the RC2 HTTP and WebSocket
-- gates. This migration is additive and safely carries forward a still-valid
-- legacy user trial without inventing a paid subscription.
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'trial';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'inactive';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_provider TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_updated_at TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS stripe_trial_used_at TIMESTAMPTZ;

WITH legacy_trials AS (
  SELECT company_id, MAX(trial_ends_at) AS trial_ends_at
    FROM users
   WHERE company_id IS NOT NULL
     AND trial_ends_at > NOW()
   GROUP BY company_id
)
UPDATE companies AS company
   SET subscription_tier = COALESCE(NULLIF(company.subscription_tier, ''), 'trial'),
       subscription_status = 'trialing',
       subscription_provider = COALESCE(NULLIF(company.subscription_provider, ''), 'internal'),
       subscription_expires_at = GREATEST(company.subscription_expires_at, legacy_trials.trial_ends_at),
       subscription_current_period_end = GREATEST(company.subscription_current_period_end, legacy_trials.trial_ends_at),
       subscription_updated_at = NOW(),
       stripe_trial_used_at = COALESCE(company.stripe_trial_used_at, NOW())
  FROM legacy_trials
 WHERE company.id = legacy_trials.company_id
   AND LOWER(COALESCE(company.subscription_status, 'inactive')) IN ('', 'inactive', 'trial')
   AND company.stripe_subscription_id IS NULL
   AND COALESCE(NULLIF(company.subscription_provider, ''), 'internal') = 'internal';

CREATE INDEX IF NOT EXISTS companies_subscription_status_idx
  ON companies(subscription_status, subscription_current_period_end);
