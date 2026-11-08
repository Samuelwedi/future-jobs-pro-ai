-- Additive only. Request tombstones must not be deleted or leased for retry:
-- a business write can commit before its response is durably recorded here.
BEGIN;
CREATE TABLE IF NOT EXISTS lucy_request_ledger (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_role TEXT NOT NULL CHECK (length(actor_role) BETWEEN 1 AND 80),
  request_id TEXT NOT NULL CHECK (request_id ~ '^[a-zA-Z0-9_.:-]{1,100}$'),
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  claim_token UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing','completed','uncertain','expired')),
  response_status INTEGER CHECK (response_status BETWEEN 200 AND 299),
  response_body JSONB CHECK (response_body IS NULL OR octet_length(response_body::text) <= 128000),
  error_code TEXT CHECK (error_code IN ('outcome_uncertain','response_expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  response_expires_at TIMESTAMPTZ,
  -- Role deliberately excluded: the same key cannot execute again after a role change.
  UNIQUE (company_id,user_id,request_id),
  CHECK ((status = 'completed' AND response_body IS NOT NULL AND response_status IS NOT NULL
    AND completed_at IS NOT NULL AND response_expires_at IS NOT NULL AND error_code IS NULL)
    OR (status <> 'completed' AND response_body IS NULL AND response_status IS NULL)),
  CHECK (status <> 'processing' OR (completed_at IS NULL AND error_code IS NULL))
);
CREATE INDEX IF NOT EXISTS lucy_request_ledger_expiry
  ON lucy_request_ledger(response_expires_at) WHERE status = 'completed';
COMMIT;
