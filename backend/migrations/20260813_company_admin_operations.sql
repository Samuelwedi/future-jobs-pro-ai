CREATE TABLE IF NOT EXISTS company_admin_audit_logs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 actor_id UUID NOT NULL REFERENCES users(id), employee_id UUID REFERENCES users(id), action VARCHAR(100) NOT NULL,
 details JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_company_admin_audit_company_created ON company_admin_audit_logs(company_id,created_at DESC);
