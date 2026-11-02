CREATE TABLE IF NOT EXISTS commercial_delivery_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id),
 kind text NOT NULL CHECK(kind IN ('invoice','estimate')),record_id uuid NOT NULL,requested_by uuid NOT NULL REFERENCES users(id),
 request_key text NOT NULL,recipient text NOT NULL,fingerprint text NOT NULL,pdf bytea,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','sent','failed','uncertain','cancelled')),
 message_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),started_at timestamptz,completed_at timestamptz,
 UNIQUE(company_id,kind,record_id,request_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS commercial_delivery_one_pending ON commercial_delivery_jobs(kind,record_id) WHERE status IN ('queued','sending','uncertain');
CREATE INDEX IF NOT EXISTS commercial_delivery_queue ON commercial_delivery_jobs(created_at) WHERE status='queued';
