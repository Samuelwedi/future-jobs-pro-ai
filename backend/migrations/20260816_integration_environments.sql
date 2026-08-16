ALTER TABLE integrations
  ADD COLUMN IF NOT EXISTS environment TEXT,
  ADD COLUMN IF NOT EXISTS quickbooks_item_id TEXT;

CREATE INDEX IF NOT EXISTS integrations_company_provider_environment_idx
  ON integrations (company_id, provider, environment)
  WHERE is_active = TRUE;

-- Existing grants predate environment tracking. They intentionally remain NULL
-- and must be reconnected once to prevent test credentials being treated as live.
