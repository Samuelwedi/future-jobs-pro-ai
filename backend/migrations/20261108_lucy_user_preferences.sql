-- Additive, opt-in migration. Apply through the normal reviewed release process.
BEGIN;
CREATE TABLE IF NOT EXISTS lucy_user_preferences (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  preference_key TEXT NOT NULL,
  value TEXT NOT NULL CHECK (length(value) BETWEEN 1 AND 20),
  provenance TEXT NOT NULL DEFAULT 'explicit_user' CHECK (provenance='explicit_user'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(company_id,user_id,preference_key),
  CHECK (
    (preference_key='response_style' AND value IN ('concise','conversational','formal')) OR
    (preference_key='detail_level' AND value IN ('summary','balanced','detailed')) OR
    (preference_key='focus_area' AND value IN ('tasks','schedules','projects','approvals')) OR
    (preference_key='language' AND value IN ('en','es','fr','pt')) OR
    (preference_key='week_start' AND value IN ('monday','sunday')) OR
    (preference_key='time_format' AND value IN ('12h','24h'))
  ),
  CHECK (expires_at>created_at)
);
CREATE INDEX IF NOT EXISTS lucy_user_preferences_expiry ON lucy_user_preferences(expires_at);
COMMIT;
