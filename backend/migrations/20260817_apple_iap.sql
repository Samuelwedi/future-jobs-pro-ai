CREATE TABLE IF NOT EXISTS mobile_subscription_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('apple', 'google')),
  original_transaction_id TEXT NOT NULL,
  latest_transaction_id TEXT NOT NULL,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  product_id TEXT NOT NULL,
  plan_key TEXT NOT NULL CHECK (plan_key IN ('basic', 'professional', 'enterprise')),
  store_environment TEXT NOT NULL,
  status TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  last_notification_uuid TEXT,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, original_transaction_id)
);

CREATE INDEX IF NOT EXISTS mobile_subscription_company_idx
  ON mobile_subscription_transactions (company_id, provider, status);

CREATE UNIQUE INDEX IF NOT EXISTS mobile_subscription_apple_notification_idx
  ON mobile_subscription_transactions (last_notification_uuid)
  WHERE last_notification_uuid IS NOT NULL;
