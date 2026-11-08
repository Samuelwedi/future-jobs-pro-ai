-- Additive and unapplied. Processing also requires explicit environment opt-in.
BEGIN;
CREATE TABLE IF NOT EXISTS lucy_background_work (
 id UUID PRIMARY KEY, company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, actor_role TEXT NOT NULL,
 request_key TEXT NOT NULL CHECK(length(request_key) BETWEEN 1 AND 100),
 prompt TEXT NOT NULL CHECK(length(prompt) BETWEEN 1 AND 4000),
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','partial','failed','cancelled')),
 result JSONB, error TEXT, attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
 lease_token UUID, lease_until TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), completed_at TIMESTAMPTZ,
 UNIQUE(company_id,user_id,request_key)
);
CREATE INDEX IF NOT EXISTS lucy_background_work_claim ON lucy_background_work(status,created_at);
CREATE INDEX IF NOT EXISTS lucy_background_work_owner ON lucy_background_work(company_id,user_id,created_at);
COMMIT;
