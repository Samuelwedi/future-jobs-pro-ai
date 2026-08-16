BEGIN;

ALTER TABLE photos
  ADD COLUMN IF NOT EXISTS compliance_score SMALLINT,
  ADD COLUMN IF NOT EXISTS compliance_passed BOOLEAN,
  ADD COLUMN IF NOT EXISTS compliance_issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS compliance_suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS compliance_analysis JSONB,
  ADD COLUMN IF NOT EXISTS compliance_model TEXT,
  ADD COLUMN IF NOT EXISTS compliance_analyzed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_tags JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'photos_compliance_score_range'
      AND conrelid = 'photos'::regclass
  ) THEN
    ALTER TABLE photos
      ADD CONSTRAINT photos_compliance_score_range
      CHECK (compliance_score IS NULL OR compliance_score BETWEEN 0 AND 100);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_photos_company_project_compliance
  ON photos (company_id, project_id, compliance_score)
  WHERE compliance_score IS NOT NULL;

COMMENT ON COLUMN photos.compliance_score IS
  'Photo evidence quality/compliance score from 0 to 100; NULL means not analyzed.';

COMMIT;
