-- Additive upgrade for the already-deployed Lucy workspace tables.
-- Old producers retain AI behavior; only explicit record_search opts into local reads.
BEGIN;
ALTER TABLE lucy_background_work ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'ai_research';
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='lucy_background_work'::regclass AND conname='lucy_background_work_mode_check') THEN
  ALTER TABLE lucy_background_work ADD CONSTRAINT lucy_background_work_mode_check CHECK (mode IN ('ai_research','record_search'));
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='lucy_background_work'::regclass AND conname='lucy_background_work_record_query_check') THEN
  ALTER TABLE lucy_background_work ADD CONSTRAINT lucy_background_work_record_query_check CHECK (mode <> 'record_search' OR length(prompt) BETWEEN 1 AND 200);
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS lucy_background_work_mode_claim ON lucy_background_work(mode,status,created_at);
COMMIT;
