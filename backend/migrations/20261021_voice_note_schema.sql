-- Reconcile the original S3-era table with the Cloudinary voice endpoints.
-- Run before releasing the voice-route changes. Safe to run again.
BEGIN;
ALTER TABLE voice_notes
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id),
  ADD COLUMN IF NOT EXISTS audio_url TEXT,
  ADD COLUMN IF NOT EXISTS audio_s3_key TEXT,
  ADD COLUMN IF NOT EXISTS taken_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS folder_path TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB,
  ADD COLUMN IF NOT EXISTS structured_data JSONB,
  ADD COLUMN IF NOT EXISTS client_summary TEXT;
-- Transcript-only notes and Cloudinary notes have no S3 key.
ALTER TABLE voice_notes ALTER COLUMN audio_s3_key DROP NOT NULL;
UPDATE voice_notes vn SET company_id = u.company_id
FROM users u WHERE vn.user_id = u.id AND vn.company_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_voice_notes_company_project
  ON voice_notes(company_id, project_id);
COMMIT;
