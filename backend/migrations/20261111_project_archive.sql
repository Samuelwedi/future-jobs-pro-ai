-- Archive is independent of completion state. Existing projects remain visible.
BEGIN;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS projects_company_archive_idx ON projects (company_id, archived_at);
COMMIT;
