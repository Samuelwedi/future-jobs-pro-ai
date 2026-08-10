BEGIN;

CREATE TABLE IF NOT EXISTS integrations (
  id BIGSERIAL PRIMARY KEY,
  company_id UUID NOT NULL,
  provider VARCHAR(32) NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  realm_id TEXT,
  stripe_account_id TEXT,
  token_expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, provider)
);

ALTER TABLE integrations ADD COLUMN IF NOT EXISTS access_token TEXT;
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS refresh_token TEXT;
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS realm_id TEXT;
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS stripe_account_id TEXT;
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE integrations ALTER COLUMN access_token DROP NOT NULL;
ALTER TABLE integrations ALTER COLUMN refresh_token DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS integrations_company_provider_uidx
  ON integrations (company_id, provider);
CREATE UNIQUE INDEX IF NOT EXISTS integrations_stripe_account_uidx
  ON integrations (stripe_account_id)
  WHERE stripe_account_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS integration_oauth_states (
  state_hash CHAR(64) PRIMARY KEY,
  company_id UUID NOT NULL,
  user_id UUID NOT NULL,
  provider VARCHAR(32) NOT NULL CHECK (provider IN ('quickbooks', 'stripe')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS integration_oauth_states_expiry_idx
  ON integration_oauth_states (expires_at);

CREATE TABLE IF NOT EXISTS integration_sync_mappings (
  id BIGSERIAL PRIMARY KEY,
  company_id UUID NOT NULL,
  source_provider VARCHAR(32) NOT NULL,
  source_type VARCHAR(64) NOT NULL,
  source_id TEXT NOT NULL,
  destination_provider VARCHAR(32) NOT NULL,
  destination_type VARCHAR(64) NOT NULL,
  destination_id TEXT NOT NULL,
  sync_hash TEXT,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, source_provider, source_type, source_id,
          destination_provider, destination_type)
);

DELETE FROM integration_oauth_states WHERE expires_at <= NOW();

COMMIT;
