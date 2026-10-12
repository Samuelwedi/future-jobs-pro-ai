BEGIN;
ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS attachment_id uuid;
CREATE TABLE IF NOT EXISTS chat_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id text NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  uploader_id uuid NOT NULL REFERENCES users(id),
  filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 26214400),
  storage_public_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_attachments_room_idx ON chat_attachments(room_id);
COMMIT;
