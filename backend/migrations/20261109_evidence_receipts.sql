CREATE TABLE IF NOT EXISTS evidence_upload_receipts (
 company_id text NOT NULL, actor_id text NOT NULL, request_key text NOT NULL,
 fingerprint text NOT NULL, user_id text NOT NULL, project_id text NOT NULL, time_entry_id text,
 state text NOT NULL DEFAULT 'processing' CHECK (state IN ('processing','completed','uncertain')),
 response jsonb, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(company_id, actor_id, request_key)
);
