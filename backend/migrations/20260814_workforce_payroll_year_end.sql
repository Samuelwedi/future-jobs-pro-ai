ALTER TABLE companies ADD COLUMN IF NOT EXISTS legal_name VARCHAR(255);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS business_number VARCHAR(15);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS payroll_account_number VARCHAR(20);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS city VARCHAR(120);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS province VARCHAR(2) DEFAULT 'AB';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS postal_code VARCHAR(10);

ALTER TABLE users ADD COLUMN IF NOT EXISTS vacation_pay_rate DECIMAL(5,2) DEFAULT 4.00;
ALTER TABLE users ADD COLUMN IF NOT EXISTS vacation_pay_method VARCHAR(20) DEFAULT 'accrue';
ALTER TABLE users ADD COLUMN IF NOT EXISTS vacation_pay_balance DECIMAL(12,2) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS vacation_hours_balance DECIMAL(10,2) DEFAULT 0;

ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS vacation_pay DECIMAL(10,2) DEFAULT 0;

ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT 'draft';
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id);
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS correction_reason TEXT;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS corrected_by UUID REFERENCES users(id);
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS corrected_at TIMESTAMP;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS payroll_locked_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS time_entry_audit_logs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 time_entry_id UUID NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE, actor_id UUID NOT NULL REFERENCES users(id),
 action VARCHAR(50) NOT NULL, before_values JSONB NOT NULL DEFAULT '{}'::jsonb,
 after_values JSONB NOT NULL DEFAULT '{}'::jsonb, reason TEXT, created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_time_entry_audit_entry ON time_entry_audit_logs(time_entry_id,created_at DESC);
