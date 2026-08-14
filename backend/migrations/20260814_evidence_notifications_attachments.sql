CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shift_id UUID REFERENCES shifts(id) ON DELETE CASCADE,
  time_entry_id UUID REFERENCES time_entries(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  subject_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'general',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES tasks(id) ON DELETE CASCADE;

ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS subject_user_id UUID REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'general';

CREATE INDEX IF NOT EXISTS attachments_company_idx
  ON attachments(company_id);

CREATE INDEX IF NOT EXISTS attachments_shift_idx
  ON attachments(shift_id);

CREATE INDEX IF NOT EXISTS attachments_time_entry_idx
  ON attachments(time_entry_id);

CREATE INDEX IF NOT EXISTS attachments_project_idx
  ON attachments(project_id);

CREATE INDEX IF NOT EXISTS attachments_task_idx
  ON attachments(task_id);

CREATE INDEX IF NOT EXISTS attachments_subject_user_idx
  ON attachments(subject_user_id);

CREATE TABLE IF NOT EXISTS in_app_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  notification_type TEXT NOT NULL DEFAULT 'info',
  action_url TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS in_app_notifications_user_idx
  ON in_app_notifications(user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS in_app_notifications_company_idx
  ON in_app_notifications(company_id, created_at DESC);