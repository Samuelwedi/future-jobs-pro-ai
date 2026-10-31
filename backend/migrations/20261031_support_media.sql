BEGIN;
ALTER TABLE platform_support_messages ADD COLUMN IF NOT EXISTS attachment_id uuid;
CREATE TABLE IF NOT EXISTS support_attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 ticket_id text NOT NULL,
 filename text NOT NULL,
 mime_type text NOT NULL,
 size_bytes integer NOT NULL CHECK(size_bytes>0 AND size_bytes<=26214400),
 storage_public_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_attachments_ticket_idx ON support_attachments(ticket_id);
COMMIT;
