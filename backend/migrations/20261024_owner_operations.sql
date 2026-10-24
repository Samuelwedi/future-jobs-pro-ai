BEGIN;
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
COMMIT;
