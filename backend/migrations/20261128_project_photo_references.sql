CREATE TABLE IF NOT EXISTS project_photo_references (
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  photo_id uuid NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  source_project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  copied_by uuid REFERENCES users(id) ON DELETE SET NULL,
  copied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, photo_id),
  CHECK (project_id <> source_project_id)
);
CREATE INDEX IF NOT EXISTS project_photo_refs_photo_idx ON project_photo_references(photo_id);
CREATE INDEX IF NOT EXISTS project_photo_refs_source_idx ON project_photo_references(source_project_id);
CREATE INDEX IF NOT EXISTS project_photo_refs_company_idx ON project_photo_references(company_id);
CREATE INDEX IF NOT EXISTS project_photo_refs_actor_idx ON project_photo_references(copied_by);

-- The source stays authoritative. A stale relationship after an ownership change is not readable.
CREATE OR REPLACE VIEW project_photo_inventory AS
SELECT p.id, p.company_id, p.project_id AS source_project_id, p.project_id AS album_project_id, NULL::uuid AS copied_by, NULL::timestamptz AS copied_at
FROM photos p JOIN projects album ON album.id=p.project_id AND album.company_id=p.company_id
UNION ALL
SELECT p.id, p.company_id, p.project_id AS source_project_id, r.project_id AS album_project_id, r.copied_by, r.copied_at
FROM project_photo_references r
JOIN photos p ON p.id=r.photo_id AND p.company_id=r.company_id AND p.project_id=r.source_project_id
JOIN projects source ON source.id=p.project_id AND source.company_id=p.company_id
JOIN projects album ON album.id=r.project_id AND album.company_id=p.company_id
WHERE p.file_type='image' AND p.project_id<>r.project_id;
