-- Additive upgrade: older explicit-mode workers will not claim work_briefing jobs.
BEGIN;
ALTER TABLE lucy_background_work ADD COLUMN IF NOT EXISTS options JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE lucy_background_work DROP CONSTRAINT IF EXISTS lucy_background_work_mode_check;
ALTER TABLE lucy_background_work ADD CONSTRAINT lucy_background_work_mode_check CHECK (mode IN ('ai_research','record_search','work_briefing'));
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='lucy_background_work'::regclass AND conname='lucy_background_work_options_check') THEN
  ALTER TABLE lucy_background_work ADD CONSTRAINT lucy_background_work_options_check CHECK (
   jsonb_typeof(options)='object' AND (
    (mode<>'work_briefing' AND options='{}'::jsonb) OR
    (mode='work_briefing' AND options ?& ARRAY['from','to','taskStatus']
      AND options-ARRAY['from','to','taskStatus']='{}'::jsonb
      AND jsonb_typeof(options->'from')='string' AND jsonb_typeof(options->'to')='string'
      AND options->>'from' ~ '^\d{4}-\d{2}-\d{2}$' AND options->>'to' ~ '^\d{4}-\d{2}-\d{2}$'
      AND jsonb_typeof(options->'taskStatus')='string'
      AND options->>'taskStatus' IN ('open','pending','in_progress','completed','all') AND length(prompt)<=200)
   )
  );
 END IF;
END $$;
COMMIT;
