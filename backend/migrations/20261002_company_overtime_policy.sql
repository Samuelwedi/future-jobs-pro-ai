-- Existing weekly thresholds/multipliers and all recorded pay remain unchanged.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS overtime_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS overtime_threshold_hours numeric DEFAULT 40;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS overtime_multiplier numeric DEFAULT 1.5;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS overtime_mode text NOT NULL DEFAULT 'weekly';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS overtime_daily_threshold_hours numeric NOT NULL DEFAULT 8;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS overtime_week_start integer NOT NULL DEFAULT 1;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'UTC';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS default_hourly_rate numeric DEFAULT 20;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='companies_overtime_policy_valid' AND conrelid='companies'::regclass) THEN
    ALTER TABLE companies ADD CONSTRAINT companies_overtime_policy_valid CHECK (
      overtime_mode IN ('daily','weekly','daily_weekly')
      AND overtime_daily_threshold_hours > 0 AND overtime_daily_threshold_hours <= 24
      AND overtime_week_start BETWEEN 0 AND 6
    );
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS company_overtime_policy_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  before_policy jsonb NOT NULL,
  after_policy jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS company_overtime_policy_audit_company ON company_overtime_policy_audit(company_id,created_at);
