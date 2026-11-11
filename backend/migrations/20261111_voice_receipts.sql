-- Additive and repeatable. Opt-in request keys share a namespace across audio
-- and transcript processing. Uncertain work is never automatically reclaimed.
CREATE TABLE IF NOT EXISTS voice_processing_receipts (
  company_id text NOT NULL,
  actor_id text NOT NULL,
  request_key text NOT NULL,
  fingerprint text NOT NULL,
  target jsonb NOT NULL,
  state text NOT NULL DEFAULT 'processing' CHECK (state IN ('processing','completed','uncertain')),
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(company_id,actor_id,request_key)
);
