CREATE TABLE IF NOT EXISTS shift_attachment_previews (
  attachment_id uuid PRIMARY KEY REFERENCES attachments(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  jpeg bytea NOT NULL CHECK (octet_length(jpeg) BETWEEN 3 AND 262144
                          AND substring(jpeg FROM 1 FOR 3) = decode('ffd8ff','hex'))
);
CREATE INDEX IF NOT EXISTS shift_attachment_previews_company_idx ON shift_attachment_previews(company_id);
CREATE INDEX IF NOT EXISTS shift_attachment_previews_shift_idx ON shift_attachment_previews(shift_id);
