-- Additive upgrade: apply only to an existing Future Jobs Pro AI database.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS pay_period_anchor DATE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS payroll_week_start INTEGER NOT NULL DEFAULT 1 CHECK (payroll_week_start BETWEEN 0 AND 6);
CREATE TABLE IF NOT EXISTS command_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id),
 actor_id UUID NOT NULL REFERENCES users(id), kind TEXT NOT NULL, title TEXT NOT NULL,
 details JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS command_events_company_time ON command_events(company_id,created_at DESC);
CREATE TABLE IF NOT EXISTS expense_claims (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id),
 user_id UUID NOT NULL REFERENCES users(id), project_id UUID REFERENCES projects(id),
 vendor TEXT NOT NULL, amount NUMERIC(12,2) NOT NULL CHECK(amount>0), currency TEXT NOT NULL DEFAULT 'CAD',
 spent_on DATE NOT NULL, notes TEXT NOT NULL DEFAULT '', attachment_id UUID,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 reviewed_by UUID REFERENCES users(id), reviewed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS expense_claims_company_status ON expense_claims(company_id,status,created_at DESC);

ALTER TABLE lucy_conversations ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
CREATE INDEX IF NOT EXISTS lucy_conversation_company_actor ON lucy_conversations(company_id,user_id,created_at DESC);
