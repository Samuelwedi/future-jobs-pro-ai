-- Project assignments are planning data; do not use these rows as authorization.
CREATE TABLE IF NOT EXISTS project_roster (
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (company_id, project_id, user_id)
);
CREATE INDEX IF NOT EXISTS project_roster_user_idx ON project_roster(user_id);
CREATE INDEX IF NOT EXISTS project_roster_project_idx ON project_roster(project_id);
