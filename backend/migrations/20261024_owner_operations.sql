BEGIN;
SELECT pg_advisory_xact_lock(7241025);
CREATE TABLE IF NOT EXISTS owner_operations_jobs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id UUID NOT NULL REFERENCES platform_support_agents(id),
 department TEXT NOT NULL CHECK (department IN ('lucy','sales','support','it')),
 instruction TEXT NOT NULL CHECK (length(instruction) BETWEEN 1 AND 4000),
 status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','review','accepted','dismissed','failed','cancelled')),
 result TEXT, error TEXT, model TEXT, input_tokens INTEGER, output_tokens INTEGER,
 scheduled_for TIMESTAMPTZ NOT NULL DEFAULT now(), started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS owner_ops_due ON owner_operations_jobs(status,scheduled_for);
CREATE TABLE IF NOT EXISTS owner_operations_schedules (
 owner_id UUID NOT NULL REFERENCES platform_support_agents(id),
 department TEXT NOT NULL CHECK (department IN ('lucy','sales','support','it')),
 enabled BOOLEAN NOT NULL DEFAULT false,
 interval_hours INTEGER NOT NULL DEFAULT 24 CHECK (interval_hours BETWEEN 6 AND 168),
 next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(owner_id,department)
);
CREATE TABLE IF NOT EXISTS owner_operations_audit (
 id BIGSERIAL PRIMARY KEY, owner_id UUID NOT NULL REFERENCES platform_support_agents(id),
 job_id UUID REFERENCES owner_operations_jobs(id), action TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE owner_operations_jobs ADD COLUMN IF NOT EXISTS ticket_id TEXT;
CREATE TABLE IF NOT EXISTS owner_sales_leads (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), owner_id UUID NOT NULL REFERENCES platform_support_agents(id),
 name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
 contact TEXT NOT NULL DEFAULT '' CHECK(length(contact)<=300),
 notes TEXT NOT NULL DEFAULT '' CHECK(length(notes)<=4000),
 stage TEXT NOT NULL DEFAULT 'new' CHECK(stage IN ('new','qualified','proposal','won','lost')),
 next_follow_up TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE owner_operations_jobs ADD COLUMN IF NOT EXISTS incident_id UUID;
CREATE TABLE IF NOT EXISTS owner_repair_jobs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id UUID NOT NULL REFERENCES platform_support_agents(id),
 incident_id UUID NOT NULL,
 scope TEXT NOT NULL CHECK(scope IN ('mobile-audio','support-portal')),
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','dispatching','running','deployed','awaiting_store','failed','blocked')),
 base_sha TEXT, workflow_run_id BIGINT, workflow_url TEXT, error TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), completed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS owner_repair_active_incident ON owner_repair_jobs(incident_id) WHERE status IN ('queued','dispatching','running');
ALTER TABLE owner_repair_jobs ADD COLUMN IF NOT EXISTS feature TEXT NOT NULL DEFAULT 'general';
ALTER TABLE owner_repair_jobs DROP CONSTRAINT IF EXISTS owner_repair_jobs_scope_check;
ALTER TABLE owner_repair_jobs ADD CONSTRAINT owner_repair_jobs_scope_check CHECK(scope IN ('mobile-audio','support-portal','backend','customer-web','mobile','portal-app','application'));
COMMIT;
